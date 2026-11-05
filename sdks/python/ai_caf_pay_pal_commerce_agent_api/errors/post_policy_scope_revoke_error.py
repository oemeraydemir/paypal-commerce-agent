from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error

PostPolicyScopeRevokeErrorBody: TypeAlias = Error | RawError


@dataclass(frozen=True, slots=True)
class _PostPolicyScopeRevokeError:
    def map(self, status_code: int, content: bytes) -> PostPolicyScopeRevokeErrorBody:
        match status_code:
            case 401 | 404:
                return decode_json[Error](content)
            case _:
                return RawError(status_code, content)


post_policy_scope_revoke_error_mapper: Final[
    ErrorMapper[PostPolicyScopeRevokeErrorBody]
] = _PostPolicyScopeRevokeError()
