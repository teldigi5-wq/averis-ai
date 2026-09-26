from __future__ import annotations

from dataclasses import dataclass, field
import hashlib
import re
from typing import Any
from urllib.parse import unquote

from app.services.text import normalize_text


_DOI_PREFIX = re.compile(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", re.IGNORECASE)


@dataclass(frozen=True)
class SourceMetadata:
    provider: str
    external_id: str
    title: str
    doi: str | None = None
    url: str | None = None
    published_year: int | None = None
    authors: tuple[str, ...] = ()
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def identity(self) -> str:
        canonical = f"{self.provider.casefold()}:{self.external_id.strip()}"
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def normalize_doi(value: str | None) -> str | None:
    if not value:
        return None
    candidate = unquote(value).strip()
    candidate = _DOI_PREFIX.sub("", candidate).strip()
    candidate = candidate.rstrip(".,;)").casefold()
    if not candidate.startswith("10.") or "/" not in candidate:
        return None
    return candidate


def _fallback_external_id(provider: str, title: str) -> str:
    normalized = normalize_text(title)
    return hashlib.sha256(f"{provider}:{normalized}".encode("utf-8")).hexdigest()


def _first_title(value: Any) -> str:
    if isinstance(value, list):
        return str(value[0]).strip() if value else "Untitled source"
    if isinstance(value, str) and value.strip():
        return value.strip()
    return "Untitled source"


def _crossref_year(message: dict[str, Any]) -> int | None:
    for key in ("published-print", "published-online", "published", "issued", "created"):
        value = message.get(key)
        if not isinstance(value, dict):
            continue
        parts = value.get("date-parts")
        if isinstance(parts, list) and parts and isinstance(parts[0], list) and parts[0]:
            year = parts[0][0]
            if isinstance(year, int):
                return year
    return None


def source_from_crossref(message: dict[str, Any]) -> SourceMetadata:
    title = _first_title(message.get("title"))
    doi = normalize_doi(message.get("DOI"))
    authors: list[str] = []
    raw_authors = message.get("author")
    if isinstance(raw_authors, list):
        for author in raw_authors:
            if not isinstance(author, dict):
                continue
            name = " ".join(
                part.strip()
                for part in (str(author.get("given", "")), str(author.get("family", "")))
                if part.strip()
            )
            if name:
                authors.append(name)

    external_id = doi or str(message.get("URL") or "").strip() or _fallback_external_id("crossref", title)
    return SourceMetadata(
        provider="crossref",
        external_id=external_id,
        title=title,
        doi=doi,
        url=str(message.get("URL") or "").strip() or None,
        published_year=_crossref_year(message),
        authors=tuple(authors),
        metadata={"type": message.get("type"), "publisher": message.get("publisher")},
    )


def source_from_openalex(work: dict[str, Any]) -> SourceMetadata:
    title = str(work.get("display_name") or work.get("title") or "Untitled source").strip()
    doi = normalize_doi(work.get("doi"))
    authors: list[str] = []
    raw_authorships = work.get("authorships")
    if isinstance(raw_authorships, list):
        for authorship in raw_authorships:
            if not isinstance(authorship, dict):
                continue
            author = authorship.get("author")
            if isinstance(author, dict):
                display_name = str(author.get("display_name") or "").strip()
                if display_name:
                    authors.append(display_name)

    primary_location = work.get("primary_location")
    landing_page = None
    if isinstance(primary_location, dict):
        landing_page = str(primary_location.get("landing_page_url") or "").strip() or None

    external_id = str(work.get("id") or "").strip() or doi or _fallback_external_id("openalex", title)
    return SourceMetadata(
        provider="openalex",
        external_id=external_id,
        title=title,
        doi=doi,
        url=landing_page or str(work.get("id") or "").strip() or None,
        published_year=work.get("publication_year") if isinstance(work.get("publication_year"), int) else None,
        authors=tuple(authors),
        metadata={
            "type": work.get("type"),
            "open_access": work.get("open_access"),
        },
    )
