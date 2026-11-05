from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class PricesSource(str, Enum):
    """prices source (field)."""

    VALUE_SERVER_CATALOG_DESCRIPTION_ENUM_VALUE_SERVER_CATALOG = "{\"value\":\"server-catalog\",\"description\":\"Enum value server-catalog.\"}"

    __str__ = str.__str__


PricesSourceOrStr: TypeAlias = Annotated[PricesSource | str, open_enum_validator(PricesSource)]
