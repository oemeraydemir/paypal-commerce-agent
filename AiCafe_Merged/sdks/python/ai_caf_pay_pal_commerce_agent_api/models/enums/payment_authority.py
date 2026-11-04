from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class PaymentAuthority(str, Enum):
    """payment authority (field)."""

    VALUE_SHOPPER_DESCRIPTION_ENUM_VALUE_SHOPPER = "{\"value\":\"shopper\",\"description\":\"Enum value shopper.\"}"

    __str__ = str.__str__


PaymentAuthorityOrStr: TypeAlias = Annotated[PaymentAuthority | str, open_enum_validator(PaymentAuthority)]
