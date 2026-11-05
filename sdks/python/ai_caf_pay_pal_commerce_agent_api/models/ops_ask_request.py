from __future__ import annotations

from typing_extensions import TypedDict

from ..core import SdkBaseModel


class OpsAskRequest(SdkBaseModel):
    """ops ask request."""

    question: str
    """question (field)."""


class OpsAskRequestDict(TypedDict):
    question: str
