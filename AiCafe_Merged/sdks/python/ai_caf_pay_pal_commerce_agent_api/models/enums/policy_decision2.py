from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class PolicyDecision2(str, Enum):
    """policy decision (field)."""

    VALUE_AUTO_ALLOW_DESCRIPTION_ENUM_VALUE_AUTO_ALLOW = "{\"value\":\"AUTO_ALLOW\",\"description\":\"Enum value AUTO_ALLOW.\"}"
    VALUE_REQUIRE_CONFIRMATION_DESCRIPTION_ENUM_VALUE_REQUIRE_CONFIRMATION = "{\"value\":\"REQUIRE_CONFIRMATION\",\"description\":\"Enum value REQUIRE_CONFIRMATION.\"}"
    VALUE_BLOCK_DESCRIPTION_ENUM_VALUE_BLOCK = "{\"value\":\"BLOCK\",\"description\":\"Enum value BLOCK.\"}"

    __str__ = str.__str__


PolicyDecision2OrStr: TypeAlias = Annotated[PolicyDecision2 | str, open_enum_validator(PolicyDecision2)]
