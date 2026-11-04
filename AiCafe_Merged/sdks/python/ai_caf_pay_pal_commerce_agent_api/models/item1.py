from __future__ import annotations

from pydantic import Field
from typing_extensions import TypedDict

from ..core import SdkBaseModel


class Item1(SdkBaseModel):
    """items."""

    product_id: str = Field(alias="productId")
    """product identifier (field)."""


class Item1Dict(TypedDict):
    product_id: str
