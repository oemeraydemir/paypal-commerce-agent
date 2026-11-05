from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error

GetOpsStatusErrorBody: TypeAlias = Error | RawError


@dataclass(frozen=True, slots=True)
class _GetOpsStatusError:
    def map(self, status_code: int, content: bytes) -> GetOpsStatusErrorBody:
        match status_code:
            case code if 400 <= code <= 499:
                return decode_json[Error](content)
            case _:
                return RawError(status_code, content)


get_ops_status_error_mapper: Final[ErrorMapper[GetOpsStatusErrorBody]] = _GetOpsStatusError()
