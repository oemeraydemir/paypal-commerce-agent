from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class Origin2(str, Enum):
    AI_AGENT = "AI_AGENT"
    HUMAN = "HUMAN"

    __str__ = str.__str__


Origin2OrStr: TypeAlias = Annotated[Origin2 | str, open_enum_validator(Origin2)]
