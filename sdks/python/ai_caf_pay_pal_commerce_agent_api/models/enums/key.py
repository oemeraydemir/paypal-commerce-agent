from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class Key(str, Enum):
    """key (field)."""

    VALUE_PREPARED_DESCRIPTION_ENUM_VALUE_PREPARED = "{\"value\":\"prepared\",\"description\":\"Enum value prepared.\"}"
    VALUE_PRICES_DESCRIPTION_ENUM_VALUE_PRICES = "{\"value\":\"prices\",\"description\":\"Enum value prices.\"}"
    VALUE_LIMIT_DESCRIPTION_ENUM_VALUE_LIMIT = "{\"value\":\"limit\",\"description\":\"Enum value limit.\"}"
    VALUE_APPROVAL_DESCRIPTION_ENUM_VALUE_APPROVAL = "{\"value\":\"approval\",\"description\":\"Enum value approval.\"}"
    VALUE_PAYPAL_DESCRIPTION_ENUM_VALUE_PAYPAL = "{\"value\":\"paypal\",\"description\":\"Enum value paypal.\"}"
    VALUE_VERIFY_DESCRIPTION_ENUM_VALUE_VERIFY = "{\"value\":\"verify\",\"description\":\"Enum value verify.\"}"

    __str__ = str.__str__


KeyOrStr: TypeAlias = Annotated[Key | str, open_enum_validator(Key)]
