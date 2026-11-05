from __future__ import annotations

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel


class OrdersStats(SdkBaseModel):
    """orders stats."""

    total: Optional[int] = UNSET
    """total (field)."""

    ai_assisted: Optional[int] = Field(default=UNSET, alias="aiAssisted")
    """AI assisted (field)."""

    ai_assisted_percentage: Optional[float] = Field(default=UNSET, alias="aiAssistedPercentage")
    """AI assisted percentage (field)."""

    revenue_minor: Optional[int] = Field(default=UNSET, alias="revenueMinor")
    """Gross captured amount of PAID orders (before refunds)."""

    revenue_formatted: Optional[str] = Field(default=UNSET, alias="revenueFormatted")
    """revenue formatted (field)."""

    refunded_minor: Optional[int] = Field(default=UNSET, alias="refundedMinor")
    """Sum of merchant-approved refunds on paid orders (never more than captured)."""

    refunded_formatted: Optional[str] = Field(default=UNSET, alias="refundedFormatted")
    """refunded formatted (field)."""

    net_revenue_minor: Optional[int] = Field(default=UNSET, alias="netRevenueMinor")
    """revenueMinor minus refundedMinor; what the merchant keeps."""

    net_revenue_formatted: Optional[str] = Field(default=UNSET, alias="netRevenueFormatted")
    """net revenue formatted (field)."""


class OrdersStatsDict(TypedDict):
    total: NotRequired[int]
    ai_assisted: NotRequired[int]
    ai_assisted_percentage: NotRequired[float]
    revenue_minor: NotRequired[int]
    revenue_formatted: NotRequired[str]
    refunded_minor: NotRequired[int]
    refunded_formatted: NotRequired[str]
    net_revenue_minor: NotRequired[int]
    net_revenue_formatted: NotRequired[str]
