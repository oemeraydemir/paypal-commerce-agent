from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class Jsonrpc(str, Enum):
    """jsonrpc (field)."""

    VALUE_2_0_DESCRIPTION_ENUM_VALUE_2_0 = "{\"value\":\"2.0\",\"description\":\"Enum value 2.0.\"}"

    __str__ = str.__str__


JsonrpcOrStr: TypeAlias = Annotated[Jsonrpc | str, open_enum_validator(Jsonrpc)]
