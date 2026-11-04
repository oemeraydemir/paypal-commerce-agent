from __future__ import annotations

from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel
from .policy_event import PolicyEvent, PolicyEventDict


class PolicyEventsResponse(SdkBaseModel):
    """policy events response."""

    events: Optional[list[PolicyEvent]] = UNSET
    """events (field)."""

    total: Optional[int] = UNSET
    """total (field)."""


class PolicyEventsResponseDict(TypedDict):
    events: NotRequired[list[PolicyEventDict]]
    total: NotRequired[int]
