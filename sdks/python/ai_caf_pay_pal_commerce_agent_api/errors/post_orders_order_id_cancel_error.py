from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error

PostOrdersOrderIdCancelErrorBody: TypeAlias = Error | RawError


@dataclass(frozen=True, slots=True)
class _PostOrdersOrderIdCancelError:
    def map(self, status_code: int, content: bytes) -> PostOrdersOrderIdCancelErrorBody:
        match status_code:
            case 404 | 409:
                return decode_json[Error](content)
            case _:
                return RawError(status_code, content)


post_orders_order_id_cancel_error_mapper: Final[
    ErrorMapper[PostOrdersOrderIdCancelErrorBody]
] = _PostOrdersOrderIdCancelError()
