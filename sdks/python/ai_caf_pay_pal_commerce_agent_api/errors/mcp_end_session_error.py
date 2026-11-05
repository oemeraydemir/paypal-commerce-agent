from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error

McpEndSessionErrorBody: TypeAlias = Error | RawError


@dataclass(frozen=True, slots=True)
class _McpEndSessionError:
    def map(self, status_code: int, content: bytes) -> McpEndSessionErrorBody:
        match status_code:
            case 404:
                return decode_json[Error](content)
            case _:
                return RawError(status_code, content)


mcp_end_session_error_mapper: Final[ErrorMapper[McpEndSessionErrorBody]] = _McpEndSessionError()
