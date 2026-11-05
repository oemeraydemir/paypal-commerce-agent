from __future__ import annotations

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, OptionalNullable, SdkBaseModel


class TakeHomeItem(SdkBaseModel):
    """take home item."""

    id: str
    """unique identifier (field)."""

    title: str
    """title (field)."""

    brand: OptionalNullable[str] = UNSET
    """brand (field)."""

    image_url: OptionalNullable[str] = Field(default=UNSET, alias="imageUrl")
    """image url (field)."""

    merchant_domain: OptionalNullable[str] = Field(default=UNSET, alias="merchantDomain")
    """merchant domain (field)."""

    price: OptionalNullable[float] = UNSET
    """price (field)."""

    currency: OptionalNullable[str] = UNSET
    """ISO 4217 currency code (e.g. EUR) (field)."""

    availability: OptionalNullable[str] = UNSET
    """availability (field)."""

    url: str
    """https URL of the retailer page. Outbound link only."""


class TakeHomeItemDict(TypedDict):
    id: str
    title: str
    brand: NotRequired[str | None]
    image_url: NotRequired[str | None]
    merchant_domain: NotRequired[str | None]
    price: NotRequired[float | None]
    currency: NotRequired[str | None]
    availability: NotRequired[str | None]
    url: str
