from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error

PostOrdersCreateErrorBody: TypeAlias = Error | RawError


@dataclass(frozen=True, slots=True)
class _PostOrdersCreateError:
    def map(self, status_code: int, content: bytes) -> PostOrdersCreateErrorBody:
        match status_code:
            case 400 | 403 | 429 | 503:
                return decode_json[Error](content)
            case _:
                return RawError(status_code, content)


post_orders_create_error_mapper: Final[ErrorMapper[PostOrdersCreateErrorBody]] = _PostOrdersCreateError()
