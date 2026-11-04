"""The base model every domain model subclasses."""

from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

from .optionality import strip_unset


class SdkBaseModel(BaseModel):
    """Base class for every domain model.

    Immutable (``frozen``), **preserves** unknown JSON fields rather than dropping
    them (``extra="allow"``), accepts either the Python field name or its wire alias
    on input, and serializes declared fields back under the wire alias. Attribute
    docstrings on fields are lifted into their schema ``description``.

    A field the server adds after this SDK was generated survives on the instance --
    readable via ``model_extra``, or by attribute access unless the key collides with
    the model API -- and is re-emitted under the key it arrived with, at every nesting
    level. Preservation is deliberately symmetric: an unknown key a caller supplies is
    likewise sent, so a model received from the server can be echoed back without
    silently discarding server-side state. See
    ``docs/designs/unknown-field-preservation.md``.

    ``frozen`` blocks rebinding an attribute; it does not deep-freeze values. The
    contents of a ``list``/``dict`` field and the ``model_extra`` mapping remain
    mutable in place.

    :meth:`to_dict` and :meth:`to_json` are the ergonomic front door to serialization;
    ``model_dump``/``model_dump_json`` remain available for the full option set. See
    ``docs/designs/model-serialization-helpers.md``."""

    model_config = ConfigDict(
        frozen=True,
        extra="allow",
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
        use_attribute_docstrings=True,
    )

    def to_dict(
        self,
        *,
        mode: Literal["json", "python"] = "json",
        by_alias: bool = True,
        exclude_unset: bool = False,
        exclude_defaults: bool = False,
        exclude_none: bool = False,
    ) -> dict[str, Any]:
        """Return this model as a dictionary in the shape the API exchanges.

        Defaults produce JSON-safe values under the wire alias of every field, so the
        result is ``json.dumps``-able, equals ``json.loads(self.to_json())``, and
        validates back into an equal model -- including through a discriminated-union
        alias. Unknown fields the server sent are included (see
        ``docs/designs/unknown-field-preservation.md``).

        This is a convenience wrapper over ``model_dump``; reach for that directly when
        you need the options this deliberately does not surface (``include``/``exclude``,
        ``context``, ``round_trip``, ``warnings``, ``serialize_as_any``, ``fallback``).

        A field typed ``OptionalNullable[...]`` (e.g. an omit-vs-null field) that the caller
        never touched is always omitted here, even though plain ``model_dump`` shows it as
        ``null`` -- this is the one documented exception to "exactly the underlying dump".
        See ``docs/designs/optional-nullable-fields.md``.

        Args:
            mode: ``"json"`` coerces values to JSON-safe types (``datetime`` becomes a
                string); ``"python"`` keeps the Python objects.
            by_alias: Emit each field under its wire alias rather than its Python name.
                The base config already serializes by alias, so this restates the
                contract; pass ``False`` for Python-name keys.
            exclude_unset: Omit fields that were never explicitly set, narrowing the
                output to what the server actually sent. **Opt-in, not the default**:
                a variant that pins its tag in its own schema carries it as a
                *defaulted* field, so on a locally constructed model this drops the tag
                and the result no longer validates against the union alias.
            exclude_defaults: Omit fields still holding their default value.
            exclude_none: Omit fields whose value is ``None``. The round-trip-safe way
                to suppress nulls -- it keeps defaulted discriminators.

        Returns:
            The model's fields keyed by wire alias, plus any unknown fields it preserved."""
        return strip_unset(
            self,
            self.model_dump(
                mode=mode,
                by_alias=by_alias,
                exclude_unset=exclude_unset,
                exclude_defaults=exclude_defaults,
                exclude_none=exclude_none,
            ),
        )

    def to_json(
        self,
        *,
        indent: int | None = 2,
        by_alias: bool = True,
        exclude_unset: bool = False,
        exclude_defaults: bool = False,
        exclude_none: bool = False,
    ) -> str:
        """Return this model as a JSON string in the shape the API exchanges.

        Indented by default for logs and debugging, and otherwise identical in content
        to :meth:`to_dict` -- ``json.loads(self.to_json()) == self.to_dict()``.

        This is a convenience wrapper over ``model_dump``/``model_dump_json``; reach for
        those directly when you need the options this deliberately does not surface
        (``include``/``exclude``, ``context``, ``round_trip``, ``warnings``,
        ``ensure_ascii``, ``serialize_as_any``, ``fallback``).

        Built on :meth:`to_dict` (rather than delegating to ``model_dump_json`` directly)
        so the pair can never drift apart -- including the ``OptionalNullable`` omission
        documented there.

        Args:
            indent: Spaces of indentation; ``None`` emits compact JSON.
            by_alias: Emit each field under its wire alias rather than its Python name.
            exclude_unset: Omit fields that were never explicitly set. Carries the same
                discriminator caveat as :meth:`to_dict`.
            exclude_defaults: Omit fields still holding their default value.
            exclude_none: Omit fields whose value is ``None``.

        Returns:
            The JSON text the API exchanges, indented unless ``indent`` is ``None``."""
        return json.dumps(
            self.to_dict(
                mode="json",
                by_alias=by_alias,
                exclude_unset=exclude_unset,
                exclude_defaults=exclude_defaults,
                exclude_none=exclude_none,
            ),
            indent=indent,
            ensure_ascii=False,
        )
