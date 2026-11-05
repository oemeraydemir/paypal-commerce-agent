from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class MandateCanonicalization(str, Enum):
    """Canonicalization scheme used before signing."""

    VALUE_JCS_DESCRIPTION_JSON_CANONICALIZATION_RFC_8785 = "{\"value\":\"jcs\",\"description\":\"JSON Canonicalization (RFC 8785)\"}"

    __str__ = str.__str__


MandateCanonicalizationOrStr: TypeAlias = Annotated[
    MandateCanonicalization | str, open_enum_validator(MandateCanonicalization)
]
