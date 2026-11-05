from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json

GetLlmsTxtErrorBody: TypeAlias = Any | RawError


@dataclass(frozen=True, slots=True)
class _GetLlmsTxtError:
    def map(self, status_code: int, content: bytes) -> GetLlmsTxtErrorBody:
        match status_code:
            case 503:
                return decode_json[Any](content)
            case _:
                return RawError(status_code, content)


get_llms_txt_error_mapper: Final[ErrorMapper[GetLlmsTxtErrorBody]] = _GetLlmsTxtError()
