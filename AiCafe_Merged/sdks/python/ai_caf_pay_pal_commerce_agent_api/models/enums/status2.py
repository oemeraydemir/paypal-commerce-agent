from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class Status2(str, Enum):
    """Scope status."""

    VALUE_PENDING_APPROVAL_DESCRIPTION_ENUM_VALUE_PENDING_APPROVAL = "{\"value\":\"PENDING_APPROVAL\",\"description\":\"Enum value PENDING_APPROVAL.\"}"
    VALUE_ACTIVE_DESCRIPTION_ENUM_VALUE_ACTIVE = "{\"value\":\"ACTIVE\",\"description\":\"Enum value ACTIVE.\"}"
    VALUE_SPENT_DESCRIPTION_ENUM_VALUE_SPENT = "{\"value\":\"SPENT\",\"description\":\"Enum value SPENT.\"}"
    VALUE_EXPIRED_DESCRIPTION_ENUM_VALUE_EXPIRED = "{\"value\":\"EXPIRED\",\"description\":\"Enum value EXPIRED.\"}"
    VALUE_REVOKED_DESCRIPTION_ENUM_VALUE_REVOKED = "{\"value\":\"REVOKED\",\"description\":\"Enum value REVOKED.\"}"

    __str__ = str.__str__


Status2OrStr: TypeAlias = Annotated[Status2 | str, open_enum_validator(Status2)]
