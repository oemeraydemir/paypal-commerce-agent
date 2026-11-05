from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class Kind(str, Enum):
    """Scope kind."""

    VALUE_SHOPPER_DESCRIPTION_ENUM_VALUE_SHOPPER = "{\"value\":\"SHOPPER\",\"description\":\"Enum value SHOPPER.\"}"
    VALUE_AGENT_PROPOSED_DESCRIPTION_ENUM_VALUE_AGENT_PROPOSED = "{\"value\":\"AGENT_PROPOSED\",\"description\":\"Enum value AGENT_PROPOSED.\"}"
    VALUE_AGENT_GRANTED_DESCRIPTION_ENUM_VALUE_AGENT_GRANTED = "{\"value\":\"AGENT_GRANTED\",\"description\":\"Enum value AGENT_GRANTED.\"}"

    __str__ = str.__str__


KindOrStr: TypeAlias = Annotated[Kind | str, open_enum_validator(Kind)]
