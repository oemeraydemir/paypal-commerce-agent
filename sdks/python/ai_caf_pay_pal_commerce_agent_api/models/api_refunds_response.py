from __future__ import annotations

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel
from .refund_request import RefundRequest, RefundRequestDict


class ApiRefundsResponse(SdkBaseModel):
    sandbox: Optional[bool] = UNSET
    paypal_enabled: Optional[bool] = Field(default=UNSET, alias="paypalEnabled")
    refunds: Optional[list[RefundRequest]] = UNSET


class ApiRefundsResponseDict(TypedDict):
    sandbox: NotRequired[bool]
    paypal_enabled: NotRequired[bool]
    refunds: NotRequired[list[RefundRequestDict]]
