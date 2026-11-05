from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class Source(str, Enum):
    """source (field)."""

    VALUE_CHANNEL3_DESCRIPTION_ENUM_VALUE_CHANNEL3 = "{\"value\":\"channel3\",\"description\":\"Enum value channel3.\"}"

    __str__ = str.__str__


SourceOrStr: TypeAlias = Annotated[Source | str, open_enum_validator(Source)]
