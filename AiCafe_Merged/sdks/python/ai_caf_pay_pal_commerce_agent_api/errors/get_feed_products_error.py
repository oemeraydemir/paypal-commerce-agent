from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json

GetFeedProductsErrorBody: TypeAlias = Any | RawError


@dataclass(frozen=True, slots=True)
class _GetFeedProductsError:
    def map(self, status_code: int, content: bytes) -> GetFeedProductsErrorBody:
        match status_code:
            case 503:
                return decode_json[Any](content)
            case _:
                return RawError(status_code, content)


get_feed_products_error_mapper: Final[ErrorMapper[GetFeedProductsErrorBody]] = _GetFeedProductsError()
