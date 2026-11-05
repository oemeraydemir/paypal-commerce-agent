from __future__ import annotations

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel


class OpsStatus(SdkBaseModel):
    """ops status."""

    enabled: Optional[bool] = UNSET
    """whether the capability is enabled (field)."""

    requires_key: Optional[bool] = Field(default=UNSET, alias="requiresKey")
    """whether a provider key is required (field)."""

    read_only: Optional[bool] = Field(default=UNSET, alias="readOnly")
    """whether the capability is read-only (field)."""

    reason: Optional[str] = UNSET
    """explanation for this outcome (field)."""

    paypal_tools: Optional[list[str]] = Field(default=UNSET, alias="paypalTools")
    """paypal tools (field)."""

    internal_tools: Optional[list[str]] = Field(default=UNSET, alias="internalTools")
    """internal tools (field)."""


class OpsStatusDict(TypedDict):
    enabled: NotRequired[bool]
    requires_key: NotRequired[bool]
    read_only: NotRequired[bool]
    reason: NotRequired[str]
    paypal_tools: NotRequired[list[str]]
    internal_tools: NotRequired[list[str]]
