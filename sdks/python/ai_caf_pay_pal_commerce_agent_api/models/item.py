from __future__ import annotations

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel


class Item(SdkBaseModel):
    """A single validated cart line."""

    product_id: Optional[str] = Field(default=UNSET, alias="productId")
    """Product identifier."""

    name: Optional[str] = UNSET
    """Product name."""

    quantity: Optional[int] = UNSET
    """Quantity."""

    unit_price_minor: Optional[int] = Field(default=UNSET, alias="unitPriceMinor")
    """Unit price in minor units."""

    unit_price_formatted: Optional[str] = Field(default=UNSET, alias="unitPriceFormatted")
    """Formatted unit price."""

    line_total_minor: Optional[int] = Field(default=UNSET, alias="lineTotalMinor")
    """Line total in minor units."""

    line_total_formatted: Optional[str] = Field(default=UNSET, alias="lineTotalFormatted")
    """Formatted line total."""


class ItemDict(TypedDict):
    product_id: NotRequired[str]
    name: NotRequired[str]
    quantity: NotRequired[int]
    unit_price_minor: NotRequired[int]
    unit_price_formatted: NotRequired[str]
    line_total_minor: NotRequired[int]
    line_total_formatted: NotRequired[str]
