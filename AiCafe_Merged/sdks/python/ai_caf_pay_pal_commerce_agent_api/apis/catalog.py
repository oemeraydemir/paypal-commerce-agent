from __future__ import annotations

from ..core import (
    ApiResult,
    AsyncRawClient,
    BaseRawResponse,
    RawClient,
    RequestOptionsOrDict,
    async_json_decoder,
    json_decoder,
    param,
    unwrap,
)
from ..errors.get_catalog_error import GetCatalogErrorBody, get_catalog_error_mapper
from ..errors.get_catalog_id_error import GetCatalogIdErrorBody, get_catalog_id_error_mapper
from ..errors.get_catalog_search_error import GetCatalogSearchErrorBody, get_catalog_search_error_mapper
from ..models.catalog_response import CatalogResponse
from ..models.enums.match_mode import MatchModeOrStr
from ..models.product import Product
from ..server.server import Server


class Catalog:
    def __init__(self, client: RawClient, server: Server) -> None:
        self._with_raw_response = CatalogWithRawResponse(client, server)

    def get_catalog(self, *, request_options: RequestOptionsOrDict | None = None) -> CatalogResponse:
        """List all products.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Catalog

        Raises:
            ApiError: Client error ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.get_catalog(request_options=request_options))

    def get_catalog_id(self, id_: str, *, request_options: RequestOptionsOrDict | None = None) -> Product:
        """Get a product by id.

        Args:
            id_: Value for the id parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Product

        Raises:
            ApiError: Not found ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.get_catalog_id(id_, request_options=request_options))

    def get_catalog_search(
        self,
        *,
        query: str | None = None,
        category: str | None = None,
        tags: str | None = None,
        dietary: str | None = None,
        occasion: str | None = None,
        max_price_minor: int | None = None,
        match_mode: MatchModeOrStr | None = None,
        request_options: RequestOptionsOrDict | None = None,
    ) -> CatalogResponse:
        """Search the catalog (server-side filtering).

        Args:
            query: Value for the query parameter.
            category: Value for the category parameter.
            tags: Comma-separated
            dietary: Comma-separated; e.g. vegan,gluten-free
            occasion: Value for the occasion parameter.
            max_price_minor: Value for the maxPriceMinor parameter.
            match_mode: Value for the matchMode parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Search results

        Raises:
            ApiError: Client error ``error`` is ``Error | RawError``."""
        return unwrap(
            self._with_raw_response.get_catalog_search(
                query=query,
                category=category,
                tags=tags,
                dietary=dietary,
                occasion=occasion,
                max_price_minor=max_price_minor,
                match_mode=match_mode,
                request_options=request_options,
            ),
        )

    @property
    def with_raw_response(self) -> CatalogWithRawResponse:
        return self._with_raw_response


class AsyncCatalog:
    def __init__(self, client: AsyncRawClient, server: Server) -> None:
        self._with_raw_response = AsyncCatalogWithRawResponse(client, server)

    async def get_catalog(self, *, request_options: RequestOptionsOrDict | None = None) -> CatalogResponse:
        """List all products.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Catalog

        Raises:
            ApiError: Client error ``error`` is ``Error | RawError``."""
        return unwrap(await self._with_raw_response.get_catalog(request_options=request_options))

    async def get_catalog_id(self, id_: str, *, request_options: RequestOptionsOrDict | None = None) -> Product:
        """Get a product by id.

        Args:
            id_: Value for the id parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Product

        Raises:
            ApiError: Not found ``error`` is ``Error | RawError``."""
        return unwrap(await self._with_raw_response.get_catalog_id(id_, request_options=request_options))

    async def get_catalog_search(
        self,
        *,
        query: str | None = None,
        category: str | None = None,
        tags: str | None = None,
        dietary: str | None = None,
        occasion: str | None = None,
        max_price_minor: int | None = None,
        match_mode: MatchModeOrStr | None = None,
        request_options: RequestOptionsOrDict | None = None,
    ) -> CatalogResponse:
        """Search the catalog (server-side filtering).

        Args:
            query: Value for the query parameter.
            category: Value for the category parameter.
            tags: Comma-separated
            dietary: Comma-separated; e.g. vegan,gluten-free
            occasion: Value for the occasion parameter.
            max_price_minor: Value for the maxPriceMinor parameter.
            match_mode: Value for the matchMode parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Search results

        Raises:
            ApiError: Client error ``error`` is ``Error | RawError``."""
        return unwrap(
            await self._with_raw_response.get_catalog_search(
                query=query,
                category=category,
                tags=tags,
                dietary=dietary,
                occasion=occasion,
                max_price_minor=max_price_minor,
                match_mode=match_mode,
                request_options=request_options,
            ),
        )

    @property
    def with_raw_response(self) -> AsyncCatalogWithRawResponse:
        return self._with_raw_response


class CatalogWithRawResponse(BaseRawResponse[RawClient, Server]):
    def get_catalog(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[CatalogResponse, GetCatalogErrorBody]:
        """List all products.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/catalog"),
            decoder=json_decoder[CatalogResponse],
            error_mapper=get_catalog_error_mapper,
            request_options=request_options,
        )

    def get_catalog_id(
        self, id_: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[Product, GetCatalogIdErrorBody]:
        """Get a product by id.

        Args:
            id_: Value for the id parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/catalog/{id}"),
            path_params=[param[str]("id", id_)],
            decoder=json_decoder[Product],
            error_mapper=get_catalog_id_error_mapper,
            request_options=request_options,
        )

    def get_catalog_search(
        self,
        *,
        query: str | None = None,
        category: str | None = None,
        tags: str | None = None,
        dietary: str | None = None,
        occasion: str | None = None,
        max_price_minor: int | None = None,
        match_mode: MatchModeOrStr | None = None,
        request_options: RequestOptionsOrDict | None = None,
    ) -> ApiResult[CatalogResponse, GetCatalogSearchErrorBody]:
        """Search the catalog (server-side filtering).

        Args:
            query: Value for the query parameter.
            category: Value for the category parameter.
            tags: Comma-separated
            dietary: Comma-separated; e.g. vegan,gluten-free
            occasion: Value for the occasion parameter.
            max_price_minor: Value for the maxPriceMinor parameter.
            match_mode: Value for the matchMode parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/catalog/search"),
            query_params=[
                param[str | None]("query", query),
                param[str | None]("category", category),
                param[str | None]("tags", tags),
                param[str | None]("dietary", dietary),
                param[str | None]("occasion", occasion),
                param[int | None]("maxPriceMinor", max_price_minor),
                param[MatchModeOrStr | None]("matchMode", match_mode),
            ],
            decoder=json_decoder[CatalogResponse],
            error_mapper=get_catalog_search_error_mapper,
            request_options=request_options,
        )


class AsyncCatalogWithRawResponse(BaseRawResponse[AsyncRawClient, Server]):
    async def get_catalog(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[CatalogResponse, GetCatalogErrorBody]:
        """List all products.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/catalog"),
            decoder=async_json_decoder[CatalogResponse],
            error_mapper=get_catalog_error_mapper,
            request_options=request_options,
        )

    async def get_catalog_id(
        self, id_: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[Product, GetCatalogIdErrorBody]:
        """Get a product by id.

        Args:
            id_: Value for the id parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/catalog/{id}"),
            path_params=[param[str]("id", id_)],
            decoder=async_json_decoder[Product],
            error_mapper=get_catalog_id_error_mapper,
            request_options=request_options,
        )

    async def get_catalog_search(
        self,
        *,
        query: str | None = None,
        category: str | None = None,
        tags: str | None = None,
        dietary: str | None = None,
        occasion: str | None = None,
        max_price_minor: int | None = None,
        match_mode: MatchModeOrStr | None = None,
        request_options: RequestOptionsOrDict | None = None,
    ) -> ApiResult[CatalogResponse, GetCatalogSearchErrorBody]:
        """Search the catalog (server-side filtering).

        Args:
            query: Value for the query parameter.
            category: Value for the category parameter.
            tags: Comma-separated
            dietary: Comma-separated; e.g. vegan,gluten-free
            occasion: Value for the occasion parameter.
            max_price_minor: Value for the maxPriceMinor parameter.
            match_mode: Value for the matchMode parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/catalog/search"),
            query_params=[
                param[str | None]("query", query),
                param[str | None]("category", category),
                param[str | None]("tags", tags),
                param[str | None]("dietary", dietary),
                param[str | None]("occasion", occasion),
                param[int | None]("maxPriceMinor", max_price_minor),
                param[MatchModeOrStr | None]("matchMode", match_mode),
            ],
            decoder=async_json_decoder[CatalogResponse],
            error_mapper=get_catalog_search_error_mapper,
            request_options=request_options,
        )
