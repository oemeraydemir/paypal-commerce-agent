from __future__ import annotations

from dataclasses import dataclass

from .core import AsyncAuthScheme, AuthScheme


@dataclass(frozen=True, slots=True, kw_only=True)
class AuthSchemes:
    session_id: AuthScheme
    bearer_auth: AuthScheme
    ops_key: AuthScheme


@dataclass(frozen=True, slots=True, kw_only=True)
class AsyncAuthSchemes:
    session_id: AsyncAuthScheme
    bearer_auth: AsyncAuthScheme
    ops_key: AsyncAuthScheme
