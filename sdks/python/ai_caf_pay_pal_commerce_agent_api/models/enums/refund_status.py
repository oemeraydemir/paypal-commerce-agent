from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class RefundStatus(str, Enum):
    """Lifecycle state of a refund request."""

    VALUE_UNDER_REVIEW_DESCRIPTION_AWAITING_MERCHANT_APPROVAL = "{\"value\":\"UNDER_REVIEW\",\"description\":\"Awaiting merchant approval\"}"
    VALUE_APPROVED_DESCRIPTION_APPROVED_NOT_YET_ISSUED = "{\"value\":\"APPROVED\",\"description\":\"Approved, not yet issued\"}"
    VALUE_REJECTED_DESCRIPTION_REJECTED = "{\"value\":\"REJECTED\",\"description\":\"Rejected\"}"
    VALUE_REFUNDED_DESCRIPTION_ISSUED_VIA_PAY_PAL = "{\"value\":\"REFUNDED\",\"description\":\"Issued via PayPal\"}"
    VALUE_FAILED_DESCRIPTION_FAILED_RETRY_ELIGIBLE = "{\"value\":\"FAILED\",\"description\":\"Failed; retry eligible\"}"

    __str__ = str.__str__


RefundStatusOrStr: TypeAlias = Annotated[RefundStatus | str, open_enum_validator(RefundStatus)]
