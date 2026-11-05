from __future__ import annotations

from pydantic import Field
from typing_extensions import TypedDict

from ..core import SdkBaseModel


class OrderItem(SdkBaseModel):
    """order item."""

    product_id: str = Field(alias="productId")
    """product identifier (field)."""

    quantity: int
    """quantity, a positive integer (field)."""


class OrderItemDict(TypedDict):
    product_id: str
    quantity: int
