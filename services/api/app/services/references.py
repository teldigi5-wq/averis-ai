from __future__ import annotations

from dataclasses import dataclass
import re

from app.services.source_metadata import normalize_doi


_DOI_RE = re.compile(r"10\.\d{4,9}/[-._;()/:A-Z0-9]+", re.IGNORECASE)
_YEAR_RE = re.compile(r"\b((?:18|19|20)\d{2}[a-z]?)\b", re.IGNORECASE)
_REFERENCE_PREFIX_RE = re.compile(r"^\s*(?:\[\d+\]|\d+[.)])\s*")
_AUTHOR_YEAR_START_RE = re.compile(
    r"^\s*(?:\[\d+\]|\d+[.)])?\s*[A-ZÀ-ÖØ-Ý][^\n]{0,100}?"
    r"(?:\(\s*(?:18|19|20)\d{2}[a-z]?\s*\)|\b(?:18|19|20)\d{2}[a-z]?\b)",
    re.UNICODE,
)
_PAREN_BLOCK_RE = re.compile(r"\(([^()]{3,240})\)")
_CITATION_SEGMENT_RE = re.compile(
    r"(?P<author>[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’\-]+)"
    r"(?:\s+(?:&|and)\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’\-]+|\s+et\s+al\.?)?"
    r"\s*,?\s*(?P<year>(?:18|19|20)\d{2}[a-z]?)\b",
    re.IGNORECASE | re.UNICODE,
)
_NARRATIVE_RE = re.compile(
    r"(?P<author>[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’\-]+)"
    r"(?:\s+et\s+al\.?)?\s*\(\s*(?P<year>(?:18|19|20)\d{2}[a-z]?)\s*\)",
    re.UNICODE,
)
_NUMERIC_CITATION_RE = re.compile(
    r"\[(?P<body>\d{1,3}(?:\s*[-–—]\s*\d{1,3})?"
    r"(?:\s*[,;]\s*\d{1,3}(?:\s*[-–—]\s*\d{1,3})?)*)\]"
)
_NUMERIC_SEGMENT_RE = re.compile(r"^(?P<start>\d{1,3})(?:\s*[-–—]\s*(?P<end>\d{1,3}))?$")


@dataclass(frozen=True)
class ParsedReference:
    index: int
    raw: str
    doi: str | None
    year: str | None
    author_key: str | None
    warnings: tuple[str, ...]


@dataclass(frozen=True)
class CitationMention:
    raw: str
    author_key: str
    year: str
    start: int


@dataclass(frozen=True)
class NumericCitationMention:
    raw: str
    numbers: tuple[int, ...]
    start: int


@dataclass(frozen=True)
class NumericCitationFinding:
    citation: NumericCitationMention
    missing_reference_numbers: tuple[int, ...]


@dataclass(frozen=True)
class CitationAudit:
    references: tuple[ParsedReference, ...]
    citations: tuple[CitationMention, ...]
    unmatched_citations: tuple[CitationMention, ...]
    uncited_references: tuple[ParsedReference, ...]
    matched_citation_count: int
    numeric_citations: tuple[NumericCitationMention, ...] = ()
    unmatched_numeric_citations: tuple[NumericCitationFinding, ...] = ()
    matched_author_year_citation_count: int = 0
    matched_numeric_citation_count: int = 0
    citation_styles_detected: tuple[str, ...] = ()


def _compact(value: str) -> str:
    return " ".join(value.split())


def _normalize_author_key(value: str) -> str:
    return re.sub(r"[^\w'’\-]", "", value, flags=re.UNICODE).casefold()


def _extract_doi(raw: str) -> str | None:
    match = _DOI_RE.search(raw)
    return normalize_doi(match.group(0)) if match else None


def _extract_year(raw: str) -> str | None:
    match = _YEAR_RE.search(raw)
    return match.group(1).casefold() if match else None


def _extract_reference_author(raw: str, year: str | None) -> str | None:
    cleaned = _REFERENCE_PREFIX_RE.sub("", raw).strip()
    if not cleaned:
        return None
    prefix = cleaned
    if year:
        year_match = re.search(re.escape(year), cleaned, flags=re.IGNORECASE)
        if year_match:
            prefix = cleaned[: year_match.start()]
    prefix = prefix.strip(" .;()")
    if not prefix:
        return None

    # Author-year styles normally begin with the first author's surname followed
    # by a comma. Fall back to the first alphabetic token for simple Harvard forms.
    if "," in prefix:
        candidate = prefix.split(",", 1)[0].strip()
    else:
        token_match = re.search(r"[A-Za-zÀ-ÖØ-öø-ÿ'’\-]+", prefix, re.UNICODE)
        candidate = token_match.group(0) if token_match else ""
    key = _normalize_author_key(candidate)
    return key or None


def _split_reference_entries(reference_text: str, *, max_entries: int) -> list[str]:
    lines = [line.rstrip() for line in reference_text.replace("\r\n", "\n").split("\n")]
    nonempty = [line for line in lines if line.strip()]
    if not nonempty:
        return []

    # Blank-line separated reference lists preserve wrapped entries reliably.
    groups = [_compact(group) for group in re.split(r"\n\s*\n", reference_text.strip()) if group.strip()]
    if len(groups) > 1:
        return groups[:max_entries]

    entries: list[str] = []
    current: list[str] = []
    for line in nonempty:
        stripped = line.strip()
        starts_entry = bool(_REFERENCE_PREFIX_RE.match(stripped) or _AUTHOR_YEAR_START_RE.match(stripped))
        if current and starts_entry:
            entries.append(_compact(" ".join(current)))
            current = [stripped]
        elif current:
            current.append(stripped)
        else:
            current = [stripped]
    if current:
        entries.append(_compact(" ".join(current)))

    # If no useful start markers were found, treat each line as one reference.
    if len(entries) == 1 and len(nonempty) > 1 and not _AUTHOR_YEAR_START_RE.match(nonempty[0].strip()):
        entries = [_compact(line) for line in nonempty]
    return entries[:max_entries]


def parse_reference_block(reference_text: str, *, max_entries: int = 50) -> list[ParsedReference]:
    if max_entries <= 0:
        raise ValueError("max_entries must be positive")

    parsed: list[ParsedReference] = []
    for index, raw in enumerate(_split_reference_entries(reference_text, max_entries=max_entries), start=1):
        doi = _extract_doi(raw)
        year = _extract_year(raw)
        author_key = _extract_reference_author(raw, year)
        warnings: list[str] = []
        if year is None:
            warnings.append("publication_year_not_detected")
        if author_key is None:
            warnings.append("first_author_not_detected")
        if doi is None:
            warnings.append("doi_not_detected")
        parsed.append(
            ParsedReference(
                index=index,
                raw=raw,
                doi=doi,
                year=year,
                author_key=author_key,
                warnings=tuple(warnings),
            )
        )
    return parsed


def extract_author_year_citations(document_text: str, *, max_mentions: int = 200) -> list[CitationMention]:
    mentions: list[CitationMention] = []
    seen: set[tuple[int, str, str]] = set()

    def add(raw: str, author: str, year: str, start: int) -> None:
        key = _normalize_author_key(author)
        normalized_year = year.casefold()
        identity = (start, key, normalized_year)
        if not key or identity in seen or len(mentions) >= max_mentions:
            return
        seen.add(identity)
        mentions.append(
            CitationMention(
                raw=_compact(raw),
                author_key=key,
                year=normalized_year,
                start=start,
            )
        )

    for block in _PAREN_BLOCK_RE.finditer(document_text):
        content = block.group(1)
        offset = block.start(1)
        for segment in content.split(";"):
            match = _CITATION_SEGMENT_RE.search(segment)
            if match:
                segment_offset = content.find(segment)
                add(segment, match.group("author"), match.group("year"), offset + max(segment_offset, 0) + match.start())

    for match in _NARRATIVE_RE.finditer(document_text):
        add(match.group(0), match.group("author"), match.group("year"), match.start())

    return sorted(mentions, key=lambda item: item.start)[:max_mentions]


def _expand_numeric_citation_body(body: str, *, max_numbers: int = 50) -> tuple[int, ...]:
    numbers: list[int] = []
    for raw_segment in re.split(r"[,;]", body):
        segment = raw_segment.strip()
        match = _NUMERIC_SEGMENT_RE.fullmatch(segment)
        if not match:
            return ()

        start = int(match.group("start"))
        end_raw = match.group("end")
        end = int(end_raw) if end_raw is not None else start
        if start < 1 or end < start or (end - start + 1) > max_numbers:
            return ()

        for number in range(start, end + 1):
            if number not in numbers:
                numbers.append(number)
                if len(numbers) > max_numbers:
                    return ()
    return tuple(numbers)


def extract_numeric_citations(document_text: str, *, max_mentions: int = 200) -> list[NumericCitationMention]:
    """Extract conservative square-bracket numeric citation candidates.

    Supported examples include [1], [2, 4], [3-5] and [1; 3-4]. Four-digit
    bracketed values such as [2024] are intentionally outside the pattern to
    reduce accidental year/label detection. Parenthesized numbers are not
    treated as citations because they are too ambiguous for this review aid.
    """
    mentions: list[NumericCitationMention] = []
    for match in _NUMERIC_CITATION_RE.finditer(document_text):
        numbers = _expand_numeric_citation_body(match.group("body"))
        if not numbers:
            continue
        mentions.append(
            NumericCitationMention(
                raw=match.group(0),
                numbers=numbers,
                start=match.start(),
            )
        )
        if len(mentions) >= max_mentions:
            break
    return mentions


def audit_citation_consistency(document_text: str, reference_text: str) -> CitationAudit:
    references = parse_reference_block(reference_text)
    citations = extract_author_year_citations(document_text)
    numeric_citations = extract_numeric_citations(document_text)

    reference_keys = {
        (reference.author_key, reference.year)
        for reference in references
        if reference.author_key and reference.year
    }
    citation_keys = {(citation.author_key, citation.year) for citation in citations}

    unmatched = tuple(
        citation
        for citation in citations
        if (citation.author_key, citation.year) not in reference_keys
    )
    matched_author_year_count = len(citations) - len(unmatched)

    author_cited_reference_indices = {
        reference.index
        for reference in references
        if reference.author_key
        and reference.year
        and (reference.author_key, reference.year) in citation_keys
    }

    valid_reference_indices = {reference.index for reference in references}
    numeric_findings: list[NumericCitationFinding] = []
    numeric_cited_reference_indices: set[int] = set()
    matched_numeric_count = 0

    for citation in numeric_citations:
        missing = tuple(number for number in citation.numbers if number not in valid_reference_indices)
        numeric_cited_reference_indices.update(
            number for number in citation.numbers if number in valid_reference_indices
        )
        if missing:
            numeric_findings.append(
                NumericCitationFinding(
                    citation=citation,
                    missing_reference_numbers=missing,
                )
            )
        else:
            matched_numeric_count += 1

    cited_reference_indices = author_cited_reference_indices | numeric_cited_reference_indices
    if numeric_citations:
        uncited = tuple(
            reference
            for reference in references
            if reference.index not in cited_reference_indices
        )
    else:
        # Preserve the earlier author-year behavior when no numeric citation
        # candidates are present: only references with parseable author/year
        # metadata can safely be classified as uncited.
        uncited = tuple(
            reference
            for reference in references
            if reference.author_key
            and reference.year
            and reference.index not in cited_reference_indices
        )

    styles: list[str] = []
    if citations:
        styles.append("author-year")
    if numeric_citations:
        styles.append("numeric-bracket")

    return CitationAudit(
        references=tuple(references),
        citations=tuple(citations),
        unmatched_citations=unmatched,
        uncited_references=uncited,
        matched_citation_count=matched_author_year_count + matched_numeric_count,
        numeric_citations=tuple(numeric_citations),
        unmatched_numeric_citations=tuple(numeric_findings),
        matched_author_year_citation_count=matched_author_year_count,
        matched_numeric_citation_count=matched_numeric_count,
        citation_styles_detected=tuple(styles),
    )
