import asyncio
import hmac
import json
import re
import time
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import activity, chat, widgets
from .config import settings
from .documents import User
from .chat_timing import ChatTiming

router = APIRouter(prefix='/v1/widgets', tags=['website-widget'])


class Version(BaseModel):
    model_config = ConfigDict(extra='forbid')
    version: int = Field(ge=1)


@router.get('')
def get(user_id: User):
    return widgets.owner_get(user_id)


@router.put('')
def save(body: widgets.WidgetInput, user_id: User):
    return widgets.save(user_id, body)


@router.post('/publish')
def publish(body: Version, user_id: User):
    return widgets.publish(user_id, body.version)


@router.post('/pause')
def pause(body: Version, user_id: User):
    return widgets.pause(user_id, body.version)


def service(request: Request, x_widget_service_token: Annotated[str, Header()] = ''):
    expected = settings().backend_api_token
    if not expected or not hmac.compare_digest(x_widget_service_token, expected):
        raise HTTPException(401, 'Unauthorized')
    with widgets.transaction() as connection:
        widgets.limit(connection, 'api-ip:' + widgets.ip_bucket(request.headers.get('X-Widget-Client-IP', 'shared')[:200]), 240)


public = APIRouter(prefix='/v1/public/widgets', tags=['widget-visitors'], dependencies=[Depends(service)])
Site = Annotated[str, Header(alias='X-Widget-Site-Origin', max_length=500)]
Token = Annotated[str, Header(alias='X-Widget-Session', min_length=20, max_length=100)]
IP = Annotated[str, Header(alias='X-Widget-Client-IP', max_length=200)]


class Message(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    request_id: UUID
    message: str = Field(min_length=1, max_length=4000)


class Action(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    action: Literal['helpful', 'unhelpful', 'support', 'contact']
    name: str = Field(default='', max_length=100)
    email: str = Field(default='', max_length=254)

    @field_validator('email')
    @classmethod
    def email_address(cls, value):
        return widgets.WidgetInput.email(value)


@public.get('/{widget_id}/config')
def configuration(widget_id: UUID):
    return widgets.public_config(widget_id)


@public.post('/{widget_id}/sessions', status_code=201)
def new_session(widget_id: UUID, x_widget_site_origin: Site, x_widget_client_ip: IP = 'shared'):
    return widgets.new_session(widget_id, x_widget_site_origin, x_widget_client_ip)


@public.get('/{widget_id}/conversation')
def state(widget_id: UUID, x_widget_session: Token, x_widget_site_origin: Site):
    return widgets.public_state(widget_id, x_widget_session, x_widget_site_origin)


@public.post('/{widget_id}/actions')
def action(widget_id: UUID, body: Action, x_widget_session: Token, x_widget_site_origin: Site):
    return widgets.customer_action(widget_id, x_widget_session, x_widget_site_origin, body)


PUBLIC_ERROR = 'We could not complete your answer. Please retry in a moment or contact support.'


@public.post('/{widget_id}/messages')
async def message(widget_id: UUID, body: Message, request: Request, x_widget_session: Token,
                  x_widget_site_origin: Site, x_widget_client_ip: IP = 'shared'):
    timing = ChatTiming(body.request_id, phase='delivery', channel='widget')
    with timing.measure('prepare_ms'):
        prepared, agent, user_id, previous = await asyncio.to_thread(
            widgets.prepare, widget_id, x_widget_session, x_widget_site_origin, body, x_widget_client_ip)
    if previous:
        async def replay():
            state = await asyncio.to_thread(widgets.public_state, widget_id, x_widget_session, x_widget_site_origin)
            timing.finish(replayed=True)
            yield chat.event('done', {'id': previous['id'], 'text': previous['answer'], 'response_type': previous['response_type'],
                'conversation_id': state['conversation_id'], 'conversation_status': state['status']})
        return StreamingResponse(replay(), media_type='text/event-stream')

    async def generate():
        queue = asyncio.Queue(maxsize=100)
        task = asyncio.create_task(chat.answer(prepared, user_id, queue, agent))
        finalized, started = False, time.monotonic()
        try:
            yield chat.event('status', {'message': 'Thinking…'})
            while True:
                if await request.is_disconnected():
                    break
                if time.monotonic() - started > 110:
                    raise TimeoutError()
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=10)
                except TimeoutError:
                    yield ': heartbeat\n\n'
                    continue
                if item is None:
                    if not finalized:
                        raise RuntimeError('Answer ended without a final result')
                    break
                kind = item.split('\n', 1)[0]
                payload = json.loads(item.split('data: ', 1)[1])
                if kind == 'event: status':
                    yield chat.event('status', {'message': 'Searching knowledge…'})
                elif kind == 'event: error':
                    raise RuntimeError('Answer unavailable')
                elif kind == 'event: done':
                    # Recheck pause, domain revocation and knowledge access before delivery.
                    with timing.measure('finalization_ms'):
                        with timing.measure('delivery_access_ms'):
                            await asyncio.to_thread(widgets.validate_delivery, widget_id, x_widget_session,
                                x_widget_site_origin, agent, user_id, payload.get('citations', []))
                        text = re.sub(r'\[S\d+\]', '', payload['text']).strip()
                        if payload.get('response_type') in {'escalation', 'out_of_scope', 'insufficient_knowledge'}:
                            text = 'A member of the support team needs to help with this. You can leave your contact details below for follow-up.'
                        response_type = payload.get('response_type', 'answer')
                        await asyncio.to_thread(activity.finish_turn, prepared.conversation_id, prepared.request_id,
                            user_id, text=text, citations=[], response_type=response_type)
                    finalized = True
                    yield chat.event('done', {'id': str(prepared.request_id), 'text': text, 'response_type': response_type,
                        'conversation_id': str(prepared.conversation_id), 'conversation_status': activity.outcome(response_type)[0]})
                    break
        except asyncio.CancelledError:
            raise
        except Exception:
            await asyncio.to_thread(activity.finish_turn, prepared.conversation_id, prepared.request_id, user_id, error=PUBLIC_ERROR)
            finalized = True
            yield chat.event('error', {'error': PUBLIC_ERROR})
        finally:
            timing.finish(finalized=finalized)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            if not finalized:
                cleanup = asyncio.create_task(asyncio.to_thread(activity.finish_turn, prepared.conversation_id,
                    prepared.request_id, user_id, cancelled=True))
                await asyncio.shield(cleanup)
    return StreamingResponse(generate(), media_type='text/event-stream',
        headers={'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'})
