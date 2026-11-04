from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class State(str, Enum):
    """state (field)."""

    VALUE_DONE_DESCRIPTION_ENUM_VALUE_DONE = "{\"value\":\"done\",\"description\":\"Enum value done.\"}"
    VALUE_PENDING_DESCRIPTION_ENUM_VALUE_PENDING = "{\"value\":\"pending\",\"description\":\"Enum value pending.\"}"
    VALUE_BLOCKED_DESCRIPTION_ENUM_VALUE_BLOCKED = "{\"value\":\"blocked\",\"description\":\"Enum value blocked.\"}"

    __str__ = str.__str__


StateOrStr: TypeAlias = Annotated[State | str, open_enum_validator(State)]
