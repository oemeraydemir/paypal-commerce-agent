from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class ProposedBy(str, Enum):
    """proposed by (field)."""

    VALUE_OPS_COPILOT_DESCRIPTION_ENUM_VALUE_OPS_COPILOT = "{\"value\":\"OPS_COPILOT\",\"description\":\"Enum value OPS_COPILOT.\"}"
    VALUE_MERCHANT_DESCRIPTION_ENUM_VALUE_MERCHANT = "{\"value\":\"MERCHANT\",\"description\":\"Enum value MERCHANT.\"}"

    __str__ = str.__str__


ProposedByOrStr: TypeAlias = Annotated[ProposedBy | str, open_enum_validator(ProposedBy)]
