from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class Notice(str, Enum):
    VALUE_SAMPLE_MENU_DATA_DESCRIPTION_ENUM_VALUE_SAMPLE_MENU_DATA = "{\"value\":\"sample-menu-data\",\"description\":\"Enum value sample-menu-data.\"}"
    VALUE_ALLERGEN_UNVERIFIED_DESCRIPTION_ENUM_VALUE_ALLERGEN_UNVERIFIED = "{\"value\":\"allergen-unverified\",\"description\":\"Enum value allergen-unverified.\"}"
    VALUE_SANDBOX_ONLY_DESCRIPTION_ENUM_VALUE_SANDBOX_ONLY = "{\"value\":\"sandbox-only\",\"description\":\"Enum value sandbox-only.\"}"

    __str__ = str.__str__


NoticeOrStr: TypeAlias = Annotated[Notice | str, open_enum_validator(Notice)]
