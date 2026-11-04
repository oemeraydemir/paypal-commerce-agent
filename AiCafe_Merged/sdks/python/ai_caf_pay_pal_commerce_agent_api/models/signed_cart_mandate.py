from __future__ import annotations

from typing import Any, Literal

from typing_extensions import TypedDict

from ..core import SdkBaseModel


class SignedCartMandate(SdkBaseModel):
    """signed cart mandate."""

    mandate: Any
    """Canonical content that was signed (version aicafe.cart-mandate/1)."""

    signature: str
    """base64url Ed25519 signature over the stable-stringified mandate"""

    alg: Literal[
        "{\n  \"value\": \"EdDSA\",\n  \"description\": \"Enum value EdDSA.\"\n}"
    ] = "{\n  \"value\": \"EdDSA\",\n  \"description\": \"Enum value EdDSA.\"\n}"
    """alg (field)."""

    kid: str
    """Key id: the active key or a configured previous public key"""

    canonicalization: Literal[
        "{\n  \"value\": \"aicafe-stable-json/1\",\n  \"description\": \"Enum value aicafe-stable-json/1.\"\n}"
    ] = "{\n  \"value\": \"aicafe-stable-json/1\",\n  \"description\": \"Enum value aicafe-stable-json/1.\"\n}"
    """UTF-8 JSON, object keys sorted, no whitespace (fast-json-stable-stringify 2.x). Not RFC 8785."""


class SignedCartMandateDict(TypedDict):
    mandate: Any
    signature: str
    alg: Literal["{\n  \"value\": \"EdDSA\",\n  \"description\": \"Enum value EdDSA.\"\n}"]
    kid: str
    canonicalization: Literal[
        "{\n  \"value\": \"aicafe-stable-json/1\",\n  \"description\": \"Enum value aicafe-stable-json/1.\"\n}"
    ]
