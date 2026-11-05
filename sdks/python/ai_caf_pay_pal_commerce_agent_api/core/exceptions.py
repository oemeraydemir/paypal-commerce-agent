"""The SDK's own exception types: a failed call, and a call that never happened.

The two are disjoint by construction. :class:`ApiError` means the server answered and the answer was
an error, so it carries a decoded body. :class:`TransportError` means no answer arrived at all, so
there is nothing to decode -- only what went wrong on the way."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Generic

from typing_extensions import TypeVar

E = TypeVar("E", default=object)


class ApiError(Exception, Generic[E]):
    """A failed API call, raised by the parsed response mode.

    ``error`` is the decoded response body -- a typed union of the operation's documented
    error schemas, or :class:`RawError` for a status the operation does not document. That
    payload *is* the information, so neither string form embeds it: ``str`` and ``repr``
    identify the failure by status and error type only, which keeps response bodies out of logs
    and tracebacks. Read ``.error`` to inspect it."""

    def __init__(self, error: E, status_code: int, headers: Mapping[str, str]) -> None:
        # Composed once: ``Exception.__str__`` returns a single argument verbatim, so
        # ``args[0]`` and ``str(self)`` are the same string by construction.
        super().__init__(f"HTTP {status_code}: {type(error).__name__}")
        self.error: E = error
        self.status_code = status_code
        self.headers: Mapping[str, str] = headers
        """Header names lowercased, per the transports' obligation -- look keys up in lowercase."""

    def __repr__(self) -> str:
        return f"{type(self).__name__}(status_code={self.status_code}, error={type(self.error).__name__})"

    def __reduce__(self) -> tuple[type[ApiError[E]], tuple[E, int, Mapping[str, str]], dict[str, Any]]:
        # ``BaseException``'s default reduce replays ``args`` through ``__init__``, which takes
        # three arguments -- so pickling and copying both fail without this. The state mapping is
        # what carries ``__notes__`` and any subclass attribute across the round trip.
        return (type(self), (self.error, self.status_code, self.headers), self.__dict__)


class TransportError(Exception):
    """A request never produced a response -- the connection failed, timed out, or was dropped.

    Raised by a transport, never by the pipeline. It is the one failure shape the retry loop can act
    on without knowing which HTTP library moved the bytes, which is what keeps that library named in
    a single module: a loop that caught the library's own connection error would have to import that
    library to say so.

    A transport author's vocabulary, not a caller's. It is exported from ``core`` beside
    :class:`~.transport.HttpClient`, because custom transport has to raise it for the retry loop to
    act on a failed send -- whatever else that transport raises reaches the caller on the first
    attempt. A caller does not catch it: when the last attempt fails, ``execute`` raises
    :attr:`inner_exception` in this wrapper's place, ``from`` the cause that exception already
    carried -- which restates what it held rather than clearing it, and suppresses this wrapper from
    the chain it is printed with. So
    it adds nothing to what it wraps. Transport passes the original exception itself rather
    than a string of it, both as ``__cause__`` and as the single argument: ``Exception.__str__``
    renders a lone argument through ``str``, so the message reads identically, and nothing is
    flattened on the way through.
    A distinction worth narrowing on, a timeout against a refused connection among them, belongs to
    the exception the caller actually sees; the loop itself draws none, waiting the same curve for
    both.

    A response that arrived and said 4xx or 5xx is not this -- that is an :class:`ApiError`, or a
    :class:`~.results.Failure` in the raw response mode. This type means there was no response."""

    def __init__(self, inner_exception: Exception) -> None:
        super().__init__(inner_exception)
        self.inner_exception = inner_exception
        """What the transport itself raised, and the only thing this type carries.

        Required, so a wrapper that cannot say what failed is a build failure rather than a runtime
        discovery. ``args`` is the same one value, which is what lets ``BaseException``'s default
        ``__reduce__`` replay it unaided."""
