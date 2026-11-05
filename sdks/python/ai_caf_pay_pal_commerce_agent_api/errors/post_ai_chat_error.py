from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error

PostAiChatErrorBody: TypeAlias = Error | RawError


@dataclass(frozen=True, slots=True)
class _PostAiChatError:
    def map(self, status_code: int, content: bytes) -> PostAiChatErrorBody:
        match status_code:
            case 400 | 429 | 503:
                return decode_json[Error](content)
            case _:
                return RawError(status_code, content)


post_ai_chat_error_mapper: Final[ErrorMapper[PostAiChatErrorBody]] = _PostAiChatError()
