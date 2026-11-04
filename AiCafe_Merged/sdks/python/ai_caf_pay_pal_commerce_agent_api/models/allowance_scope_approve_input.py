from __future__ import annotations

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel


class AllowanceScopeApproveInput(SdkBaseModel):
    max_per_purchase_minor: Optional[int] = Field(default=UNSET, alias="maxPerPurchaseMinor")
    """Optional updated per-purchase cap."""

    daily_spend_limit_minor: Optional[int] = Field(default=UNSET, alias="dailySpendLimitMinor")
    """Optional updated daily cap."""


class AllowanceScopeApproveInputDict(TypedDict):
    max_per_purchase_minor: NotRequired[int]
    daily_spend_limit_minor: NotRequired[int]
