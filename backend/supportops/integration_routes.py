from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .documents import User
from . import notifications

router = APIRouter(prefix='/v1/integrations', tags=['integrations'])


class SlackInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=100)
    destination: str = Field(min_length=1, max_length=100)
    webhook_url: str | None = Field(default=None, max_length=500)
    enabled: bool = True
    version: int | None = Field(default=None, ge=1)

    @field_validator('webhook_url')
    @classmethod
    def validate_url(cls, value):
        return notifications.webhook_url(value) if value else None


@router.get('/slack')
def slack(user_id: User):
    return notifications.get_connection(user_id)


@router.put('/slack')
def save(body: SlackInput, user_id: User):
    return notifications.save_connection(user_id, body)


@router.delete('/slack')
def remove(user_id: User):
    return notifications.disconnect(user_id)


@router.post('/slack/test')
def test(user_id: User):
    return notifications.test_connection(user_id)


@router.get('/history')
def history(user_id: User, page: int = Query(1, ge=1, le=100000), search: str = Query('', max_length=200),
            status: Literal['simulated','queued','sending','sent','failed','unknown','cancelled'] | None = None,
            source: Literal['live','test'] | None = None):
    return notifications.history(user_id, page, search.strip(), status, source)


class NotifyInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    deliver: bool = False


@router.post('/conversations/{conversation_id}/notify')
def notify(conversation_id: UUID, body: NotifyInput, user_id: User):
    return notifications.notify_conversation(conversation_id, user_id, body.deliver)
