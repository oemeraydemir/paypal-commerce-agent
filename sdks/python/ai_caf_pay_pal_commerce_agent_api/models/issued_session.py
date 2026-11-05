from __future__ import annotations

from uuid import UUID

from pydantic import Field
from typing_extensions import TypedDict

from ..core import RFC3339DateTime, SdkBaseModel


class IssuedSession(SdkBaseModel):
    """issued session."""

    session_id: UUID = Field(alias="sessionId")
    """session identifier (field)."""

    session_token: str = Field(alias="sessionToken")
    """Returned exactly once; present as Bearer token."""

    expires_at: RFC3339DateTime = Field(alias="expiresAt")
    """expiration timestamp (RFC 3339) (field)."""


class IssuedSessionDict(TypedDict):
    session_id: UUID
    session_token: str
    expires_at: RFC3339DateTime
