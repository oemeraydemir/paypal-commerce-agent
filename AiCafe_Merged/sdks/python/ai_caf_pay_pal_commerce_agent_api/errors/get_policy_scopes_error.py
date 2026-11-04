from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error

GetPolicyScopesErrorBody: TypeAlias = Error | RawError


@dataclass(frozen=True, slots=True)
class _GetPolicyScopesError:
    def map(self, status_code: int, content: bytes) -> GetPolicyScopesErrorBody:
        match status_code:
            case 400 | 401:
                return decode_json[Error](content)
            case _:
                return RawError(status_code, content)


get_policy_scopes_error_mapper: Final[ErrorMapper[GetPolicyScopesErrorBody]] = _GetPolicyScopesError()
