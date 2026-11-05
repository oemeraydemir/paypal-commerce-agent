from __future__ import annotations

from typing import Any

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, OptionalNullable, SdkBaseModel
from .enums.mode import ModeOrStr
from .prepared_cart import PreparedCart, PreparedCartDict


class AiChatResponse(SdkBaseModel):
    """aichat response."""

    session_id: Optional[str] = Field(default=UNSET, alias="sessionId")
    """session identifier (field)."""

    response: Optional[str] = UNSET
    """response (field)."""

    prepared_cart: OptionalNullable[PreparedCart] = Field(default=UNSET, alias="preparedCart")
    """The validated, server-priced cart prepared by the agent; null when none was prepared."""

    checkout_ready: Optional[bool] = Field(default=UNSET, alias="checkoutReady")
    """whether the cart is ready for checkout (field)."""

    suggestion: OptionalNullable[Any] = UNSET
    """Rule-based mode only: a manual add-anyway offer. Not a prepared cart; authorises nothing."""

    tool_rounds: Optional[int] = Field(default=UNSET, alias="toolRounds")
    """number of tool-calling rounds used (field)."""

    message_count: Optional[int] = Field(default=UNSET, alias="messageCount")
    """number of messages in the conversation (field)."""

    mode: Optional[ModeOrStr] = UNSET
    """"ai" when an LLM answered; "rule-based" when every AI provider was exhausted and the clearly-labelled non-AI
    Quick Planner answered. Rule-based carts are attributed to HUMAN, never AI_AGENT."""

    provider: OptionalNullable[str] = UNSET
    """Which provider answered (e.g. groq, gemini) or "rule-based" for the non-AI planner. Names only. Also sent as the
    X-AI-Provider header."""

    model: OptionalNullable[str] = UNSET
    """Model id that produced the final answer; null for the rule-based planner."""

    model_calls: Optional[int] = Field(default=UNSET, alias="modelCalls")
    """Model calls made for this turn (0 for the rule-based planner). A turn is bounded by 6 rounds, 12 executed tool
    calls and 40 s; past a ceiling the next call is made without tools."""

    fallback: Optional[bool] = UNSET
    """true when an earlier provider/model failed first, the provider changed within the turn, or the rule-based planner
    answered."""


class AiChatResponseDict(TypedDict):
    session_id: NotRequired[str]
    response: NotRequired[str]
    prepared_cart: NotRequired[PreparedCartDict | None]
    checkout_ready: NotRequired[bool]
    suggestion: NotRequired[Any | None]
    tool_rounds: NotRequired[int]
    message_count: NotRequired[int]
    mode: NotRequired[ModeOrStr]
    provider: NotRequired[str | None]
    model: NotRequired[str | None]
    model_calls: NotRequired[int]
    fallback: NotRequired[bool]
