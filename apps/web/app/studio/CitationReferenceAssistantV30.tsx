"use client";

import { useEffect, useMemo, useState } from "react";

type CitationStyle = "auto" | "apa7" | "harvard" | "ieee" | "mla";
type CitationKind = "author-year" | "ieee" | "mla";

type Citation = {
  raw: string;
  kind: CitationKind;
  author?: string;
  year?: string;
  number?: number;
};

type ReferenceEntry = {
  index: number;
  raw: string;
  normalized: string;
  authorKey: string | null;
  year: string | null;
  doi: string | null;
  url: string | null;
  issues: string[];
};

type Analysis = {
  citations: Citation[];
  references: ReferenceEntry[];
  missingCitations: Citation[];
  uncitedReferences: ReferenceEntry[];
  duplicateGroups: string[][];
  duplicateDois: string[];
  normalizedBibliography: string;
  score: number;
  matchedCount: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

const DOI_RE = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i;
const URL_RE = /https?:\/\/[^\s<>()]+/i;
const YEAR_RE = /\b((?:19|20)\d{2}[a-z]?)\b/i;

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeAuthor(value: string) {
  return value
    .toLowerCase()
    .replace(/\bet\s+al\.?/g, "")
    .replace(/[^a-zà-ž'’-]+/gi, " ")
    .trim()
    .split(/\s+/)[0] ?? "";
}

function normalizeDoi(value: string | null) {
  if (!value) return null;
  return value
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .replace(/[.,;]+$/, "")
    .trim()
    .toLowerCase();
}

function canonicalDoi(value: string | null) {
  const doi = normalizeDoi(value);
  return doi ? `https://doi.org/${doi}` : null;
}

function splitReferences(value: string) {
  const normalized = value.replace(/\r/g, "").trim();
  if (!normalized) return [];

  const blankBlocks = normalized.split(/\n\s*\n+/).map((item) => compact(item)).filter(Boolean);
  if (blankBlocks.length > 1) return blankBlocks;

  const lines = normalized.split("\n").map((item) => compact(item)).filter(Boolean);
  if (lines.length > 1 && lines.every((line) => line.length >= 18)) return lines;
  return [compact(normalized)];
}

function cleanReference(value: string, index: number, style: CitationStyle) {
  let output = compact(value)
    .replace(/^\[\d+\]\s*/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/\s+([,.;:])/g, "$1");

  const doiMatch = output.match(DOI_RE)?.[0] ?? null;
  const canonical = canonicalDoi(doiMatch);
  if (canonical) {
    output = output
      .replace(/https?:\/\/(?:dx\.)?doi\.org\/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/ig, "")
      .replace(/doi:\s*10\.\d{4,9}\/[-._;()/:A-Z0-9]+/ig, "")
      .replace(DOI_RE, "")
      .replace(/\s+([,.;:])/g, "$1")
      .replace(/[\s.;,]+$/, "");
    output = `${output}. ${canonical}`;
  } else if (output && !/[.!?]$/.test(output)) {
    output += ".";
  }

  if (style === "ieee") return `[${index}] ${output}`;
  return output;
}

function parseReference(raw: string, index: number, style: CitationStyle): ReferenceEntry {
  const plain = compact(raw).replace(/^\[\d+\]\s*/, "").replace(/^\d+[.)]\s+/, "");
  const year = plain.match(YEAR_RE)?.[1]?.toLowerCase() ?? null;
  const doi = normalizeDoi(plain.match(DOI_RE)?.[0] ?? null);
  const url = plain.match(URL_RE)?.[0]?.replace(/[.,;]+$/, "") ?? null;
  const firstChunk = plain.split(/[,(.]/)[0] ?? "";
  const authorKey = normalizeAuthor(firstChunk) || null;
  const issues: string[] = [];

  if (!authorKey || authorKey.length < 2) issues.push("Author or organisation is unclear");
  if (!year && style !== "mla") issues.push("Publication year not detected");
  if (plain.split(/\s+/).length < 6) issues.push("Reference looks incomplete; check title and publication details");
  if (/doi\s*:/i.test(plain) || /dx\.doi\.org/i.test(plain)) issues.push("DOI can be normalized to https://doi.org/…");
  if (!doi && !url) issues.push("No DOI or URL detected (may be valid for some source types)");

  return {
    index,
    raw,
    normalized: cleanReference(raw, index, style),
    authorKey,
    year,
    doi,
    url,
    issues,
  };
}

function extractAuthorYear(text: string) {
  const found: Citation[] = [];
  const parenthetical = /\(([^()]{1,140})\)/g;
  let match: RegExpExecArray | null;
  while ((match = parenthetical.exec(text))) {
    const inside = match[1];
    if (!YEAR_RE.test(inside)) continue;
    for (const part of inside.split(";")) {
      const year = part.match(YEAR_RE)?.[1]?.toLowerCase();
      if (!year) continue;
      const authorPart = part.slice(0, Math.max(0, part.toLowerCase().indexOf(year))).replace(/^\s*(?:see|e\.g\.,?)\s*/i, "");
      const author = normalizeAuthor(authorPart);
      if (author) found.push({ raw: `(${compact(part)})`, kind: "author-year", author, year });
    }
  }

  const narrative = /\b([A-ZÀ-Ž][A-Za-zÀ-ž'’-]+)(?:\s+et\s+al\.)?\s*\(((?:19|20)\d{2}[a-z]?)\)/g;
  while ((match = narrative.exec(text))) {
    found.push({ raw: match[0], kind: "author-year", author: normalizeAuthor(match[1]), year: match[2].toLowerCase() });
  }
  return found;
}

function extractIeee(text: string) {
  const found: Citation[] = [];
  const re = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    for (const token of match[1].split(",")) {
      const number = Number(token.trim());
      if (Number.isInteger(number) && number > 0) found.push({ raw: match[0], kind: "ieee", number });
    }
  }
  return found;
}

function extractMla(text: string) {
  const found: Citation[] = [];
  const re = /\(([A-ZÀ-Ž][A-Za-zÀ-ž'’-]+)\s+\d{1,4}(?:[-–]\d{1,4})?\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    found.push({ raw: match[0], kind: "mla", author: normalizeAuthor(match[1]) });
  }
  return found;
}

function uniqueCitations(items: Citation[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${item.author ?? ""}:${item.year ?? ""}:${item.number ?? ""}:${item.raw}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function citationMatches(citation: Citation, reference: ReferenceEntry) {
  if (citation.kind === "ieee") return citation.number === reference.index;
  if (!citation.author || !reference.authorKey) return false;
  if (citation.author !== reference.authorKey) return false;
  if (citation.kind === "mla") return true;
  return !citation.year || citation.year === reference.year;
}

function analyze(text: string, bibliography: string, style: CitationStyle): Analysis {
  const citations = uniqueCitations([
    ...(style === "ieee" ? [] : extractAuthorYear(text)),
    ...(style === "apa7" || style === "harvard" ? [] : extractIeee(text)),
    ...(style === "mla" ? extractMla(text) : style === "auto" ? extractMla(text) : []),
  ]);

  const references = splitReferences(bibliography).map((raw, index) => parseReference(raw, index + 1, style));
  const missingCitations = citations.filter((citation) => !references.some((reference) => citationMatches(citation, reference)));
  const uncitedReferences = references.filter((reference) => !citations.some((citation) => citationMatches(citation, reference)));

  const normalizedGroups = new Map<string, string[]>();
  for (const reference of references) {
    const key = reference.doi ? `doi:${reference.doi}` : compact(reference.raw).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const items = normalizedGroups.get(key) ?? [];
    items.push(reference.raw);
    normalizedGroups.set(key, items);
  }
  const duplicateGroups = [...normalizedGroups.values()].filter((items) => items.length > 1);

  const doiCounts = new Map<string, number>();
  for (const reference of references) {
    if (!reference.doi) continue;
    doiCounts.set(reference.doi, (doiCounts.get(reference.doi) ?? 0) + 1);
  }
  const duplicateDois = [...doiCounts.entries()].filter(([, count]) => count > 1).map(([doi]) => doi);

  const issueCount = references.reduce((total, reference) => total + reference.issues.filter((issue) => !issue.startsWith("No DOI")).length, 0)
    + missingCitations.length * 2
    + duplicateGroups.length * 2;
  const score = Math.max(0, Math.min(100, 100 - issueCount * 8 - uncitedReferences.length * 3));
  const matchedCount = Math.max(0, citations.length - missingCitations.length);

  return {
    citations,
    references,
    missingCitations,
    uncitedReferences,
    duplicateGroups,
    duplicateDois,
    normalizedBibliography: references.map((reference) => reference.normalized).join("\n\n"),
    score,
    matchedCount,
  };
}

async function copyText(value: string) {
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function currentStudioDraft() {
  const accepted = Array.from(document.querySelectorAll<HTMLElement>("section,article,div")).find((element) =>
    compact(element.textContent ?? "").includes("ACCEPTED DRAFT PREVIEW"),
  );
  const acceptedText = accepted?.querySelector<HTMLElement>("p,textarea,[data-draft]")?.textContent ?? "";
  if (compact(acceptedText)) return compact(acceptedText);
  return document.querySelector<HTMLTextAreaElement>('textarea[maxlength="12000"]')?.value ?? "";
}

export default function CitationReferenceAssistantV30({ open, onClose }: Props) {
  const [draft, setDraft] = useState("");
  const [bibliography, setBibliography] = useState("");
  const [style, setStyle] = useState<CitationStyle>("auto");
  const [result, setResult] = useState<Analysis | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const report = useMemo(() => {
    if (!result) return "";
    const lines = [
      "Averis Citation & Reference Review",
      `Readiness score: ${result.score}/100`,
      `In-text citations: ${result.citations.length}`,
      `Matched citations: ${result.matchedCount}`,
      `Bibliography entries: ${result.references.length}`,
      `Unresolved citations: ${result.missingCitations.length}`,
      `Uncited references: ${result.uncitedReferences.length}`,
      `Duplicate reference groups: ${result.duplicateGroups.length}`,
      "",
      "Unresolved in-text citations:",
      ...(result.missingCitations.length ? result.missingCitations.map((item) => `- ${item.raw}`) : ["- None detected"]),
      "",
      "References needing review:",
      ...result.references.flatMap((reference) => reference.issues.map((issue) => `- #${reference.index}: ${issue}`)),
      "",
      "Note: This is a deterministic consistency review. Verify final formatting against your university's required style guide.",
    ];
    return lines.join("\n");
  }, [result]);

  const runAnalysis = () => setResult(analyze(draft, bibliography, style));
  const doCopy = async (label: string, value: string) => {
    const ok = await copyText(value);
    setCopied(ok ? label : "Copy failed");
    window.setTimeout(() => setCopied(null), 1800);
  };

  if (!open) return null;

  return (
    <div className="citationV30Backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className="citationV30Drawer" role="dialog" aria-modal="true" aria-labelledby="citation-v30-title">
        <header className="citationV30Header">
          <div>
            <span>CITATION & REFERENCE ASSISTANT · V30</span>
            <h2 id="citation-v30-title">Make the reference list submission-ready.</h2>
            <p>Local consistency checks for in-text citations, bibliography links, duplicates, missing fields and DOI normalization. Averis never invents missing source metadata.</p>
          </div>
          <button type="button" className="citationV30Close" onClick={onClose} aria-label="Close citation and reference assistant">×</button>
        </header>

        <div className="citationV30Body">
          <section className="citationV30Setup">
            <div className="citationV30Toolbar">
              <label>
                <span>CITATION STYLE</span>
                <select value={style} onChange={(event) => { setStyle(event.target.value as CitationStyle); setResult(null); }}>
                  <option value="auto">Auto-detect common patterns</option>
                  <option value="apa7">APA 7 / author-year</option>
                  <option value="harvard">Harvard / author-year</option>
                  <option value="ieee">IEEE / numbered</option>
                  <option value="mla">MLA / author-page</option>
                </select>
              </label>
              <button type="button" onClick={() => { setDraft(currentStudioDraft()); setResult(null); }}>Load current Studio draft</button>
              <button type="button" className="citationV30Primary" onClick={runAnalysis} disabled={!compact(draft) || !compact(bibliography)}>Analyze references</button>
            </div>

            <div className="citationV30Inputs">
              <label>
                <span>01 · DRAFT / IN-TEXT CITATIONS</span>
                <textarea value={draft} onChange={(event) => { setDraft(event.target.value); setResult(null); }} placeholder="Paste your assignment text, or load the current Studio draft…" />
                <small>{compact(draft).split(/\s+/).filter(Boolean).length.toLocaleString()} words · stays in this browser session</small>
              </label>
              <label>
                <span>02 · BIBLIOGRAPHY / REFERENCE LIST</span>
                <textarea value={bibliography} onChange={(event) => { setBibliography(event.target.value); setResult(null); }} placeholder="Paste one reference per line, or separate references with a blank line…" />
                <small>No metadata is fabricated. Missing fields are flagged for you to verify.</small>
              </label>
            </div>
          </section>

          {!result ? (
            <section className="citationV30Empty">
              <span>READY WHEN YOU ARE</span>
              <strong>Link the writing to the bibliography before submission.</strong>
              <p>Averis can detect common author-year, IEEE and MLA-style citation patterns, compare them with your reference list, and safely normalize DOI links without changing source facts.</p>
            </section>
          ) : (
            <>
              <section className="citationV30Score" aria-label="Citation readiness summary">
                <article><span>READINESS</span><strong>{result.score}<small>/100</small></strong><p>{result.score >= 85 ? "Strong consistency signal" : result.score >= 65 ? "Review a few citation links" : "Reference cleanup recommended"}</p></article>
                <article><span>IN-TEXT</span><strong>{result.citations.length}</strong><p>{result.matchedCount} linked to a bibliography entry</p></article>
                <article><span>REFERENCES</span><strong>{result.references.length}</strong><p>{result.uncitedReferences.length} appear uncited</p></article>
                <article><span>ATTENTION</span><strong>{result.missingCitations.length + result.duplicateGroups.length}</strong><p>unresolved citations + duplicate groups</p></article>
              </section>

              <section className="citationV30Panel">
                <div className="citationV30PanelHead">
                  <div><span>CONSISTENCY MAP</span><strong>In-text ↔ bibliography checks</strong></div>
                  <button type="button" onClick={() => doCopy("report", report)}>Copy review report</button>
                </div>
                <div className="citationV30IssueGrid">
                  <article data-state={result.missingCitations.length ? "warn" : "pass"}>
                    <span>UNRESOLVED CITATIONS</span><strong>{result.missingCitations.length}</strong>
                    <div>{result.missingCitations.length ? result.missingCitations.map((item, index) => <p key={`${item.raw}-${index}`}>{item.raw}</p>) : <p>Every detected citation has a likely bibliography match.</p>}</div>
                  </article>
                  <article data-state={result.uncitedReferences.length ? "review" : "pass"}>
                    <span>UNCITED REFERENCES</span><strong>{result.uncitedReferences.length}</strong>
                    <div>{result.uncitedReferences.length ? result.uncitedReferences.map((item) => <p key={item.index}>#{item.index} {item.authorKey ?? "Unknown"}{item.year ? ` · ${item.year}` : ""}</p>) : <p>No obvious uncited bibliography entries detected.</p>}</div>
                  </article>
                  <article data-state={result.duplicateGroups.length ? "warn" : "pass"}>
                    <span>DUPLICATES</span><strong>{result.duplicateGroups.length}</strong>
                    <div>{result.duplicateGroups.length ? result.duplicateGroups.map((group, index) => <p key={index}>{group.length} entries look identical or share a DOI</p>) : <p>No duplicate reference groups detected.</p>}</div>
                  </article>
                </div>
              </section>

              <section className="citationV30Panel">
                <div className="citationV30PanelHead">
                  <div><span>REFERENCE HEALTH</span><strong>Fields and DOI normalization</strong></div>
                  <small>Heuristic checks — verify against the original source.</small>
                </div>
                <div className="citationV30ReferenceList">
                  {result.references.map((reference) => (
                    <article key={reference.index}>
                      <div className="citationV30ReferenceTop">
                        <span>#{String(reference.index).padStart(2, "0")}</span>
                        <strong>{reference.authorKey ?? "Author unclear"}{reference.year ? ` · ${reference.year}` : ""}</strong>
                        <b>{reference.issues.filter((issue) => !issue.startsWith("No DOI")).length ? "REVIEW" : "READY"}</b>
                      </div>
                      <p>{reference.raw}</p>
                      {reference.doi ? <small>DOI → {canonicalDoi(reference.doi)}</small> : reference.url ? <small>URL → {reference.url}</small> : <small>No DOI/URL detected; this can still be valid depending on source type.</small>}
                      {reference.issues.length > 0 && <ul>{reference.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
                    </article>
                  ))}
                </div>
              </section>

              <section className="citationV30Panel citationV30Normalized">
                <div className="citationV30PanelHead">
                  <div><span>SAFE NORMALIZATION</span><strong>Copy-ready cleanup using only supplied metadata</strong></div>
                  <button type="button" onClick={() => doCopy("bibliography", result.normalizedBibliography)}>Copy normalized bibliography</button>
                </div>
                <textarea readOnly value={result.normalizedBibliography} aria-label="Normalized bibliography" />
                <p>Normalization only collapses spacing, removes duplicate DOI syntax, canonicalizes DOI links and adds IEEE numbering when selected. It does not invent missing bibliographic facts or guarantee institutional style compliance.</p>
              </section>
            </>
          )}

          {copied && <div className="citationV30Toast" role="status">{copied === "Copy failed" ? copied : `${copied} copied`}</div>}
        </div>
      </aside>
    </div>
  );
}
