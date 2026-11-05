from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error

PostOpsAskErrorBody: TypeAlias = Error | RawError


@dataclass(frozen=True, slots=True)
class _PostOpsAskError:
    def map(self, status_code: int, content: bytes) -> PostOpsAskErrorBody:
        match status_code:
            case 401 | 429 | 503:
                return decode_json[Error](content)
            case _:
                return RawError(status_code, content)


post_ops_ask_error_mapper: Final[ErrorMapper[PostOpsAskErrorBody]] = _PostOpsAskError()
