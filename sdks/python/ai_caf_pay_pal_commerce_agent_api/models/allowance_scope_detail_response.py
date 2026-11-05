from __future__ import annotations

from typing import Any

from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel
from .allowance_scope import AllowanceScope, AllowanceScopeDict


class AllowanceScopeDetailResponse(SdkBaseModel):
    scope: Optional[AllowanceScope] = UNSET
    events: Optional[list[Any]] = UNSET
    """Audit events for the scope."""


class AllowanceScopeDetailResponseDict(TypedDict):
    scope: NotRequired[AllowanceScopeDict]
    events: NotRequired[list[Any]]
