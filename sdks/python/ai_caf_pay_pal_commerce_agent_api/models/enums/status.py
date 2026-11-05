from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class Status(str, Enum):
    """current status (field)."""

    VALUE_PASS_DESCRIPTION_ENUM_VALUE_PASS = "{\"value\":\"pass\",\"description\":\"Enum value pass.\"}"
    VALUE_CONFIRM_DESCRIPTION_ENUM_VALUE_CONFIRM = "{\"value\":\"confirm\",\"description\":\"Enum value confirm.\"}"
    VALUE_FAIL_DESCRIPTION_ENUM_VALUE_FAIL = "{\"value\":\"fail\",\"description\":\"Enum value fail.\"}"

    __str__ = str.__str__


StatusOrStr: TypeAlias = Annotated[Status | str, open_enum_validator(Status)]
