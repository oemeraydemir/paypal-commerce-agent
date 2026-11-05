from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class PolicyDecision(str, Enum):
    """The authoritative policy decision for a cart."""

    VALUE_AUTO_ALLOW_DESCRIPTION_ALLOWED = "{\"value\":\"AUTO_ALLOW\",\"description\":\"Allowed\"}"
    VALUE_REQUIRE_CONFIRMATION_DESCRIPTION_APPROVAL_REQUIRED = "{\"value\":\"REQUIRE_CONFIRMATION\",\"description\":\"Approval required\"}"
    VALUE_BLOCK_DESCRIPTION_BLOCKED = "{\"value\":\"BLOCK\",\"description\":\"Blocked\"}"

    __str__ = str.__str__


PolicyDecisionOrStr: TypeAlias = Annotated[PolicyDecision | str, open_enum_validator(PolicyDecision)]
