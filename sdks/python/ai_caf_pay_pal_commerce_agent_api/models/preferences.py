from __future__ import annotations

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel
from .enums.dietary import DietaryOrStr


class Preferences(SdkBaseModel):
    """preferences."""

    dietary: Optional[list[DietaryOrStr]] = UNSET
    """dietary (field)."""

    max_budget_minor: Optional[int] = Field(default=UNSET, alias="maxBudgetMinor")
    """max budget minor units (field)."""


class PreferencesDict(TypedDict):
    dietary: NotRequired[list[DietaryOrStr]]
    max_budget_minor: NotRequired[int]
