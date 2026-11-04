from __future__ import annotations

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel


class PolicyEventsStats(SdkBaseModel):
    """policy events stats."""

    total_requests: Optional[int] = Field(default=UNSET, alias="totalRequests")
    """total requests (field)."""

    allowed: Optional[int] = UNSET
    """allowed (field)."""

    blocked: Optional[int] = UNSET
    """blocked (field)."""

    spent_minor: Optional[int] = Field(default=UNSET, alias="spentMinor")
    """spent minor units (field)."""

    spent_formatted: Optional[str] = Field(default=UNSET, alias="spentFormatted")
    """spent formatted (field)."""


class PolicyEventsStatsDict(TypedDict):
    total_requests: NotRequired[int]
    allowed: NotRequired[int]
    blocked: NotRequired[int]
    spent_minor: NotRequired[int]
    spent_formatted: NotRequired[str]
