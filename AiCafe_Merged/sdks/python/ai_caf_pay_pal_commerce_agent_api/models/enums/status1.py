from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class Status1(str, Enum):
    """current status (field)."""

    VALUE_PROPOSED_DESCRIPTION_ENUM_VALUE_PROPOSED = "{\"value\":\"PROPOSED\",\"description\":\"Enum value PROPOSED.\"}"
    VALUE_PROCESSING_DESCRIPTION_ENUM_VALUE_PROCESSING = "{\"value\":\"PROCESSING\",\"description\":\"Enum value PROCESSING.\"}"
    VALUE_REFUNDED_DESCRIPTION_ENUM_VALUE_REFUNDED = "{\"value\":\"REFUNDED\",\"description\":\"Enum value REFUNDED.\"}"
    VALUE_REJECTED_DESCRIPTION_ENUM_VALUE_REJECTED = "{\"value\":\"REJECTED\",\"description\":\"Enum value REJECTED.\"}"

    __str__ = str.__str__


Status1OrStr: TypeAlias = Annotated[Status1 | str, open_enum_validator(Status1)]
