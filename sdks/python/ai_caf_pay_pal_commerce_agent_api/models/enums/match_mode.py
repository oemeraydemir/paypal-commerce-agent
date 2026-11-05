from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class MatchMode(str, Enum):
    """How multiple search terms are combined."""

    VALUE_ALL_DESCRIPTION_EVERY_TERM_MUST_MATCH = "{\"value\":\"all\",\"description\":\"Every term must match\"}"
    VALUE_ANY_DESCRIPTION_ANY_TERM_MAY_MATCH = "{\"value\":\"any\",\"description\":\"Any term may match\"}"

    __str__ = str.__str__


MatchModeOrStr: TypeAlias = Annotated[MatchMode | str, open_enum_validator(MatchMode)]
