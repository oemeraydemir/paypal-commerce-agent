from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json

GetHealthErrorBody: TypeAlias = Any | RawError


@dataclass(frozen=True, slots=True)
class _GetHealthError:
    def map(self, status_code: int, content: bytes) -> GetHealthErrorBody:
        match status_code:
            case 503:
                return decode_json[Any](content)
            case _:
                return RawError(status_code, content)


get_health_error_mapper: Final[ErrorMapper[GetHealthErrorBody]] = _GetHealthError()
