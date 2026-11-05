from __future__ import annotations

from uuid import UUID

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, RFC3339DateTime, SdkBaseModel
from .enums.proposed_by import ProposedByOrStr
from .enums.status1 import Status1OrStr


class RefundRequestError(SdkBaseModel):
    """refund request."""

    id: UUID
    """unique identifier (field)."""

    order_id: str = Field(alias="orderId")
    """order identifier (field)."""

    amount_minor: int = Field(alias="amountMinor")
    """Amount in minor units (cents)."""

    currency: str
    """ISO 4217 currency code (e.g. EUR) (field)."""

    reason: str
    """explanation for this outcome (field)."""

    proposed_by: ProposedByOrStr = Field(alias="proposedBy")
    """proposed by (field)."""

    status: Status1OrStr
    """current status (field)."""

    paypal_refund_id: Optional[str] = Field(default=UNSET, alias="paypalRefundId")
    """paypal refund id (field)."""

    paypal_refund_status: Optional[str] = Field(default=UNSET, alias="paypalRefundStatus")
    """paypal refund status (field)."""

    last_error: Optional[str] = Field(default=UNSET, alias="lastError")
    """Set when PayPal could not process an approval; the request stays PROPOSED and can be retried safely."""

    created_at: RFC3339DateTime = Field(alias="createdAt")
    """creation timestamp (RFC 3339) (field)."""

    updated_at: RFC3339DateTime = Field(alias="updatedAt")
    """last update timestamp (RFC 3339) (field)."""

    decided_at: Optional[RFC3339DateTime] = Field(default=UNSET, alias="decidedAt")
    """time the request was decided (RFC 3339) (field)."""


class RefundRequestErrorDict(TypedDict):
    id: UUID
    order_id: str
    amount_minor: int
    currency: str
    reason: str
    proposed_by: ProposedByOrStr
    status: Status1OrStr
    paypal_refund_id: NotRequired[str]
    paypal_refund_status: NotRequired[str]
    last_error: NotRequired[str]
    created_at: RFC3339DateTime
    updated_at: RFC3339DateTime
    decided_at: NotRequired[RFC3339DateTime]
