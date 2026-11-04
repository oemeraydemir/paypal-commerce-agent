from __future__ import annotations

from pydantic import Field
from typing_extensions import TypedDict

from ..core import SdkBaseModel


class Line(SdkBaseModel):
    """lines."""

    product_id: str = Field(alias="productId")
    """product identifier (field)."""

    name: str
    """name (field)."""

    quantity: int
    """quantity, a positive integer (field)."""

    unit_price_minor: int = Field(alias="unitPriceMinor")
    """unit price minor units (field)."""

    line_total_minor: int = Field(alias="lineTotalMinor")
    """line total in minor currency units (field)."""


class LineDict(TypedDict):
    product_id: str
    name: str
    quantity: int
    unit_price_minor: int
    line_total_minor: int
