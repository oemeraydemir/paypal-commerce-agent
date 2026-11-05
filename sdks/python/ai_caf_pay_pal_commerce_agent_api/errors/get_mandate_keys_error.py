from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error

GetMandateKeysErrorBody: TypeAlias = Error | RawError


@dataclass(frozen=True, slots=True)
class _GetMandateKeysError:
    def map(self, status_code: int, content: bytes) -> GetMandateKeysErrorBody:
        match status_code:
            case 503:
                return decode_json[Error](content)
            case _:
                return RawError(status_code, content)


get_mandate_keys_error_mapper: Final[ErrorMapper[GetMandateKeysErrorBody]] = _GetMandateKeysError()
