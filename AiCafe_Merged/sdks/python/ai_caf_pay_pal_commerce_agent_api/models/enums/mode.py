from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class Mode(str, Enum):
    """"ai" when an LLM answered; "rule-based" when every AI provider was exhausted and the clearly-labelled non-AI
    Quick Planner answered. Rule-based carts are attributed to HUMAN, never AI_AGENT."""

    VALUE_AI_DESCRIPTION_ENUM_VALUE_AI = "{\"value\":\"ai\",\"description\":\"Enum value ai.\"}"
    VALUE_RULE_BASED_DESCRIPTION_ENUM_VALUE_RULE_BASED = "{\"value\":\"rule-based\",\"description\":\"Enum value rule-based.\"}"

    __str__ = str.__str__


ModeOrStr: TypeAlias = Annotated[Mode | str, open_enum_validator(Mode)]
