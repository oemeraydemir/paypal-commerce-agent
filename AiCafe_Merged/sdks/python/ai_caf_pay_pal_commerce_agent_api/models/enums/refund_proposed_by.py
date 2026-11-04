from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class RefundProposedBy(str, Enum):
    """Who proposed the refund."""

    VALUE_CUSTOMER_DESCRIPTION_CUSTOMER = "{\"value\":\"CUSTOMER\",\"description\":\"Customer\"}"
    VALUE_AGENT_DESCRIPTION_AGENT = "{\"value\":\"AGENT\",\"description\":\"Agent\"}"
    VALUE_MERCHANT_DESCRIPTION_MERCHANT = "{\"value\":\"MERCHANT\",\"description\":\"Merchant\"}"

    __str__ = str.__str__


RefundProposedByOrStr: TypeAlias = Annotated[RefundProposedBy | str, open_enum_validator(RefundProposedBy)]
