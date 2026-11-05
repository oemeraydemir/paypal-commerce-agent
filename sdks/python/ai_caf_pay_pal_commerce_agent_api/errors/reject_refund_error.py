from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error

RejectRefundErrorBody: TypeAlias = Error | RawError


@dataclass(frozen=True, slots=True)
class _RejectRefundError:
    def map(self, status_code: int, content: bytes) -> RejectRefundErrorBody:
        match status_code:
            case 401 | 404 | 409:
                return decode_json[Error](content)
            case _:
                return RawError(status_code, content)


reject_refund_error_mapper: Final[ErrorMapper[RejectRefundErrorBody]] = _RejectRefundError()
