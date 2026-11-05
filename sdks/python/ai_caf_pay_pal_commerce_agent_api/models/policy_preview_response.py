from __future__ import annotations

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, OptionalNullable, SdkBaseModel
from .enums.decision import DecisionOrStr
from .policy_check import PolicyCheck, PolicyCheckDict
from .policy_limits import PolicyLimits, PolicyLimitsDict
from .transaction_passport import TransactionPassport, TransactionPassportDict
from .violation import Violation, ViolationDict


class PolicyPreviewResponse(SdkBaseModel):
    """policy preview response."""

    empty: Optional[bool] = UNSET
    """empty (field)."""

    decision: OptionalNullable[DecisionOrStr] = UNSET
    """final policy decision (field)."""

    reason: OptionalNullable[str] = UNSET
    """explanation for this outcome (field)."""

    suggestion: OptionalNullable[str] = UNSET
    """suggested next step for the shopper (field)."""

    requires_explicit_approval: Optional[bool] = Field(default=UNSET, alias="requiresExplicitApproval")
    """requires explicit approval (field)."""

    total_minor: Optional[int] = Field(default=UNSET, alias="totalMinor")
    """total in minor currency units (field)."""

    total_formatted: Optional[str] = Field(default=UNSET, alias="totalFormatted")
    """total formatted (field)."""

    currency: Optional[str] = UNSET
    """ISO 4217 currency code (e.g. EUR) (field)."""

    checks: Optional[list[PolicyCheck]] = UNSET
    """checks (field)."""

    violations: Optional[list[Violation]] = UNSET
    """Any policy violations that would be reported."""

    limits: Optional[PolicyLimits] = UNSET
    """policy limits."""

    enforced_by: Optional[str] = Field(default=UNSET, alias="enforcedBy")
    """enforced by (field)."""

    passport: Optional[TransactionPassport] = UNSET
    """Read-only, server-derived explanation of one prepared cart. Not a payment record, never stored or signed; payment
    authority is always the shopper."""


class PolicyPreviewResponseDict(TypedDict):
    empty: NotRequired[bool]
    decision: NotRequired[DecisionOrStr | None]
    reason: NotRequired[str | None]
    suggestion: NotRequired[str | None]
    requires_explicit_approval: NotRequired[bool]
    total_minor: NotRequired[int]
    total_formatted: NotRequired[str]
    currency: NotRequired[str]
    checks: NotRequired[list[PolicyCheckDict]]
    violations: NotRequired[list[ViolationDict]]
    limits: NotRequired[PolicyLimitsDict]
    enforced_by: NotRequired[str]
    passport: NotRequired[TransactionPassportDict]
