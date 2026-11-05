"""The absent credential, and the two ways an operation's ``security`` composes several schemes.

:data:`no_auth` is what an unconfigured credential becomes, and :func:`is_configured` tests identity
against that one instance -- never "applying it did not raise", so a *blank* credential is configured
and is sent. :class:`AllSchemes` and :class:`AnySchemes`, with their async twins, are OpenAPI's AND and
OR requirements. Neither withholds a request over a partial set: the SDK never refuses to send because
a credential is missing, the server decides.

All four composites carry ``invalidate``, which makes a composite itself revocable so nesting
propagates."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from .models import AuthParams
from .protocols import AsyncAuthScheme, AuthScheme, RevocableAuthScheme


async def resolve_auth(scheme: AsyncAuthScheme) -> AuthParams:
    """The async client's counterpart to a plain ``scheme.apply()``.

    Narrowing is on :class:`AuthParams` rather than on awaitability, so the awaited branch keeps its
    precise type instead of widening to ``Any``.

    Args:
        scheme: The scheme to apply, whether or not it needs I/O to produce its parameters.

    Returns:
        What the scheme contributes to this request."""
    applied = scheme.apply()
    return applied if isinstance(applied, AuthParams) else await applied


@dataclass(frozen=True, slots=True)
class _NoAuth:
    """The absent credential: a scheme that contributes nothing.

    Private so that :func:`is_configured` can test identity against the one instance below; a second
    instance would be indistinguishable from a configured scheme by that test."""

    def apply(self) -> AuthParams:
        return AuthParams()


no_auth: Final[AuthScheme] = _NoAuth()
"""What the client writes when a credential is absent, and ``execute``'s default.

An endpoint whose operation declares no ``security`` omits ``auth=`` entirely and takes this. The SDK
never refuses to send a request because a credential is missing -- the server decides."""


def is_configured(scheme: AuthScheme | AsyncAuthScheme) -> bool:
    """Whether a credential was supplied for ``scheme``.

    Identity against the one null object, never "applying it did not raise". A *blank* credential is
    configured and is sent: ``None`` is the only sentinel.

    Args:
        scheme: The scheme to test, a caller's own included.

    Returns:
        ``True`` unless this is the null object :data:`no_auth`."""
    return scheme is not no_auth


def invalidate(scheme: AuthScheme | AsyncAuthScheme) -> None:
    """Drop whatever ``scheme`` cached, if it caches anything at all.

    A no-op for every static scheme, so on an API with no managed OAuth the 401 branch in ``execute``
    costs one ``isinstance`` and nothing else.

    Args:
        scheme: The scheme a 401 was received against."""
    if isinstance(scheme, RevocableAuthScheme):
        scheme.invalidate()


class AllSchemes:
    """AND-composition: every configured member applies.

    An unconfigured member contributes nothing and drops out on its own; the request still goes out
    with whatever *was* configured. This layer never withholds a request over a partial set."""

    __slots__ = ("_schemes",)

    def __init__(self, *schemes: AuthScheme) -> None:
        self._schemes = schemes

    def apply(self) -> AuthParams:
        applied = [scheme.apply() for scheme in self._schemes]
        return AuthParams(
            headers=tuple(p for a in applied for p in a.headers),
            query_params=tuple(p for a in applied for p in a.query_params),
            cookies=tuple(p for a in applied for p in a.cookies),
        )

    def invalidate(self) -> None:
        """Drop every member's cached credential, via the module-level :func:`invalidate`.

        Having this makes a composite itself revocable, so nesting one inside another propagates."""
        for scheme in self._schemes:
            invalidate(scheme)


class AnySchemes:
    """OR-composition: the first *configured* member applies.

    Selection is on credential presence, never on "applying it did not fail" -- an unconfigured member
    listed ahead of a configured one must not win and send the request unauthenticated. With nothing
    configured the request goes out unauthenticated, as a single unconfigured scheme would."""

    __slots__ = ("_schemes",)

    def __init__(self, *schemes: AuthScheme) -> None:
        self._schemes = schemes

    def apply(self) -> AuthParams:
        for scheme in self._schemes:
            if is_configured(scheme):
                return scheme.apply()
        return AuthParams()

    def invalidate(self) -> None:
        """Drop every member's cached credential; see :meth:`AllSchemes.invalidate`.

        Over-invalidates on purpose: which arm won the last :meth:`apply` is not tracked, and tracking
        it would mean per-request state on an object every request shares."""
        for scheme in self._schemes:
            invalidate(scheme)


class AsyncAllSchemes:
    """:class:`AllSchemes` for the asynchronous client: a member may await its credential."""

    __slots__ = ("_schemes",)

    def __init__(self, *schemes: AsyncAuthScheme) -> None:
        self._schemes = schemes

    async def apply(self) -> AuthParams:
        applied = [await resolve_auth(scheme) for scheme in self._schemes]
        return AuthParams(
            headers=tuple(p for a in applied for p in a.headers),
            query_params=tuple(p for a in applied for p in a.query_params),
            cookies=tuple(p for a in applied for p in a.cookies),
        )

    def invalidate(self) -> None:
        """See :meth:`AllSchemes.invalidate`. Not a coroutine: dropping a cache never awaits."""
        for scheme in self._schemes:
            invalidate(scheme)


class AsyncAnySchemes:
    """:class:`AnySchemes` for the asynchronous client: the chosen member may await its credential.

    Selection still happens without I/O, so only the one member that wins is ever resolved."""

    __slots__ = ("_schemes",)

    def __init__(self, *schemes: AsyncAuthScheme) -> None:
        self._schemes = schemes

    async def apply(self) -> AuthParams:
        for scheme in self._schemes:
            if is_configured(scheme):
                return await resolve_auth(scheme)
        return AuthParams()

    def invalidate(self) -> None:
        """See :meth:`AnySchemes.invalidate`, including why it over-invalidates."""
        for scheme in self._schemes:
            invalidate(scheme)
