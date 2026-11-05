from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error

GetPolicyEventsErrorBody: TypeAlias = Error | RawError


@dataclass(frozen=True, slots=True)
class _GetPolicyEventsError:
    def map(self, status_code: int, content: bytes) -> GetPolicyEventsErrorBody:
        match status_code:
            case 400 | 401 | 429 | 503:
                return decode_json[Error](content)
            case _:
                return RawError(status_code, content)


get_policy_events_error_mapper: Final[ErrorMapper[GetPolicyEventsErrorBody]] = _GetPolicyEventsError()
