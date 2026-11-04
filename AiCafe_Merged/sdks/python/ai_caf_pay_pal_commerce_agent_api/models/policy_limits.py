from __future__ import annotations

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel


class PolicyLimits(SdkBaseModel):
    """policy limits."""

    currency: Optional[str] = UNSET
    """ISO 4217 currency code (e.g. EUR) (field)."""

    max_per_purchase_minor: Optional[int] = Field(default=UNSET, alias="maxPerPurchaseMinor")
    """max per-purchase minor units (field)."""

    confirmation_threshold_minor: Optional[int] = Field(default=UNSET, alias="confirmationThresholdMinor")
    """confirmation threshold minor units (field)."""

    daily_spend_limit_minor: Optional[int] = Field(default=UNSET, alias="dailySpendLimitMinor")
    """daily spend limit minor units (field)."""

    daily_spent_minor: Optional[int] = Field(default=UNSET, alias="dailySpentMinor")
    """daily spent minor units (field)."""

    daily_pending_minor: Optional[int] = Field(default=UNSET, alias="dailyPendingMinor")
    """daily pending minor units (field)."""

    daily_remaining_minor: Optional[int] = Field(default=UNSET, alias="dailyRemainingMinor")
    """daily remaining minor units (field)."""

    blocked_dietary_attributes: Optional[list[str]] = Field(default=UNSET, alias="blockedDietaryAttributes")
    """blocked dietary attributes (field)."""

    policy_enabled: Optional[bool] = Field(default=UNSET, alias="policyEnabled")
    """policy enabled (field)."""


class PolicyLimitsDict(TypedDict):
    currency: NotRequired[str]
    max_per_purchase_minor: NotRequired[int]
    confirmation_threshold_minor: NotRequired[int]
    daily_spend_limit_minor: NotRequired[int]
    daily_spent_minor: NotRequired[int]
    daily_pending_minor: NotRequired[int]
    daily_remaining_minor: NotRequired[int]
    blocked_dietary_attributes: NotRequired[list[str]]
    policy_enabled: NotRequired[bool]
