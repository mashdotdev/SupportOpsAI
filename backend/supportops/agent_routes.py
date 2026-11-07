import asyncio
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import Field

from . import agent_models, agent_store
from .chat import ChatInput, tracked_response
from .db import transaction
from .documents import User

router = APIRouter(prefix="/v1/agents", tags=["agents"])


@router.get("/models")
async def models(user_id: User):
    try:
        return {"models": await agent_models.list_models()}
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from error


@router.get("")
def list_agents(user_id: User):
    with transaction() as connection:
        rows = connection.execute("""SELECT a.*, COALESCE((SELECT jsonb_agg(d.document_id ORDER BY d.document_id)
            FROM ai_agent_documents d WHERE d.agent_id=a.id AND d.user_id=a.user_id), '[]'::jsonb) AS document_ids
            FROM ai_agents a WHERE user_id=%s ORDER BY updated_at DESC, id DESC LIMIT 200""", (user_id,)).fetchall()
    return {"agents": [agent_store.serialize(row) for row in rows]}


async def validate_model(model_id):
    try:
        await agent_models.validate_model(model_id)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from error


@router.post("", status_code=201)
async def create(body: agent_store.AgentInput, user_id: User):
    await validate_model(body.model_id)
    return {"agent": await asyncio.to_thread(agent_store.save_agent, body, user_id)}


@router.get("/{agent_id}")
def get(agent_id: UUID, user_id: User):
    return {"agent": agent_store.serialize(agent_store.get_agent(agent_id, user_id))}


@router.patch("/{agent_id}")
async def update(agent_id: UUID, body: agent_store.AgentUpdate, user_id: User):
    # Check ownership before contacting the model provider.
    await asyncio.to_thread(agent_store.get_agent, agent_id, user_id)
    await validate_model(body.model_id)
    return {"agent": await asyncio.to_thread(agent_store.save_agent, body, user_id, agent_id)}


@router.delete("/{agent_id}", status_code=204)
def delete(agent_id: UUID, user_id: User):
    with transaction() as connection:
        agent_store.find(connection, agent_id, user_id, lock=True)
        connection.execute("DELETE FROM ai_agents WHERE id=%s AND user_id=%s", (agent_id, user_id))


class AgentChatInput(ChatInput):
    version: int = Field(ge=1)


@router.post("/{agent_id}/chat")
async def chat(agent_id: UUID, body: AgentChatInput, user_id: User, request: Request):
    agent = await asyncio.to_thread(agent_store.get_agent, agent_id, user_id)
    if body.version != agent["version"]:
        raise HTTPException(409, "This agent has changed. Reload its saved configuration and start a fresh conversation.")
    return await tracked_response(body, user_id, request, agent)
