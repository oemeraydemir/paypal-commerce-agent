"""The seams every endpoint crosses: build a request, send it, shape a result.

Pagination does not live here. ``pagination.paginate`` and ``async_paginate`` run that loop, calling the
endpoint's ``execute`` once per page.

The twins live in one module so the few ``await``s they differ by stay visible on one screen."""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Generic, TypeVar

from ._internal.headers import resolve_headers
from ._internal.urls import build_url, resolve_params
from .auth import AsyncAuthScheme, AuthParams, AuthScheme, invalidate, no_auth, resolve_auth
from .bodies import RequestBody, content_headers
from .decoding import AsyncResponseDecoder, ErrorMapper, ResponseDecoder
from .exceptions import TransportError
from .logging import HttpLog, LoggingOptions
from .params import Param, UrlTemplate
from .request_options import RequestOptions, RequestOptionsOrDict, apply_retry_overrides
from .results import ApiResult, Failure, Success
from .retries import RetryOptions, backoff_seconds, is_retryable_body, retry_after_seconds
from .transport import (
    AsyncHttpClient,
    AsyncHttpResponse,
    HttpClient,
    HttpMethod,
    HttpRequest,
    HttpResponse,
)

T = TypeVar("T")
E = TypeVar("E")
TransportT = TypeVar("TransportT", bound=HttpClient | AsyncHttpClient)


@dataclass(frozen=True, slots=True)
class BaseRawClient(Generic[TransportT]):
    """Shared state for the raw clients, and the one place a request is composed from it.

    The type parameter pins the one transport a flavor can use, so :class:`RawClient` is provably
    sync and :class:`AsyncRawClient` provably async. The ``global_*`` fields are spec-derived -- the
    generator writes them, an API declaring none leaves them empty -- and each is combined with a
    call's own parameters by the matching ``resolve_*`` function, so this class decides nothing
    about precedence. For headers and query parameters alike that order is::

        global_*  ->  the endpoint's own  ->  auth  ->  the caller's extra_headers

    Auth outranks the endpoint so an operation parameter cannot clobber a credential, and loses to
    ``extra_headers`` because that is how a caller deliberately overrides one. ``_build_request`` takes
    the scheme already resolved, as :class:`~.auth.AuthParams`, because resolving it may await; it
    never sends and never logs."""

    http_client: TransportT

    retry_options: RetryOptions

    logging_options: LoggingOptions

    global_headers: Sequence[Param[Any]] = ()
    global_query_params: Sequence[Param[Any]] = ()
    global_path_params: Sequence[Param[Any]] = ()

    def _build_request(
        self,
        *,
        http_method: HttpMethod,
        url_template: UrlTemplate,
        path_params: Sequence[Param[Any]] | None,
        query_params: Sequence[Param[Any]] | None,
        headers: Sequence[Param[Any]] | None,
        body: RequestBody | None,
        auth: AuthParams,
        options: RequestOptions,
    ) -> HttpRequest:
        """Resolve the API-wide, endpoint, auth and caller layers into one request, the body's own
        label beneath them all."""
        return HttpRequest(
            method=http_method,
            url=build_url(
                url_template,
                path_params=resolve_params(self.global_path_params, path_params),
                query_params=resolve_params(self.global_query_params, (*(query_params or ()), *auth.query_params)),
            ),
            headers={
                **content_headers(body),
                **resolve_headers(
                    self.global_headers,
                    (*(headers or ()), *auth.request_headers()),
                    extra_headers=options.extra_headers,
                ),
            },
            body=body,
            timeout=options.timeout,
        )


@dataclass(frozen=True, slots=True)
class RawClient(BaseRawClient[HttpClient]):
    """Synchronous raw client: builds the request, sends it, shapes the result."""

    def execute(
        self,
        *,
        http_method: HttpMethod,
        url_template: UrlTemplate,
        path_params: Sequence[Param[Any]] | None = None,
        query_params: Sequence[Param[Any]] | None = None,
        headers: Sequence[Param[Any]] | None = None,
        body: RequestBody | None = None,
        auth_scheme: AuthScheme = no_auth,
        decoder: ResponseDecoder[T],
        error_mapper: ErrorMapper[E],
        request_options: RequestOptionsOrDict | None = None,
    ) -> ApiResult[T, E]:
        """Send a request and shape the response into a result.

        Returns once the response head has arrived; the body is the ``decoder``'s from there -- a
        buffered one reads and releases it, ``file_decoder`` hands the open connection to the
        :class:`FileResponse` it builds -- and ``T`` is solved from that argument. A non-2xx body is
        read and the connection released *before* the mapper runs, so a :class:`Failure` never holds
        a connection, even when the mapper raises.

        Args:
            http_method: The HTTP verb to send.
            url_template: The unresolved URL for the configured environment.
            path_params: The endpoint's path parameters, if any.
            query_params: The endpoint's query parameters, if any.
            headers: The endpoint's header parameters, if any.
            body: The request body, already wire-ready, or ``None``.
            auth_scheme: The scheme the operation declares; ``no_auth`` when it declares none.
            decoder: The operation's 2xx decoder; ``empty_response`` when it declares no body.
            error_mapper: The operation's error mapper; ``raw_error_response`` when it declares none.
            request_options: The caller's per-call overrides, if any.

        Returns:
            A :class:`Success` carrying the decoded payload for a 2xx status, otherwise a
            :class:`Failure` carrying the decoded error body.

        Raises:
            ValueError: If the body does not deserialize; not an API error, so it propagates in both
                response modes.
            Exception: What the transport raised when the last attempt produced no response, or when
                the body failed after the head arrived -- never the :class:`TransportError` wrapper."""
        options = RequestOptions.coerce(request_options)
        retry_options = apply_retry_overrides(options, self.retry_options)
        log = HttpLog(
            options=self.logging_options, log_level_override=options.log_level, started_at=time.perf_counter()
        )

        def send() -> HttpResponse:
            request = self._build_request(
                http_method=http_method,
                url_template=url_template,
                path_params=path_params,
                query_params=query_params,
                headers=headers,
                body=body,
                auth=auth_scheme.apply(),
                options=options,
            )
            log.request_sending(request)
            return self.http_client.send(request)

        try:
            response = self._attempt_send(
                auth_scheme=auth_scheme,
                retry_options=retry_options,
                is_retryable=is_retryable_body(body) and http_method in retry_options.http_methods_to_retry,
                send=send,
                log=log,
            )
        except Exception as error:
            # No response was kept: the last attempt's transport error, already unwrapped, or anything raised while
            # an attempt was built, sent or its head handled. ``failed`` writes nothing when no request was reported.
            # A BaseException -- the caller's cancellation -- is not this call failing, and passes untouched.
            log.failed(error)
            raise

        try:
            status_code, response_headers = response.status_code, dict(response.headers)
            if 200 <= status_code < 300:
                # Returns before the read: the body is the decoder's now. The excepts below must never
                # become a finally -- they would close the connection a FileResponse was just handed.
                return Success(
                    payload=decoder.decode(response),
                    status_code=status_code,
                    headers=response_headers,
                )

            content = response.read()
            response.close()
            # Mapped after the close, so a mapper raise cannot leak a connection; the second close it
            # causes is a no-op, since close is required to be idempotent.
            return Failure(
                error=error_mapper.map(status_code, content),
                status_code=status_code,
                headers=response_headers,
            )
        except Exception as error:
            # After the head: a body read the transport refused, a body the decoder rejected, an error body the
            # mapper rejected -- each this call producing no result. Closed before the line is written.
            response.close()
            log.failed(error)
            raise
        except BaseException:
            # The caller's cancellation or interrupt: closed, and not logged as this call's failure.
            response.close()
            raise

    @staticmethod
    def _attempt_send(
        *,
        auth_scheme: AuthScheme,
        retry_options: RetryOptions,
        is_retryable: bool,
        send: Callable[[], HttpResponse],
        log: HttpLog,
    ) -> HttpResponse:
        """Send, and send again while every gate agrees; hand back the attempt that was kept.

        ``send`` is called once per attempt: it builds the request -- resolving auth afresh, so a
        credential a 401 invalidated is re-obtained rather than resent -- reports it to ``log`` and
        sends it. Each head is reported to ``log`` as it arrives, with whether it is a success by the
        same 2xx rule ``execute`` shapes the result by, so the scope holds no status rule of its own;
        if that report, or the 401 invalidation after it, raises -- a log handler or the caller's
        scheme -- the response is closed before the exception leaves. The retry line is written after
        the discarded response is closed and before the wait, so nothing a log handler does there can
        hold a connection. A 401 invalidates the scheme's cache per attempt but is not retried under
        the shipped defaults.

        Args:
            auth_scheme: The scheme this operation declares; invalidated where the server answers 401.
            retry_options: The policy in force for this call, per-call terms already merged.
            is_retryable: Whether this request may be repeated at all -- the method gate and the
                body's replayability, folded once per call since neither changes between attempts.
            send: Builds, reports and sends one attempt's request.
            log: The call's log scope.

        Returns:
            The kept attempt's response, open and its body unread.

        Raises:
            Exception: What the transport raised when the last attempt produced no response; the
                :class:`TransportError` wrapper is unwrapped and its ``inner_exception`` raised in
                its place."""
        for retries_taken in range(retry_options.max_retries + 1):
            try:
                response = send()
            except TransportError as error:
                # No response arrived, so there is nothing to close.
                inner = error.inner_exception
                if retries_taken >= retry_options.max_retries or not is_retryable:
                    raise inner from inner.__cause__
                wait_seconds = backoff_seconds(retries_taken, retry_options)
                log.retrying(max_retries=retry_options.max_retries, delay=wait_seconds, reason=inner)
                time.sleep(wait_seconds)
                continue

            status_code, response_headers = response.status_code, dict(response.headers)

            # The two calls here run code the SDK does not own -- a log handler, the caller's scheme -- while the
            # response is open; one that raises must not leave the connection held.
            try:
                log.response_received(status_code, response_headers, is_success=200 <= status_code < 300)
                if status_code == 401:
                    invalidate(auth_scheme)
            except BaseException:
                response.close()
                raise

            if not (
                is_retryable
                and status_code in retry_options.status_codes_to_retry
                and retries_taken < retry_options.max_retries
            ):
                return response

            retry_after_header = retry_after_seconds(response_headers, datetime.now(timezone.utc))
            wait_seconds = (
                backoff_seconds(retries_taken, retry_options)
                if retry_after_header is None
                else min(retry_after_header, retry_options.max_delay)
            )

            # Closed before the retry line and the wait, so neither can hold a connection.
            response.close()
            log.retrying(max_retries=retry_options.max_retries, delay=wait_seconds, reason=status_code)
            time.sleep(wait_seconds)

        raise AssertionError("the retry loop ended without a response to shape")


@dataclass(frozen=True, slots=True)
class AsyncRawClient(BaseRawClient[AsyncHttpClient]):
    """Asynchronous raw client.

    The method is named ``execute``, not ``execute_async``: sync and async peers
    carry identical names throughout this SDK, and the transport already makes the
    flavor unambiguous."""

    async def execute(
        self,
        *,
        http_method: HttpMethod,
        url_template: UrlTemplate,
        path_params: Sequence[Param[Any]] | None = None,
        query_params: Sequence[Param[Any]] | None = None,
        headers: Sequence[Param[Any]] | None = None,
        body: RequestBody | None = None,
        auth_scheme: AsyncAuthScheme = no_auth,
        decoder: AsyncResponseDecoder[T],
        error_mapper: ErrorMapper[E],
        request_options: RequestOptionsOrDict | None = None,
    ) -> ApiResult[T, E]:
        """Send a request and shape the response into a result.

        Returns once the response head has arrived; the body is the ``decoder``'s from there -- a
        buffered one reads and releases it, ``file_decoder`` hands the open connection to the
        :class:`FileResponse` it builds -- and ``T`` is solved from that argument. A non-2xx body is
        read and the connection released *before* the mapper runs, so a :class:`Failure` never holds
        a connection, even when the mapper raises.

        Args:
            http_method: The HTTP verb to send.
            url_template: The unresolved URL for the configured environment.
            path_params: The endpoint's path parameters, if any.
            query_params: The endpoint's query parameters, if any.
            headers: The endpoint's header parameters, if any.
            body: The request body, already wire-ready, or ``None``.
            auth_scheme: The scheme the operation declares; ``no_auth`` when it declares none.
            decoder: The operation's 2xx decoder; ``empty_response`` when it declares no body.
            error_mapper: The operation's error mapper; ``raw_error_response`` when it declares none.
            request_options: The caller's per-call overrides, if any.

        Returns:
            A :class:`Success` carrying the decoded payload for a 2xx status, otherwise a
            :class:`Failure` carrying the decoded error body.

        Raises:
            ValueError: If the body does not deserialize; not an API error, so it propagates in both
                response modes.
            Exception: What the transport raised when the last attempt produced no response, or when
                the body failed after the head arrived -- never the :class:`TransportError` wrapper."""
        options = RequestOptions.coerce(request_options)
        retry_options = apply_retry_overrides(options, self.retry_options)
        log = HttpLog(
            options=self.logging_options, log_level_override=options.log_level, started_at=time.perf_counter()
        )

        async def send() -> AsyncHttpResponse:
            request = self._build_request(
                http_method=http_method,
                url_template=url_template,
                path_params=path_params,
                query_params=query_params,
                headers=headers,
                body=body,
                auth=await resolve_auth(auth_scheme),
                options=options,
            )
            log.request_sending(request)
            return await self.http_client.send(request)

        try:
            response = await self._attempt_send(
                auth_scheme=auth_scheme,
                retry_options=retry_options,
                is_retryable=is_retryable_body(body) and http_method in retry_options.http_methods_to_retry,
                send=send,
                log=log,
            )
        except Exception as error:
            # No response was kept: the last attempt's transport error, already unwrapped, or anything raised while
            # an attempt was built, sent or its head handled. ``failed`` writes nothing when no request was reported.
            # A BaseException -- the caller's cancellation -- is not this call failing, and passes untouched.
            log.failed(error)
            raise

        try:
            status_code, response_headers = response.status_code, dict(response.headers)
            if 200 <= status_code < 300:
                # Returns before the read: the body is the decoder's now. The excepts below must never
                # become a finally -- they would close the connection an AsyncFileResponse was just handed.
                return Success(
                    payload=await decoder.decode(response),
                    status_code=status_code,
                    headers=response_headers,
                )

            content = await response.aread()
            await response.aclose()
            # Mapped after the close, so a mapper raise cannot leak a connection; the second close it
            # causes is a no-op, since aclose is required to be idempotent.
            return Failure(
                error=error_mapper.map(status_code, content),
                status_code=status_code,
                headers=response_headers,
            )
        except Exception as error:
            # After the head: a body read the transport refused, a body the decoder rejected, an error body the
            # mapper rejected -- each this call producing no result. Closed before the line is written.
            await response.aclose()
            log.failed(error)
            raise
        except BaseException:
            # The caller's cancellation or interrupt: closed, and not logged as this call's failure.
            await response.aclose()
            raise

    @staticmethod
    async def _attempt_send(
        *,
        auth_scheme: AsyncAuthScheme,
        retry_options: RetryOptions,
        is_retryable: bool,
        send: Callable[[], Awaitable[AsyncHttpResponse]],
        log: HttpLog,
    ) -> AsyncHttpResponse:
        """The awaited twin of :meth:`RawClient._attempt_send`, with that contract exactly.

        Three tokens differ: ``send`` is awaited, the close is ``aclose``, and the wait is
        ``asyncio.sleep``, so it yields the event loop instead of blocking it."""
        for retries_taken in range(retry_options.max_retries + 1):
            try:
                response = await send()
            except TransportError as error:
                # No response arrived, so there is nothing to close.
                inner = error.inner_exception
                if retries_taken >= retry_options.max_retries or not is_retryable:
                    raise inner from inner.__cause__
                wait_seconds = backoff_seconds(retries_taken, retry_options)
                log.retrying(max_retries=retry_options.max_retries, delay=wait_seconds, reason=inner)
                await asyncio.sleep(wait_seconds)
                continue

            status_code, response_headers = response.status_code, dict(response.headers)

            # The two calls here run code the SDK does not own -- a log handler, the caller's scheme -- while the
            # response is open; one that raises must not leave the connection held.
            try:
                log.response_received(status_code, response_headers, is_success=200 <= status_code < 300)
                if status_code == 401:
                    invalidate(auth_scheme)
            except BaseException:
                await response.aclose()
                raise

            if not (
                is_retryable
                and status_code in retry_options.status_codes_to_retry
                and retries_taken < retry_options.max_retries
            ):
                return response

            retry_after_header = retry_after_seconds(response_headers, datetime.now(timezone.utc))
            wait_seconds = (
                backoff_seconds(retries_taken, retry_options)
                if retry_after_header is None
                else min(retry_after_header, retry_options.max_delay)
            )

            # Closed before the retry line and the wait, so neither can hold a connection.
            await response.aclose()
            log.retrying(max_retries=retry_options.max_retries, delay=wait_seconds, reason=status_code)
            await asyncio.sleep(wait_seconds)

        raise AssertionError("the retry loop ended without a response to shape")


RawClientT = TypeVar("RawClientT", bound=RawClient | AsyncRawClient)
"""Fixes which raw client a generic holder carries -- ``RawClient`` or ``AsyncRawClient``.

Bounded by the two concrete clients, not ``BaseRawClient[Any]``: the base has no ``execute``, so the
looser bound could not prove a holder's ``self._client.execute(...)`` exists."""
