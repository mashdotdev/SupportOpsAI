"""Owned agent configuration and document permissions. Prisma owns the schema."""
from typing import Literal
from uuid import UUID, uuid4

from fastapi import HTTPException
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .db import transaction


class Authority(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    scope: str = Field(min_length=1, max_length=3000)
    communication_style: str = Field(min_length=1, max_length=2000)
    boundaries: str = Field(min_length=1, max_length=3000)
    escalation_rules: str = Field(min_length=1, max_length=3000)
    escalation_message: str = Field(min_length=1, max_length=1500)


class AgentInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=100)
    model_id: str = Field(min_length=1, max_length=200)
    instructions: str = Field(min_length=1, max_length=10000)
    authority: Authority
    knowledge_mode: Literal["all", "selected"] = "all"
    document_ids: list[UUID] = Field(default_factory=list, max_length=200)
    slack_notifications: bool = False
    slack_test_delivery: bool = False

    @field_validator("document_ids")
    @classmethod
    def unique_documents(cls, value):
        return list(dict.fromkeys(value))

    @model_validator(mode="after")
    def clear_all_documents(self):
        if self.knowledge_mode == "all":
            self.document_ids = []
        if not self.slack_notifications:
            self.slack_test_delivery = False
        return self


class AgentUpdate(AgentInput):
    version: int = Field(ge=1)


def serialize(row):
    return {key: str(value) if key in {"id", "created_at", "updated_at"} else value
            for key, value in row.items() if key != "user_id"}


def find(connection, agent_id, user_id, *, lock=False):
    row = connection.execute("SELECT * FROM ai_agents WHERE id=%s AND user_id=%s" +
                             (" FOR UPDATE" if lock else ""), (agent_id, user_id)).fetchone()
    if not row:
        raise HTTPException(404, "Agent not found.")
    row["document_ids"] = [str(item["document_id"]) for item in connection.execute(
        "SELECT document_id FROM ai_agent_documents WHERE agent_id=%s AND user_id=%s ORDER BY document_id",
        (agent_id, user_id)).fetchall()]
    return row


def get_agent(agent_id, user_id):
    with transaction() as connection:
        return find(connection, agent_id, user_id)


def check_documents(connection, document_ids, user_id):
    if not document_ids:
        return
    rows = connection.execute("""SELECT id FROM knowledge_documents WHERE user_id=%s
        AND id=ANY(%s::uuid[]) AND status NOT IN ('deleting','deleted') FOR SHARE""",
        (user_id, document_ids)).fetchall()
    if len(rows) != len(document_ids):
        raise HTTPException(422, "Some selected documents are unavailable or do not belong to you. Refresh and select them again.")


def save_agent(body, user_id, agent_id=None):
    with transaction() as connection:
        if agent_id:
            previous = find(connection, agent_id, user_id, lock=True)
            if previous["version"] != body.version:
                raise HTTPException(409, "This agent was changed in another session. Reload it before saving again.")
        check_documents(connection, body.document_ids, user_id)
        if body.slack_notifications:
            destination = connection.execute('SELECT enabled,secret FROM slack_connections WHERE user_id=%s', (user_id,)).fetchone()
            if not destination or not destination['enabled'] or not destination['secret']:
                raise HTTPException(422, 'Connect and enable Slack in Tools & Integrations first.')
        values = (body.name, body.model_id, body.instructions, Jsonb(body.authority.model_dump()), body.knowledge_mode)
        if agent_id:
            connection.execute("""UPDATE ai_agents SET name=%s,model_id=%s,instructions=%s,authority=%s,
                knowledge_mode=%s,version=version+1,updated_at=now() WHERE id=%s AND user_id=%s""",
                (*values, agent_id, user_id))
            connection.execute("DELETE FROM ai_agent_documents WHERE agent_id=%s AND user_id=%s", (agent_id, user_id))
        else:
            agent_id = uuid4()
            connection.execute("""INSERT INTO ai_agents (name,model_id,instructions,authority,knowledge_mode,id,user_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s)""", (*values, agent_id, user_id))
        for document_id in body.document_ids:
            connection.execute("INSERT INTO ai_agent_documents (agent_id,document_id,user_id) VALUES (%s,%s,%s)",
                               (agent_id, document_id, user_id))
        connection.execute('UPDATE ai_agents SET slack_notifications=%s,slack_test_delivery=%s WHERE id=%s AND user_id=%s',
                           (body.slack_notifications, body.slack_test_delivery, agent_id, user_id))
        return serialize(find(connection, agent_id, user_id))


def current_document_scope(agent_id, user_id, version):
    """Recheck scope on every search/finalization, including concurrent edits/deletes."""
    row = get_agent(agent_id, user_id)
    if row["version"] != version:
        raise ValueError("This agent changed while answering. Start a fresh conversation using the saved configuration.")
    return None if row["knowledge_mode"] == "all" else row["document_ids"]
