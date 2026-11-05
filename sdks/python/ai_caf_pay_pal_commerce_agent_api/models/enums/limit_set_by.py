from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class LimitSetBy(str, Enum):
    """limit set by (field)."""

    VALUE_SHOPPER_POLICY_DESCRIPTION_ENUM_VALUE_SHOPPER_POLICY = "{\"value\":\"shopper-policy\",\"description\":\"Enum value shopper-policy.\"}"

    __str__ = str.__str__


LimitSetByOrStr: TypeAlias = Annotated[LimitSetBy | str, open_enum_validator(LimitSetBy)]
