from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class Actor(str, Enum):
    """actor (field)."""

    VALUE_AI_DESCRIPTION_ENUM_VALUE_AI = "{\"value\":\"ai\",\"description\":\"Enum value ai.\"}"
    VALUE_SERVER_DESCRIPTION_ENUM_VALUE_SERVER = "{\"value\":\"server\",\"description\":\"Enum value server.\"}"
    VALUE_SHOPPER_DESCRIPTION_ENUM_VALUE_SHOPPER = "{\"value\":\"shopper\",\"description\":\"Enum value shopper.\"}"
    VALUE_PAYPAL_DESCRIPTION_ENUM_VALUE_PAYPAL = "{\"value\":\"paypal\",\"description\":\"Enum value paypal.\"}"

    __str__ = str.__str__


ActorOrStr: TypeAlias = Annotated[Actor | str, open_enum_validator(Actor)]
