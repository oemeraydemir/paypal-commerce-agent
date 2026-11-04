from __future__ import annotations

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel


class ProposeRefundRequest(SdkBaseModel):
    """propose refund request."""

    order_id: str = Field(alias="orderId")
    """order identifier (field)."""

    amount_minor: Optional[int] = Field(default=UNSET, alias="amountMinor")
    """Optional partial refund; omit for the full remaining amount."""

    reason: str
    """explanation for this outcome (field)."""


class ProposeRefundRequestDict(TypedDict):
    order_id: str
    amount_minor: NotRequired[int]
    reason: str
