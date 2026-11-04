from __future__ import annotations

from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel
from .order import Order, OrderDict


class OrdersListResponse(SdkBaseModel):
    """orders list response."""

    orders: Optional[list[Order]] = UNSET
    """orders (field)."""

    total: Optional[int] = UNSET
    """total (field)."""

    returned: Optional[int] = UNSET
    """returned (field)."""


class OrdersListResponseDict(TypedDict):
    orders: NotRequired[list[OrderDict]]
    total: NotRequired[int]
    returned: NotRequired[int]
