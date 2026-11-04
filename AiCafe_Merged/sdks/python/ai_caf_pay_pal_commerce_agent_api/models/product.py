from __future__ import annotations

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel


class Product(SdkBaseModel):
    """product."""

    id: Optional[str] = UNSET
    """unique identifier (field)."""

    name: Optional[str] = UNSET
    """name (field)."""

    description: Optional[str] = UNSET
    """description (field)."""

    price_minor: Optional[int] = Field(default=UNSET, alias="priceMinor")
    """Price in minor units (e.g. cents)."""

    currency: Optional[str] = UNSET
    """ISO 4217 currency code (e.g. EUR) (field)."""

    dietary: Optional[list[str]] = UNSET
    """e.g. vegan, vegetarian, gluten-free"""

    tags: Optional[list[str]] = UNSET
    """tags (field)."""

    category: Optional[str] = UNSET
    """category (field)."""

    occasion: Optional[list[str]] = UNSET
    """occasion (field)."""


class ProductDict(TypedDict):
    id: NotRequired[str]
    name: NotRequired[str]
    description: NotRequired[str]
    price_minor: NotRequired[int]
    currency: NotRequired[str]
    dietary: NotRequired[list[str]]
    tags: NotRequired[list[str]]
    category: NotRequired[str]
    occasion: NotRequired[list[str]]
