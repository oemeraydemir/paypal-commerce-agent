from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error

GetCatalogSearchErrorBody: TypeAlias = Error | RawError


@dataclass(frozen=True, slots=True)
class _GetCatalogSearchError:
    def map(self, status_code: int, content: bytes) -> GetCatalogSearchErrorBody:
        match status_code:
            case code if 400 <= code <= 499:
                return decode_json[Error](content)
            case _:
                return RawError(status_code, content)


get_catalog_search_error_mapper: Final[ErrorMapper[GetCatalogSearchErrorBody]] = _GetCatalogSearchError()
