from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class MandateAlg(str, Enum):
    """Signature algorithm."""

    VALUE_ED_DSA_DESCRIPTION_ED25519_ED_DSA = "{\"value\":\"EdDSA\",\"description\":\"Ed25519 (EdDSA)\"}"

    __str__ = str.__str__


MandateAlgOrStr: TypeAlias = Annotated[MandateAlg | str, open_enum_validator(MandateAlg)]
