from __future__ import annotations

from typing import Any, Literal

from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel
from .enums.method import MethodOrStr
from .unions.id import Id, IdDict


class McpRequest(SdkBaseModel):
    """mcp request."""

    jsonrpc: Literal[
        "{\n  \"value\": \"2.0\",\n  \"description\": \"Enum value 2.0.\"\n}"
    ] = "{\n  \"value\": \"2.0\",\n  \"description\": \"Enum value 2.0.\"\n}"
    """jsonrpc (field)."""

    id: Optional[Id] = UNSET
    """unique identifier (field)."""

    method: MethodOrStr
    """method (field)."""

    params: Optional[Any] = UNSET
    """params (field)."""


class McpRequestDict(TypedDict):
    jsonrpc: Literal["{\n  \"value\": \"2.0\",\n  \"description\": \"Enum value 2.0.\"\n}"]
    id: NotRequired[IdDict]
    method: MethodOrStr
    params: NotRequired[Any]
