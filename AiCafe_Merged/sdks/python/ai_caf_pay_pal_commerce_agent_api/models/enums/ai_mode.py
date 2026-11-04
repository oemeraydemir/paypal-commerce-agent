from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class AiMode(str, Enum):
    """Which engine answered."""

    VALUE_AI_DESCRIPTION_LLM_ANSWERED = "{\"value\":\"ai\",\"description\":\"LLM answered\"}"
    VALUE_RULE_BASED_DESCRIPTION_QUICK_PLANNER_ANSWERED = "{\"value\":\"rule-based\",\"description\":\"Quick planner answered\"}"

    __str__ = str.__str__


AiModeOrStr: TypeAlias = Annotated[AiMode | str, open_enum_validator(AiMode)]
