from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error

GetCheckoutReturnErrorBody: TypeAlias = Error | RawError


@dataclass(frozen=True, slots=True)
class _GetCheckoutReturnError:
    def map(self, status_code: int, content: bytes) -> GetCheckoutReturnErrorBody:
        match status_code:
            case code if 400 <= code <= 499:
                return decode_json[Error](content)
            case _:
                return RawError(status_code, content)


get_checkout_return_error_mapper: Final[ErrorMapper[GetCheckoutReturnErrorBody]] = _GetCheckoutReturnError()
