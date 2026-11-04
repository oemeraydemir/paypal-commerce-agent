from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error

PostPolicyPreviewErrorBody: TypeAlias = Error | RawError


@dataclass(frozen=True, slots=True)
class _PostPolicyPreviewError:
    def map(self, status_code: int, content: bytes) -> PostPolicyPreviewErrorBody:
        match status_code:
            case 400 | 429:
                return decode_json[Error](content)
            case _:
                return RawError(status_code, content)


post_policy_preview_error_mapper: Final[ErrorMapper[PostPolicyPreviewErrorBody]] = _PostPolicyPreviewError()
