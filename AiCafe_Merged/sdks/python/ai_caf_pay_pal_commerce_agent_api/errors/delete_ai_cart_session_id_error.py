from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error

DeleteAiCartSessionIdErrorBody: TypeAlias = Error | RawError


@dataclass(frozen=True, slots=True)
class _DeleteAiCartSessionIdError:
    def map(self, status_code: int, content: bytes) -> DeleteAiCartSessionIdErrorBody:
        match status_code:
            case 403:
                return decode_json[Error](content)
            case _:
                return RawError(status_code, content)


delete_ai_cart_session_id_error_mapper: Final[
    ErrorMapper[DeleteAiCartSessionIdErrorBody]
] = _DeleteAiCartSessionIdError()
