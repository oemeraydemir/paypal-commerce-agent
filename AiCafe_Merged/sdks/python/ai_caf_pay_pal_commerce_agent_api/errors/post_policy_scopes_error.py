from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error

PostPolicyScopesErrorBody: TypeAlias = Error | RawError


@dataclass(frozen=True, slots=True)
class _PostPolicyScopesError:
    def map(self, status_code: int, content: bytes) -> PostPolicyScopesErrorBody:
        match status_code:
            case 400 | 401 | 422:
                return decode_json[Error](content)
            case _:
                return RawError(status_code, content)


post_policy_scopes_error_mapper: Final[ErrorMapper[PostPolicyScopesErrorBody]] = _PostPolicyScopesError()
