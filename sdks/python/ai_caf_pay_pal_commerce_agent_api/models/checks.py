from __future__ import annotations

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, OptionalNullable, SdkBaseModel


class Checks(SdkBaseModel):
    """checks."""

    known_key: Optional[bool] = Field(default=UNSET, alias="knownKey")
    """known key (field)."""

    signature: Optional[bool] = UNSET
    """signature (field)."""

    not_expired: Optional[bool] = Field(default=UNSET, alias="notExpired")
    """not expired (field)."""

    matches_order: OptionalNullable[bool] = Field(default=UNSET, alias="matchesOrder")
    """matches order (field)."""


class ChecksDict(TypedDict):
    known_key: NotRequired[bool]
    signature: NotRequired[bool]
    not_expired: NotRequired[bool]
    matches_order: NotRequired[bool | None]
