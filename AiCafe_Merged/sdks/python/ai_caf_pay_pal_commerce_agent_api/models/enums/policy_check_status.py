from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class PolicyCheckStatus(str, Enum):
    """Per-rule check outcome."""

    VALUE_PASS_DESCRIPTION_CHECK_PASSED = "{\"value\":\"PASS\",\"description\":\"Check passed\"}"
    VALUE_WARN_DESCRIPTION_WARNING_PRODUCED = "{\"value\":\"WARN\",\"description\":\"Warning produced\"}"
    VALUE_BLOCK_DESCRIPTION_CHECK_BLOCKED = "{\"value\":\"BLOCK\",\"description\":\"Check blocked\"}"

    __str__ = str.__str__


PolicyCheckStatusOrStr: TypeAlias = Annotated[PolicyCheckStatus | str, open_enum_validator(PolicyCheckStatus)]
