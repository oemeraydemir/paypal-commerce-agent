from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class McpVersion(str, Enum):
    """JSON-RPC protocol version."""

    VALUE_2_0_DESCRIPTION_JSON_RPC_2_0 = "{\"value\":\"2.0\",\"description\":\"JSON-RPC 2.0\"}"

    __str__ = str.__str__


McpVersionOrStr: TypeAlias = Annotated[McpVersion | str, open_enum_validator(McpVersion)]
