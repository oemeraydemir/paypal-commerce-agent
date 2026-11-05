from __future__ import annotations

from typing_extensions import TypedDict

from ..core import SdkBaseModel
from .order_item import OrderItem, OrderItemDict


class CreateOrderRequest(SdkBaseModel):
    """create order request."""

    items: list[OrderItem]
    """items (field)."""


class CreateOrderRequestDict(TypedDict):
    items: list[OrderItemDict]
