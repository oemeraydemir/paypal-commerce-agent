from __future__ import annotations

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel
from .enums.policy_decision import PolicyDecisionOrStr
from .item import Item, ItemDict
from .violation import Violation, ViolationDict


class PreparedCart(SdkBaseModel):
    """The validated, server-priced cart prepared by the agent; null when none was prepared."""

    items: Optional[list[Item]] = UNSET
    """The validated cart lines with authoritative pricing."""

    total_minor: Optional[int] = Field(default=UNSET, alias="totalMinor")
    """Cart total in minor units."""

    total_formatted: Optional[str] = Field(default=UNSET, alias="totalFormatted")
    """Formatted cart total."""

    currency: Optional[str] = UNSET
    """ISO 4217 currency code."""

    cart_id: Optional[str] = Field(default=UNSET, alias="cartId")
    """Deterministic cart identifier."""

    message: Optional[str] = UNSET
    """Human-readable summary."""

    policy_decision: Optional[PolicyDecisionOrStr] = Field(default=UNSET, alias="policyDecision")
    """The authoritative policy decision for a cart."""

    policy_violations: Optional[list[Violation]] = Field(default=UNSET, alias="policyViolations")
    """Any policy violations found."""

    requires_explicit_approval: Optional[bool] = Field(default=UNSET, alias="requiresExplicitApproval")
    """True when human approval is required."""

    retry_suggested: Optional[bool] = Field(default=UNSET, alias="retrySuggested")
    """True when an alternative cart is suggested."""

    reason: Optional[str] = UNSET
    """Outcome explanation."""


class PreparedCartDict(TypedDict):
    items: NotRequired[list[ItemDict]]
    total_minor: NotRequired[int]
    total_formatted: NotRequired[str]
    currency: NotRequired[str]
    cart_id: NotRequired[str]
    message: NotRequired[str]
    policy_decision: NotRequired[PolicyDecisionOrStr]
    policy_violations: NotRequired[list[ViolationDict]]
    requires_explicit_approval: NotRequired[bool]
    retry_suggested: NotRequired[bool]
    reason: NotRequired[str]
