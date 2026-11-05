from __future__ import annotations

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, RFC3339DateTime, SdkBaseModel
from .enums.origin import OriginOrStr
from .order_item import OrderItem, OrderItemDict


class Order(SdkBaseModel):
    """order."""

    id: Optional[str] = UNSET
    """unique identifier (field)."""

    session_id: Optional[str] = Field(default=UNSET, alias="sessionId")
    """Public, non-reversible ref."""

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

    item_count: Optional[int] = Field(default=UNSET, alias="itemCount")
    """item count (field)."""

    created_at: Optional[RFC3339DateTime] = Field(default=UNSET, alias="createdAt")
    """creation timestamp (RFC 3339) (field)."""

    updated_at: Optional[RFC3339DateTime] = Field(default=UNSET, alias="updatedAt")
    """last update timestamp (RFC 3339) (field)."""

    items: Optional[list[OrderItem]] = UNSET
    """items (field)."""


class OrderDict(TypedDict):
    id: NotRequired[str]
    session_id: NotRequired[str]
    status: NotRequired[str]
    origin: NotRequired[OriginOrStr]
    total_minor: NotRequired[int]
    total_formatted: NotRequired[str]
    currency: NotRequired[str]
    item_count: NotRequired[int]
    created_at: NotRequired[RFC3339DateTime]
    updated_at: NotRequired[RFC3339DateTime]
    items: NotRequired[list[OrderItemDict]]
