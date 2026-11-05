from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class McpMethod(str, Enum):
    """MCP method name."""

    VALUE_INITIALIZE_DESCRIPTION_HANDSHAKE_VERB = "{\"value\":\"initialize\",\"description\":\"Handshake verb\"}"
    VALUE_NOTIFICATIONS_INITIALIZED_DESCRIPTION_CLIENT_READY_NOTIFICATION = "{\"value\":\"notifications/initialized\",\"description\":\"Client-ready notification\"}"
    VALUE_TOOLS_LIST_DESCRIPTION_LIST_AVAILABLE_TOOLS = "{\"value\":\"tools/list\",\"description\":\"List available tools\"}"
    VALUE_TOOLS_CALL_DESCRIPTION_INVOKE_A_TOOL = "{\"value\":\"tools/call\",\"description\":\"Invoke a tool\"}"

    __str__ = str.__str__


McpMethodOrStr: TypeAlias = Annotated[McpMethod | str, open_enum_validator(McpMethod)]
