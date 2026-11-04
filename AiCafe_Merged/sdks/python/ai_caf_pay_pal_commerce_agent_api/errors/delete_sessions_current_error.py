from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error

DeleteSessionsCurrentErrorBody: TypeAlias = Error | RawError


@dataclass(frozen=True, slots=True)
class _DeleteSessionsCurrentError:
    def map(self, status_code: int, content: bytes) -> DeleteSessionsCurrentErrorBody:
        match status_code:
            case code if 400 <= code <= 499:
                return decode_json[Error](content)
            case _:
                return RawError(status_code, content)


delete_sessions_current_error_mapper: Final[ErrorMapper[DeleteSessionsCurrentErrorBody]] = _DeleteSessionsCurrentError()
