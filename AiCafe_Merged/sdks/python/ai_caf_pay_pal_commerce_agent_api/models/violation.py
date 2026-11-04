from __future__ import annotations

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel


class Violation(SdkBaseModel):
    """A single policy violation found when evaluating a cart."""

    type_: Optional[str] = Field(default=UNSET, alias="type")
    """Type of violation (e.g. policy, constraint)."""

    rule: Optional[str] = UNSET
    """Identifier of the violated rule."""

    message: Optional[str] = UNSET
    """Human-readable explanation of the violation."""


class ViolationDict(TypedDict):
    type_: NotRequired[str]
    rule: NotRequired[str]
    message: NotRequired[str]
