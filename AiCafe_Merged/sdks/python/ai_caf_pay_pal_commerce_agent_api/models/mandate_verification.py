from __future__ import annotations

from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel
from .checks import Checks, ChecksDict


class MandateVerification(SdkBaseModel):
    """mandate verification."""

    valid: Optional[bool] = UNSET
    """whether the verification passed (field)."""

    checks: Optional[Checks] = UNSET
    """checks."""

    reason: Optional[str] = UNSET
    """explanation for this outcome (field)."""


class MandateVerificationDict(TypedDict):
    valid: NotRequired[bool]
    checks: NotRequired[ChecksDict]
    reason: NotRequired[str]
