from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error

PostMandatesVerifyErrorBody: TypeAlias = Error | RawError


@dataclass(frozen=True, slots=True)
class _PostMandatesVerifyError:
    def map(self, status_code: int, content: bytes) -> PostMandatesVerifyErrorBody:
        match status_code:
            case 503:
                return decode_json[Error](content)
            case _:
                return RawError(status_code, content)


post_mandates_verify_error_mapper: Final[ErrorMapper[PostMandatesVerifyErrorBody]] = _PostMandatesVerifyError()
