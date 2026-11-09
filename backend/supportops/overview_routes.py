import asyncio
import json
import time
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict

from . import activity
from .documents import User

router = APIRouter(prefix='/v1/overview', tags=['overview'])
Outcome = Literal['in_progress', 'answered', 'needs_clarification', 'needs_attention', 'resolved', 'inactive']


@router.get('')
def overview(user_id: User, source: Literal['test', 'live'] = 'live',
             days: int = Query(7), agent_id: UUID | None = None,
             search: str = Query('', max_length=200), status: Outcome | None = None,
             page: int = Query(1, ge=1, le=100000), order: Literal['latest', 'oldest'] = 'latest',
             tz_offset: int = Query(0, ge=-840, le=840)):
    if days not in {1, 7, 30}:
        raise HTTPException(422, 'Choose Today, 7 days, or 30 days.')
    return activity.snapshot(user_id, source, days, agent_id, search.strip(), status, page, order, tz_offset)


@router.get('/events')
async def events(user_id: User, request: Request):
    async def generate():
        revision = None
        started = time.monotonic()
        while time.monotonic() - started < 95:
            if await request.is_disconnected():
                return
            current = await asyncio.to_thread(activity.revision, user_id)
            if revision != current:
                yield 'event: change\ndata: ' + json.dumps({'revision': current}) + '\n\n'
                revision = current
            else:
                yield ': heartbeat\n\n'
            await asyncio.sleep(2)
    return StreamingResponse(generate(), media_type='text/event-stream',
                             headers={'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'})


@router.get('/inbox')
def inbox(user_id: User, source: Literal['test', 'live'] = 'live', search: str = Query('', max_length=200),
          status: Outcome | None = None, page: int = Query(1, ge=1, le=100000), widget_only: bool = False):
    return activity.inbox(user_id, source, search.strip(), status, page, widget_only)


@router.get('/conversations/{conversation_id}')
def detail(conversation_id: UUID, user_id: User):
    return activity.detail(conversation_id, user_id)


class Resolution(BaseModel):
    model_config = ConfigDict(extra='forbid')
    resolved: bool


@router.patch('/conversations/{conversation_id}')
def resolve(conversation_id: UUID, body: Resolution, user_id: User):
    activity.set_resolution(conversation_id, user_id, body.resolved)
    return activity.detail(conversation_id, user_id)
