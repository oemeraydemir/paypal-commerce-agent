from __future__ import annotations

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, OptionalNullable, SdkBaseModel


class PolicySnapshot(SdkBaseModel):
    """Snapshot of the policy that was in effect, captured at decision time."""

    enabled: Optional[bool] = UNSET
    """Whether purchase policy is enabled."""

    currency: Optional[str] = UNSET
    """ISO 4217 currency code."""

    max_per_purchase_minor: Optional[int] = Field(default=UNSET, alias="maxPerPurchaseMinor")
    """Per-purchase cap in minor units."""

    daily_spend_limit_minor: Optional[int] = Field(default=UNSET, alias="dailySpendLimitMinor")
    """Daily spend cap in minor units."""

    confirmation_threshold_minor: Optional[int] = Field(default=UNSET, alias="confirmationThresholdMinor")
    """Above this amount, explicit human approval is required (minor units)."""

    allowed_merchant_ids: Optional[list[str]] = Field(default=UNSET, alias="allowedMerchantIds")
    """Allowed merchant identifiers."""

    blocked_category_ids: Optional[list[str]] = Field(default=UNSET, alias="blockedCategoryIds")
    """Blocked product category identifiers."""

    valid_until: OptionalNullable[str] = Field(default=UNSET, alias="validUntil")
    """Policy expiry (RFC 3339)."""

    revision: OptionalNullable[int] = UNSET
    """Policy revision number."""


class PolicySnapshotDict(TypedDict):
    enabled: NotRequired[bool]
    currency: NotRequired[str]
    max_per_purchase_minor: NotRequired[int]
    daily_spend_limit_minor: NotRequired[int]
    confirmation_threshold_minor: NotRequired[int]
    allowed_merchant_ids: NotRequired[list[str]]
    blocked_category_ids: NotRequired[list[str]]
    valid_until: NotRequired[str | None]
    revision: NotRequired[int | None]
