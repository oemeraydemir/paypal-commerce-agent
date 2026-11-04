from __future__ import annotations

from typing import Any

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, OptionalNullable, RFC3339DateTime, SdkBaseModel
from .enums.kind import KindOrStr
from .enums.status2 import Status2OrStr


class AllowanceScope(SdkBaseModel):
    id: Optional[str] = UNSET
    """Scope id."""

    kind: Optional[KindOrStr] = UNSET
    """Scope kind."""

    label: Optional[str] = UNSET
    """Human-readable label (field)."""

    session_ref: OptionalNullable[str] = Field(default=UNSET, alias="sessionRef")
    """Non-reversible session label (field)."""

    origins_allowed: Optional[list[str]] = Field(default=UNSET, alias="originsAllowed")
    """Origins permitted (field)."""

    currency: Optional[str] = UNSET
    """Currency (field)."""

    max_per_purchase_minor: OptionalNullable[int] = Field(default=UNSET, alias="maxPerPurchaseMinor")
    """Per-purchase cap in minor units (field)."""

    daily_spend_limit_minor: OptionalNullable[int] = Field(default=UNSET, alias="dailySpendLimitMinor")
    """Daily cap in minor units (field)."""

    category_spend_limits: OptionalNullable[dict[str, int]] = Field(default=UNSET, alias="categorySpendLimits")
    """Category caps (field)."""

    allowed_merchant_ids: OptionalNullable[list[str]] = Field(default=UNSET, alias="allowedMerchantIds")
    """Allowed merchant ids (field)."""

    night_window: OptionalNullable[Any] = Field(default=UNSET, alias="nightWindow")
    """Night window rule (field)."""

    status: Optional[Status2OrStr] = UNSET
    """Scope status."""

    issued_by: Optional[str] = Field(default=UNSET, alias="issuedBy")
    """Issuer (field)."""

    approved_by: OptionalNullable[Any] = Field(default=UNSET, alias="approvedBy")
    """Shopper approval record (field)."""

    created_at: Optional[RFC3339DateTime] = Field(default=UNSET, alias="createdAt")
    """Created at (field)."""

    expires_at: OptionalNullable[RFC3339DateTime] = Field(default=UNSET, alias="expiresAt")
    """Expiry (field)."""

    updated_at: Optional[RFC3339DateTime] = Field(default=UNSET, alias="updatedAt")
    """Updated at (field)."""


class AllowanceScopeDict(TypedDict):
    id: NotRequired[str]
    kind: NotRequired[KindOrStr]
    label: NotRequired[str]
    session_ref: NotRequired[str | None]
    origins_allowed: NotRequired[list[str]]
    currency: NotRequired[str]
    max_per_purchase_minor: NotRequired[int | None]
    daily_spend_limit_minor: NotRequired[int | None]
    category_spend_limits: NotRequired[dict[str, int] | None]
    allowed_merchant_ids: NotRequired[list[str] | None]
    night_window: NotRequired[Any | None]
    status: NotRequired[Status2OrStr]
    issued_by: NotRequired[str]
    approved_by: NotRequired[Any | None]
    created_at: NotRequired[RFC3339DateTime]
    expires_at: NotRequired[RFC3339DateTime | None]
    updated_at: NotRequired[RFC3339DateTime]
