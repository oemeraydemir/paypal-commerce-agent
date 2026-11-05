from enum import Enum
from typing import Annotated, TypeAlias

from ...core import open_enum_validator


class Dietary(str, Enum):
    VALUE_VEGETARIAN_DESCRIPTION_ENUM_VALUE_VEGETARIAN = "{\"value\":\"vegetarian\",\"description\":\"Enum value vegetarian.\"}"
    VALUE_VEGAN_DESCRIPTION_ENUM_VALUE_VEGAN = "{\"value\":\"vegan\",\"description\":\"Enum value vegan.\"}"
    VALUE_GLUTEN_FREE_DESCRIPTION_ENUM_VALUE_GLUTEN_FREE = "{\"value\":\"gluten-free\",\"description\":\"Enum value gluten-free.\"}"

    __str__ = str.__str__


DietaryOrStr: TypeAlias = Annotated[Dietary | str, open_enum_validator(Dietary)]
