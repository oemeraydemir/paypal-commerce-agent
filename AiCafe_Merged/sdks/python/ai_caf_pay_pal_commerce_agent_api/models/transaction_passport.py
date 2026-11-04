from __future__ import annotations

from typing import Literal

from pydantic import Field
from typing_extensions import NotRequired, TypedDict

from ..core import UNSET, Optional, SdkBaseModel
from .basis import Basis, BasisDict
from .control import Control, ControlDict
from .enums.notice import NoticeOrStr
from .line import Line, LineDict
from .mandate import Mandate, MandateDict
from .policy_check import PolicyCheck, PolicyCheckDict
from .step import Step, StepDict


class TransactionPassport(SdkBaseModel):
    """Read-only, server-derived explanation of one prepared cart. Not a payment record, never stored or signed; payment
    authority is always the shopper."""

    kind: Literal[
        "{\n  \"value\": \"transaction-passport\",\n  \"description\": \"Enum value transaction-passport.\"\n}"
    ] = "{\n  \"value\": \"transaction-passport\",\n  \"description\": \"Enum value transaction-passport.\"\n}"
    """kind (field)."""

    is_payment_record: Literal["False"] = Field(default="False", alias="isPaymentRecord")
    """is payment record (field)."""

    total_minor: int = Field(alias="totalMinor")
    """total in minor currency units (field)."""

    currency: str
    """ISO 4217 currency code (e.g. EUR) (field)."""

    lines: list[Line]
    """lines (field)."""

    basis: Optional[Basis] = UNSET
    """basis."""

    mandate: Mandate
    """mandate."""

    control: Control
    """control."""

    checks: Optional[list[PolicyCheck]] = UNSET
    """checks (field)."""

    steps: list[Step]
    """steps (field)."""

    notices: list[NoticeOrStr]
    """notices (field)."""


class TransactionPassportDict(TypedDict):
    kind: Literal[
        "{\n  \"value\": \"transaction-passport\",\n  \"description\": \"Enum value transaction-passport.\"\n}"
    ]
    is_payment_record: Literal["False"]
    total_minor: int
    currency: str
    lines: list[LineDict]
    basis: NotRequired[BasisDict]
    mandate: MandateDict
    control: ControlDict
    checks: NotRequired[list[PolicyCheckDict]]
    steps: list[StepDict]
    notices: list[NoticeOrStr]
