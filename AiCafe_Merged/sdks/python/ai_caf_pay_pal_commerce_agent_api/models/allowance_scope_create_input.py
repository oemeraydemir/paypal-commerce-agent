from __future__ import annotations

from typing import Any

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, RFC3339DateTime, SdkBaseModel


class AllowanceScopeCreateInput(SdkBaseModel):
    label: str
    """Human-readable label."""

    origins_allowed: Optional[list[str]] = Field(default=UNSET, alias="originsAllowed")
    """Origins permitted (default all)."""

    currency: str
    """Currency; must match the shopper policy currency."""

    max_per_purchase_minor: Optional[int] = Field(default=UNSET, alias="maxPerPurchaseMinor")
    """Per-purchase cap in minor units (optional)."""

    daily_spend_limit_minor: Optional[int] = Field(default=UNSET, alias="dailySpendLimitMinor")
    """Daily cap in minor units (optional)."""

    category_spend_limits: Optional[dict[str, int]] = Field(default=UNSET, alias="categorySpendLimits")
    """Category caps (optional)."""

    allowed_merchant_ids: Optional[list[str]] = Field(default=UNSET, alias="allowedMerchantIds")
    """Allowed merchant ids (optional)."""

    night_window: Optional[Any] = Field(default=UNSET, alias="nightWindow")
    """Night window rule (optional)."""

    expires_at: Optional[RFC3339DateTime] = Field(default=UNSET, alias="expiresAt")
    """Expiry (optional)."""


class AllowanceScopeCreateInputDict(TypedDict):
    label: str
    origins_allowed: NotRequired[list[str]]
    currency: str
    max_per_purchase_minor: NotRequired[int]
    daily_spend_limit_minor: NotRequired[int]
    category_spend_limits: NotRequired[dict[str, int]]
    allowed_merchant_ids: NotRequired[list[str]]
    night_window: NotRequired[Any]
    expires_at: NotRequired[RFC3339DateTime]
