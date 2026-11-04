from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error
from ..models.refund_request import RefundRequest

ApproveRefundErrorBody: TypeAlias = Error | RefundRequest | RawError


@dataclass(frozen=True, slots=True)
class _ApproveRefundError:
    def map(self, status_code: int, content: bytes) -> ApproveRefundErrorBody:
        match status_code:
            case 401 | 404 | 409 | 503:
                return decode_json[Error](content)
            case 502:
                return decode_json[RefundRequest](content)
            case _:
                return RawError(status_code, content)


approve_refund_error_mapper: Final[ErrorMapper[ApproveRefundErrorBody]] = _ApproveRefundError()
