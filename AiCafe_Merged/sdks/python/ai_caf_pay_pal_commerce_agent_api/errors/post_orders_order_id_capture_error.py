from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error

PostOrdersOrderIdCaptureErrorBody: TypeAlias = Error | RawError


@dataclass(frozen=True, slots=True)
class _PostOrdersOrderIdCaptureError:
    def map(self, status_code: int, content: bytes) -> PostOrdersOrderIdCaptureErrorBody:
        match status_code:
            case 400 | 402 | 404 | 409 | 429 | 502 | 503:
                return decode_json[Error](content)
            case _:
                return RawError(status_code, content)


post_orders_order_id_capture_error_mapper: Final[
    ErrorMapper[PostOrdersOrderIdCaptureErrorBody]
] = _PostOrdersOrderIdCaptureError()
