from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class Method(str, Enum):
    """method (field)."""

    VALUE_INITIALIZE_DESCRIPTION_ENUM_VALUE_INITIALIZE = "{\"value\":\"initialize\",\"description\":\"Enum value initialize.\"}"
    VALUE_PING_DESCRIPTION_ENUM_VALUE_PING = "{\"value\":\"ping\",\"description\":\"Enum value ping.\"}"
    VALUE_TOOLS_LIST_DESCRIPTION_ENUM_VALUE_TOOLS_LIST = "{\"value\":\"tools/list\",\"description\":\"Enum value tools/list.\"}"
    VALUE_TOOLS_CALL_DESCRIPTION_ENUM_VALUE_TOOLS_CALL = "{\"value\":\"tools/call\",\"description\":\"Enum value tools/call.\"}"
    VALUE_NOTIFICATIONS_INITIALIZED_DESCRIPTION_ENUM_VALUE_NOTIFICATIONS_INITIALIZED = "{\"value\":\"notifications/initialized\",\"description\":\"Enum value notifications/initialized.\"}"

    __str__ = str.__str__


MethodOrStr: TypeAlias = Annotated[Method | str, open_enum_validator(Method)]
