from __future__ import annotations

from typing import Any

from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, OptionalNullable, SdkBaseModel
from .enums.jsonrpc import JsonrpcOrStr
from .error1 import Error1, Error1Dict


class McpResponse(SdkBaseModel):
    """mcp response."""

    jsonrpc: Optional[JsonrpcOrStr] = UNSET
    """jsonrpc (field)."""

    id: OptionalNullable[str] = UNSET
    """Echo of the request id (string or integer in JSON-RPC; shown as string here)"""

    result: Optional[Any] = UNSET
    """result (field)."""

    error: Optional[Error1] = UNSET
    """error."""


class McpResponseDict(TypedDict):
    jsonrpc: NotRequired[JsonrpcOrStr]
    id: NotRequired[str | None]
    result: NotRequired[Any]
    error: NotRequired[Error1Dict]
