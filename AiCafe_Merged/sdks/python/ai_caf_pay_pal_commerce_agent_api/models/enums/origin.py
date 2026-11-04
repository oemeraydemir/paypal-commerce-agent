from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class Origin(str, Enum):
    """how the order was created (field)."""

    VALUE_AI_AGENT_DESCRIPTION_ENUM_VALUE_AI_AGENT = "{\"value\":\"AI_AGENT\",\"description\":\"Enum value AI_AGENT.\"}"
    VALUE_HUMAN_DESCRIPTION_ENUM_VALUE_HUMAN = "{\"value\":\"HUMAN\",\"description\":\"Enum value HUMAN.\"}"

    __str__ = str.__str__


OriginOrStr: TypeAlias = Annotated[Origin | str, open_enum_validator(Origin)]
