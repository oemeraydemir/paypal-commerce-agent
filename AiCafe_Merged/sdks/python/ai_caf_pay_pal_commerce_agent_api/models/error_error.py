from __future__ import annotations

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel
from .enums.policy_decision2 import PolicyDecision2OrStr
from .violation import Violation, ViolationDict


class ErrorError(SdkBaseModel):
    """error."""

    error: Optional[str] = UNSET
    """error (field)."""

    message: Optional[str] = UNSET
    """human-readable message (field)."""

    code: Optional[str] = UNSET
    """code (field)."""

    policy_decision: Optional[PolicyDecision2OrStr] = Field(default=UNSET, alias="policyDecision")
    """policy decision (field)."""

    violations: Optional[list[Violation]] = UNSET
    """Any policy violations that would be reported."""

    reason: Optional[str] = UNSET
    """explanation for this outcome (field)."""

    suggestion: Optional[str] = UNSET
    """suggested next step for the shopper (field)."""


class ErrorErrorDict(TypedDict):
    error: NotRequired[str]
    message: NotRequired[str]
    code: NotRequired[str]
    policy_decision: NotRequired[PolicyDecision2OrStr]
    violations: NotRequired[list[ViolationDict]]
    reason: NotRequired[str]
    suggestion: NotRequired[str]
