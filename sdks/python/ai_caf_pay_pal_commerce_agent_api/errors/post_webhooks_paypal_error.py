from __future__ import annotations

from dataclasses import dataclass
from typing import Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json
from ..models.error import Error

PostWebhooksPaypalErrorBody: TypeAlias = Error | RawError


@dataclass(frozen=True, slots=True)
class _PostWebhooksPaypalError:
    def map(self, status_code: int, content: bytes) -> PostWebhooksPaypalErrorBody:
        match status_code:
            case 401:
                return decode_json[Error](content)
            case _:
                return RawError(status_code, content)


post_webhooks_paypal_error_mapper: Final[ErrorMapper[PostWebhooksPaypalErrorBody]] = _PostWebhooksPaypalError()
