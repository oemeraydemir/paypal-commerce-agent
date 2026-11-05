from __future__ import annotations

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, OptionalNullable, SdkBaseModel
from .enums.origin import OriginOrStr


class CreateOrderResponse(SdkBaseModel):
    """create order response."""

    order_id: Optional[str] = Field(default=UNSET, alias="orderId")
    """order identifier (field)."""

    paypal_order_id: Optional[str] = Field(default=UNSET, alias="paypalOrderId")
    """paypal order id (field)."""

    status: Optional[str] = UNSET
    """current status (field)."""

    origin: Optional[OriginOrStr] = UNSET
    """how the order was created (field)."""

    total_minor: Optional[int] = Field(default=UNSET, alias="totalMinor")
    """total in minor currency units (field)."""

    total_formatted: Optional[str] = Field(default=UNSET, alias="totalFormatted")
    """total formatted (field)."""

    currency: Optional[str] = UNSET
    """ISO 4217 currency code (e.g. EUR) (field)."""

    approval_url: OptionalNullable[str] = Field(default=UNSET, alias="approvalUrl")
    """approval url (field)."""


class CreateOrderResponseDict(TypedDict):
    order_id: NotRequired[str]
    paypal_order_id: NotRequired[str]
    status: NotRequired[str]
    origin: NotRequired[OriginOrStr]
    total_minor: NotRequired[int]
    total_formatted: NotRequired[str]
    currency: NotRequired[str]
    approval_url: NotRequired[str | None]
