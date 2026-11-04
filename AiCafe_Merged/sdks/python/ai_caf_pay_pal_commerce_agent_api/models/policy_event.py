from __future__ import annotations

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, OptionalNullable, RFC3339DateTime, SdkBaseModel
from .enums.decision import DecisionOrStr
from .policy_snapshot import PolicySnapshot, PolicySnapshotDict


class PolicyEvent(SdkBaseModel):
    """policy event."""

    id: Optional[str] = UNSET
    """unique identifier (field)."""

    timestamp: Optional[RFC3339DateTime] = UNSET
    """event timestamp (RFC 3339) (field)."""

    session_id: Optional[str] = Field(default=UNSET, alias="sessionId")
    """Public, non-reversible ref."""

    cart_id: Optional[str] = Field(default=UNSET, alias="cartId")
    """cart identifier (field)."""

    order_id: OptionalNullable[str] = Field(default=UNSET, alias="orderId")
    """order identifier (field)."""

    agent: Optional[str] = UNSET
    """agent (field)."""

    amount_minor: Optional[int] = Field(default=UNSET, alias="amountMinor")
    """amount in minor currency units (field)."""

    amount_formatted: Optional[str] = Field(default=UNSET, alias="amountFormatted")
    """amount formatted (field)."""

    currency: Optional[str] = UNSET
    """ISO 4217 currency code (e.g. EUR) (field)."""

    decision: Optional[DecisionOrStr] = UNSET
    """final policy decision (field)."""

    violated_rules: Optional[list[str]] = Field(default=UNSET, alias="violatedRules")
    """Identifiers of rules that were violated for this decision."""

    reason: Optional[str] = UNSET
    """explanation for this outcome (field)."""

    policy_snapshot: Optional[PolicySnapshot] = Field(default=UNSET, alias="policySnapshot")
    """Snapshot of the policy that was in effect, captured at decision time."""


class PolicyEventDict(TypedDict):
    id: NotRequired[str]
    timestamp: NotRequired[RFC3339DateTime]
    session_id: NotRequired[str]
    cart_id: NotRequired[str]
    order_id: NotRequired[str | None]
    agent: NotRequired[str]
    amount_minor: NotRequired[int]
    amount_formatted: NotRequired[str]
    currency: NotRequired[str]
    decision: NotRequired[DecisionOrStr]
    violated_rules: NotRequired[list[str]]
    reason: NotRequired[str]
    policy_snapshot: NotRequired[PolicySnapshotDict]
