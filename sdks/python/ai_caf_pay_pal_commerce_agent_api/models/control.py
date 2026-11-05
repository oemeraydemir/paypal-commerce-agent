from __future__ import annotations

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel
from .enums.decision import DecisionOrStr
from .enums.payment_authority import PaymentAuthorityOrStr


class Control(SdkBaseModel):
    """control."""

    decision: Optional[DecisionOrStr] = UNSET
    """final policy decision (field)."""

    within_limit: Optional[bool] = Field(default=UNSET, alias="withinLimit")
    """within limit (field)."""

    requires_shopper_approval: Optional[bool] = Field(default=UNSET, alias="requiresShopperApproval")
    """requires shopper approval (field)."""

    payment_authority: Optional[PaymentAuthorityOrStr] = Field(default=UNSET, alias="paymentAuthority")
    """payment authority (field)."""

    agent_can_pay: Optional[bool] = Field(default=UNSET, alias="agentCanPay")
    """agent can pay (field)."""


class ControlDict(TypedDict):
    decision: NotRequired[DecisionOrStr]
    within_limit: NotRequired[bool]
    requires_shopper_approval: NotRequired[bool]
    payment_authority: NotRequired[PaymentAuthorityOrStr]
    agent_can_pay: NotRequired[bool]
