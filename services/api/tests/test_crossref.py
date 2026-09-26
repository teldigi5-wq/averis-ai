import asyncio

import httpx

from app.services.crossref import CrossrefClient, CrossrefLookupError


def _run(coro):
    return asyncio.run(coro)


def test_search_uses_bibliographic_query_and_normalizes_results() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        params = dict(request.url.params)
        assert request.url.path == "/works"
        assert params["query.bibliographic"] == "Averis academic integrity"
        assert params["rows"] == "2"
        assert params["mailto"] == "ops@example.com"
        assert request.headers["user-agent"].startswith("Averis/")
        return httpx.Response(
            200,
            json={
                "message": {
                    "items": [
                        {
                            "DOI": "10.1234/AVERIS.1",
                            "title": ["Evidence-first academic integrity"],
                            "URL": "https://doi.org/10.1234/AVERIS.1",
                            "published-online": {"date-parts": [[2026, 9, 1]]},
                            "author": [{"given": "Ada", "family": "Lovelace"}],
                            "score": 42.5,
                        },
                        {
                            "DOI": "10.1234/AVERIS.2",
                            "title": ["Similarity evidence systems"],
                            "score": 30.0,
                        },
                    ]
                }
            },
        )

    transport = httpx.MockTransport(handler)

    async def scenario():
        async with httpx.AsyncClient(transport=transport) as client:
            crossref = CrossrefClient(
                base_url="https://api.crossref.org",
                mailto="ops@example.com",
                client=client,
            )
            return await crossref.search("Averis academic integrity", limit=2)

    results = _run(scenario())
    assert len(results) == 2
    assert results[0].doi == "10.1234/averis.1"
    assert results[0].published_year == 2026
    assert results[0].authors == ("Ada Lovelace",)
    assert results[0].metadata["score"] == 42.5


def test_resolve_doi_handles_not_found() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.startswith("/works/")
        return httpx.Response(404, json={"status": "resource-not-found"})

    transport = httpx.MockTransport(handler)

    async def scenario():
        async with httpx.AsyncClient(transport=transport) as client:
            return await CrossrefClient(client=client).resolve_doi("10.9999/missing")

    assert _run(scenario()) is None


def test_resolve_invalid_doi_avoids_network() -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("invalid DOI should not make a network request")

    transport = httpx.MockTransport(handler)

    async def scenario():
        async with httpx.AsyncClient(transport=transport) as client:
            return await CrossrefClient(client=client).resolve_doi("not-a-doi")

    assert _run(scenario()) is None


def test_rate_limit_is_reported_as_retryable() -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"message": "slow down"})

    transport = httpx.MockTransport(handler)

    async def scenario():
        async with httpx.AsyncClient(transport=transport) as client:
            crossref = CrossrefClient(client=client)
            try:
                await crossref.search("academic integrity")
            except CrossrefLookupError as exc:
                return exc
        raise AssertionError("expected CrossrefLookupError")

    error = _run(scenario())
    assert error.upstream_status == 429
    assert error.retryable is True


def test_invalid_json_is_reported_as_retryable() -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"not-json")

    transport = httpx.MockTransport(handler)

    async def scenario():
        async with httpx.AsyncClient(transport=transport) as client:
            try:
                await CrossrefClient(client=client).search("academic integrity")
            except CrossrefLookupError as exc:
                return exc
        raise AssertionError("expected CrossrefLookupError")

    error = _run(scenario())
    assert error.retryable is True
