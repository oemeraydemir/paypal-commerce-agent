from __future__ import annotations

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel
from .enums.limit_set_by import LimitSetByOrStr
from .enums.prices_source import PricesSourceOrStr


class Basis(SdkBaseModel):
    """basis."""

    prices_source: Optional[PricesSourceOrStr] = Field(default=UNSET, alias="pricesSource")
    """prices source (field)."""

    client_prices_ignored: Optional[bool] = Field(default=UNSET, alias="clientPricesIgnored")
    """client prices ignored (field)."""

    limit_set_by: Optional[LimitSetByOrStr] = Field(default=UNSET, alias="limitSetBy")
    """limit set by (field)."""


class BasisDict(TypedDict):
    prices_source: NotRequired[PricesSourceOrStr]
    client_prices_ignored: NotRequired[bool]
    limit_set_by: NotRequired[LimitSetByOrStr]
