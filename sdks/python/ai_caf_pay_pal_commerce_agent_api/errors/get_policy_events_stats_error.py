from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error

GetPolicyEventsStatsErrorBody: TypeAlias = Error | RawError


@dataclass(frozen=True, slots=True)
class _GetPolicyEventsStatsError:
    def map(self, status_code: int, content: bytes) -> GetPolicyEventsStatsErrorBody:
        match status_code:
            case 401 | 429 | 503:
                return decode_json[Error](content)
            case _:
                return RawError(status_code, content)


get_policy_events_stats_error_mapper: Final[ErrorMapper[GetPolicyEventsStatsErrorBody]] = _GetPolicyEventsStatsError()
