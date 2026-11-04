from __future__ import annotations

from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel
from .order_item import OrderItem, OrderItemDict


class PolicyPreviewRequest(SdkBaseModel):
    """policy preview request."""

    items: Optional[list[OrderItem]] = UNSET
    """items (field)."""


class PolicyPreviewRequestDict(TypedDict):
    items: NotRequired[list[OrderItemDict]]
