from __future__ import annotations

from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel
from .preferences import Preferences, PreferencesDict


class AiChatRequest(SdkBaseModel):
    """aichat request."""

    message: str
    """human-readable message (field)."""

    preferences: Optional[Preferences] = UNSET
    """preferences."""


class AiChatRequestDict(TypedDict):
    message: str
    preferences: NotRequired[PreferencesDict]
