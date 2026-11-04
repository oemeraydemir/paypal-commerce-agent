from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error

PostSessionsErrorBody: TypeAlias = Error | RawError


@dataclass(frozen=True, slots=True)
class _PostSessionsError:
    def map(self, status_code: int, content: bytes) -> PostSessionsErrorBody:
        match status_code:
            case 429:
                return decode_json[Error](content)
            case _:
                return RawError(status_code, content)


post_sessions_error_mapper: Final[ErrorMapper[PostSessionsErrorBody]] = _PostSessionsError()
