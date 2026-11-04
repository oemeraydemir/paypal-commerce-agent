from __future__ import annotations

from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel
from .enums.source import SourceOrStr
from .take_home_item import TakeHomeItem, TakeHomeItemDict


class TakeHomeResponse(SdkBaseModel):
    """take home response."""

    enabled: bool
    """False when CHANNEL3_API_KEY is not configured."""

    query: Optional[str] = UNSET
    """query (field)."""

    source: Optional[SourceOrStr] = UNSET
    """source (field)."""

    disclosure: Optional[str] = UNSET
    """disclosure (field)."""

    note: Optional[str] = UNSET
    """note (field)."""

    items: list[TakeHomeItem]
    """items (field)."""


class TakeHomeResponseDict(TypedDict):
    enabled: bool
    query: NotRequired[str]
    source: NotRequired[SourceOrStr]
    disclosure: NotRequired[str]
    note: NotRequired[str]
    items: list[TakeHomeItemDict]
