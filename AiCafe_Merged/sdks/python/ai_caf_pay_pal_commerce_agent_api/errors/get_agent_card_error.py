from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json

GetAgentCardErrorBody: TypeAlias = Any | RawError


@dataclass(frozen=True, slots=True)
class _GetAgentCardError:
    def map(self, status_code: int, content: bytes) -> GetAgentCardErrorBody:
        match status_code:
            case 503:
                return decode_json[Any](content)
            case _:
                return RawError(status_code, content)


get_agent_card_error_mapper: Final[ErrorMapper[GetAgentCardErrorBody]] = _GetAgentCardError()
