from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class OrderOrigin(str, Enum):
    """How the order was created."""

    VALUE_AI_ASSISTED_DESCRIPTION_AI_CONFIRMED_BY_A_HUMAN = "{\"value\":\"AI_ASSISTED\",\"description\":\"AI confirmed by a human\"}"
    VALUE_AI_AGENT_DESCRIPTION_INITIATED_BY_AI = "{\"value\":\"AI_AGENT\",\"description\":\"Initiated by AI\"}"
    VALUE_HUMAN_DESCRIPTION_CREATED_BY_A_HUMAN = "{\"value\":\"HUMAN\",\"description\":\"Created by a human\"}"

    __str__ = str.__str__


OrderOriginOrStr: TypeAlias = Annotated[OrderOrigin | str, open_enum_validator(OrderOrigin)]
