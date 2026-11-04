from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error

ProposeRefundErrorBody: TypeAlias = Error | RawError


@dataclass(frozen=True, slots=True)
class _ProposeRefundError:
    def map(self, status_code: int, content: bytes) -> ProposeRefundErrorBody:
        match status_code:
            case 400 | 401 | 404 | 409 | 422:
                return decode_json[Error](content)
            case _:
                return RawError(status_code, content)


propose_refund_error_mapper: Final[ErrorMapper[ProposeRefundErrorBody]] = _ProposeRefundError()
