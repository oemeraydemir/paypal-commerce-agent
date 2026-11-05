from __future__ import annotations

from typing_extensions import TypedDict

from ..core import SdkBaseModel
from .item1 import Item1, Item1Dict


class TakeHomeRequest(SdkBaseModel):
    """take home request."""

    items: list[Item1]
    """items (field)."""


class TakeHomeRequestDict(TypedDict):
    items: list[Item1Dict]
