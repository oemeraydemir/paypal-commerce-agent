from __future__ import annotations

from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel
from .allowance_scope import AllowanceScope, AllowanceScopeDict


class AllowanceScopeListResponse(SdkBaseModel):
    scopes: Optional[list[AllowanceScope]] = UNSET
    """The shopper's scopes."""


class AllowanceScopeListResponseDict(TypedDict):
    scopes: NotRequired[list[AllowanceScopeDict]]
