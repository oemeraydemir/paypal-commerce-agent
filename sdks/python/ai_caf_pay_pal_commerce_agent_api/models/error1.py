from __future__ import annotations

from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel


class Error1(SdkBaseModel):
    """error."""

    code: Optional[int] = UNSET
    """code (field)."""

    message: Optional[str] = UNSET
    """human-readable message (field)."""


class Error1Dict(TypedDict):
    code: NotRequired[int]
    message: NotRequired[str]
