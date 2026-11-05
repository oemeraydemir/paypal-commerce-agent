from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error

GetOrdersErrorBody: TypeAlias = Error | RawError


@dataclass(frozen=True, slots=True)
class _GetOrdersError:
    def map(self, status_code: int, content: bytes) -> GetOrdersErrorBody:
        match status_code:
            case 400 | 401 | 429 | 503:
                return decode_json[Error](content)
            case _:
                return RawError(status_code, content)


get_orders_error_mapper: Final[ErrorMapper[GetOrdersErrorBody]] = _GetOrdersError()
