from __future__ import annotations

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel


class Mandate(SdkBaseModel):
    """mandate."""

    max_per_purchase_minor: Optional[int] = Field(default=UNSET, alias="maxPerPurchaseMinor")
    """max per-purchase minor units (field)."""

    approval_threshold_minor: Optional[int] = Field(default=UNSET, alias="approvalThresholdMinor")
    """approval threshold minor units (field)."""

    cart_minor: Optional[int] = Field(default=UNSET, alias="cartMinor")
    """cart minor units (field)."""

    remaining_minor: Optional[int] = Field(default=UNSET, alias="remainingMinor")
    """Negative when the cart is over the limit."""

    used_percent: Optional[int] = Field(default=UNSET, alias="usedPercent")
    """used percent (field)."""

    threshold_percent: Optional[int] = Field(default=UNSET, alias="thresholdPercent")
    """0..100 position of the approval threshold on the limit bar (server-computed; clients only draw it)."""

    daily_remaining_minor: Optional[int] = Field(default=UNSET, alias="dailyRemainingMinor")
    """daily remaining minor units (field)."""

    ai_can_change_limit: Optional[bool] = Field(default=UNSET, alias="aiCanChangeLimit")
    """AI can change limit (field)."""


class MandateDict(TypedDict):
    max_per_purchase_minor: NotRequired[int]
    approval_threshold_minor: NotRequired[int]
    cart_minor: NotRequired[int]
    remaining_minor: NotRequired[int]
    used_percent: NotRequired[int]
    threshold_percent: NotRequired[int]
    daily_remaining_minor: NotRequired[int]
    ai_can_change_limit: NotRequired[bool]
