from pydantic import BaseModel, Field

from app.services.source_metadata import SourceMetadata


class SourceResult(BaseModel):
    provider: str
    external_id: str
    title: str
    doi: str | None = None
    url: str | None = None
    published_year: int | None = None
    authors: list[str] = Field(default_factory=list)
    relevance_score: float | None = None
    identity: str


class SourceSearchResponse(BaseModel):
    provider: str = "crossref"
    query: str
    results: list[SourceResult]
    cost_policy: str = "public-no-key"


class SourceResolveResponse(BaseModel):
    result: SourceResult


def source_result_from_metadata(source: SourceMetadata) -> SourceResult:
    raw_score = source.metadata.get("score")
    relevance_score = float(raw_score) if isinstance(raw_score, (int, float)) else None
    return SourceResult(
        provider=source.provider,
        external_id=source.external_id,
        title=source.title,
        doi=source.doi,
        url=source.url,
        published_year=source.published_year,
        authors=list(source.authors),
        relevance_score=relevance_score,
        identity=source.identity,
    )
