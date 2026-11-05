from __future__ import annotations

from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel
from .enums.status import StatusOrStr


class PolicyCheck(SdkBaseModel):
    """policy check."""

    rule: Optional[str] = UNSET
    """rule (field)."""

    label: Optional[str] = UNSET
    """label (field)."""

    status: Optional[StatusOrStr] = UNSET
    """current status (field)."""

    detail: Optional[str] = UNSET
    """detail (field)."""


class PolicyCheckDict(TypedDict):
    rule: NotRequired[str]
    label: NotRequired[str]
    status: NotRequired[StatusOrStr]
    detail: NotRequired[str]
