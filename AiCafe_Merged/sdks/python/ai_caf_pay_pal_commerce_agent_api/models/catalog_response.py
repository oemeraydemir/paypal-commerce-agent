from __future__ import annotations

from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel
from .product import Product, ProductDict


class CatalogResponse(SdkBaseModel):
    """catalog response."""

    count: Optional[int] = UNSET
    """number of items (field)."""

    products: Optional[list[Product]] = UNSET
    """products (field)."""


class CatalogResponseDict(TypedDict):
    count: NotRequired[int]
    products: NotRequired[list[ProductDict]]
