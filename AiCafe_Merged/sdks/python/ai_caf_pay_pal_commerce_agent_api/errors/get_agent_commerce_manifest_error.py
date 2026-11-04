from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Final, TypeAlias

from ..core import ErrorMapper, RawError, decode_json

GetAgentCommerceManifestErrorBody: TypeAlias = Any | RawError


@dataclass(frozen=True, slots=True)
class _GetAgentCommerceManifestError:
    def map(self, status_code: int, content: bytes) -> GetAgentCommerceManifestErrorBody:
        match status_code:
            case 503:
                return decode_json[Any](content)
            case _:
                return RawError(status_code, content)


get_agent_commerce_manifest_error_mapper: Final[
    ErrorMapper[GetAgentCommerceManifestErrorBody]
] = _GetAgentCommerceManifestError()
