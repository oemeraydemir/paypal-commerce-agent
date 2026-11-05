from __future__ import annotations

from typing_extensions import TypedDict

from ..core import SdkBaseModel
from .enums.actor import ActorOrStr
from .enums.key import KeyOrStr
from .enums.state import StateOrStr


class Step(SdkBaseModel):
    """steps."""

    key: KeyOrStr
    """key (field)."""

    state: StateOrStr
    """state (field)."""

    actor: ActorOrStr
    """actor (field)."""


class StepDict(TypedDict):
    key: KeyOrStr
    state: StateOrStr
    actor: ActorOrStr
