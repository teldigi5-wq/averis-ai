"use client";

import { useMemo, useState } from "react";

import { supabase } from "../../lib/supabase";
import styles from "./source-citation-workbench-v26.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type PassageMatch = {
  document_sentence: string;
  source_sentence: string;
  score: number;
};

type QuotePassage = {
  document_sentence: string;
  match_score: number;
  citation_detected: boolean;
  citation_marker: string | null;
  quote_detected: boolean;
  quote_style: string | null;
  context_status: string;
};

type ReferenceEvidence = {
  index: number;
  raw: string;
  doi: string | null;
  year: string | null;
  author_key: string | null;
  verification_status: string;
  verification_issues: string[];
  verified_title: string | null;
  verified_doi: string | null;
  verified_year: number | null;
  verified_authors: string[];
};

type ReferenceLink = {
  document_sentence: string;
  match_score: number;
  citation_marker: string | null;
  link_status: string;
  references: ReferenceEvidence[];
};

type PassageReview = {
  document_sentence: string;
  match_score: number;
  priority: string;
  reasons: string[];
  quote_detected: boolean;
  citation_detected: boolean;
  citation_marker: string | null;
  reference_link_status: string;
  verified_reference_count: number;
  metadata_review_reference_count: number;
};

type AnalyzeResponse = {
  source_evidence: {
    exact_overlap_percent: number;
    fuzzy_passage_percent: number;
    overlap_review_band: string;
    matched_passages: PassageMatch[];
  } | null;
  quote_review: {
    matched_passage_count: number;
    quoted_passage_count: number;
    quoted_without_citation_count: number;
    high_match_unquoted_count: number;
    passages: QuotePassage[];
  } | null;
  passage_review: {
    passages_reviewed: number;
    high_attention_count: number;
    attention_count: number;
    contextualized_count: number;
    items: PassageReview[];
  } | null;
  reference_linkage: {
    supplied_reference_count: number;
    linked_passage_count: number;
    unlinked_citation_count: number;
    doi_verified_reference_count: number;
    doi_metadata_review_count: number;
    verification_unavailable_count: number;
    links: ReferenceLink[];
  } | null;
  revision_actions: string[];
  caution: string;
  evidence_version: string;
};

type Props = {
  original: string;
  proposal: string;
  source: string;
  sourceName: string;
  onStartAiReview: () => void;
};

type ReviewTarget = "proposal" | "original";

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sameSentence(left: string, right: string) {
  return normalize(left) === normalize(right);
}

function priorityLabel(priority: string) {
  if (priority === "high_attention") return "High attention";
  if (priority === "attention") return "Review";
  return "Contextualized";
}

function verificationLabel(reference: ReferenceEvidence) {
  if (reference.verification_status === "verified" && reference.verification_issues.length === 0) return "Crossref resolved";
  if (reference.verification_status === "verified" && reference.verification_issues.length > 0) return "Metadata review";
  if (reference.verification_status === "unavailable") return "Verification unavailable";
  return "Local bibliography link";
}

function recommendation(item: PassageReview, link: ReferenceLink | undefined) {
  if (item.quote_detected && !item.citation_detected) {
    return "Direct quotation appears present without a nearby recognized citation. Add the required attribution and verify the quote against the source.";
  }
  if (!item.quote_detected && !item.citation_detected && item.match_score >= 70) {
    return "High-overlap wording has no nearby citation. Paraphrase from your own understanding or quote the wording directly, then attribute the source.";
  }
  if (item.citation_detected && (!link || link.link_status !== "linked")) {
    return "A citation marker is present but could not be linked cleanly to the supplied bibliography. Check the in-text citation and reference entry.";
  }
  if (item.metadata_review_reference_count > 0) {
    return "The DOI resolved, but author/year metadata differs from the supplied reference. Verify the bibliography before submission.";
  }
  if (item.verified_reference_count > 0) {
    return "The citation links to a DOI-resolved reference. Confirm that the cited work actually supports this sentence and that the citation style is correct.";
  }
  if (item.quote_detected && item.citation_detected) {
    return "Quotation and citation context are present. Confirm quotation accuracy, page details where required, and bibliography linkage.";
  }
  return "Review the source relationship manually. A similarity or citation signal alone does not prove whether the wording is acceptable.";
}

export default function SourceCitationWorkbenchV26({ original, proposal, source, sourceName, onStartAiReview }: Props) {
  const [target, setTarget] = useState<ReviewTarget>("proposal");
  const [referencesText, setReferencesText] = useState("");
  const [verifyCrossref, setVerifyCrossref] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const reviewText = target === "proposal" ? proposal : original;
  const items = result?.passage_review?.items ?? [];
  const sourceMatches = result?.source_evidence?.matched_passages ?? [];
  const quotePassages = result?.quote_review?.passages ?? [];
  const links = result?.reference_linkage?.links ?? [];

  const evidenceRows = useMemo(() => items.map((item, index) => {
    const sourceMatch = sourceMatches.find((match) => sameSentence(match.document_sentence, item.document_sentence));
    const quote = quotePassages.find((candidate) => sameSentence(candidate.document_sentence, item.document_sentence));
    const link = links.find((candidate) => sameSentence(candidate.document_sentence, item.document_sentence));
    return {
      id: `source-workbench-${index + 1}`,
      item,
      sourceMatch,
      quote,
      link,
      recommendation: recommendation(item, link),
    };
  }), [items, links, quotePassages, sourceMatches]);

  async function runAnalysis() {
    if (!source.trim()) {
      setError("Add a comparison source before running Source & Citation Workbench.");
      return;
    }
    if (reviewText.trim().length < 50) {
      setError("The selected text needs at least 50 characters before evidence analysis.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token ?? null;
      const headers = new Headers({ "Content-Type": "application/json" });
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const response = await fetch(`${API_URL}/api/v1/ai/revision/analyze`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          text: reviewText,
          source_text: source,
          source_name: sourceName || "Comparison source",
          references_text: referencesText.trim() || null,
          verify_linked_references: verifyCrossref,
          include_ai_coach: false,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as AnalyzeResponse & { detail?: string };
      if (!response.ok) throw new Error(payload.detail ?? `Evidence analysis failed (${response.status}).`);
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Source and citation analysis failed.");
    } finally {
      setBusy(false);
    }
  }

  async function copyEvidenceBrief() {
    if (!result) return;
    const lines = [
      `Averis Source & Citation Workbench — ${target === "proposal" ? "AI proposal" : "original draft"}`,
      `Source: ${sourceName || "Comparison source"}`,
      `Passages reviewed: ${result.passage_review?.passages_reviewed ?? 0}`,
      `High attention: ${result.passage_review?.high_attention_count ?? 0}`,
      `Citation markers not linked to bibliography: ${result.reference_linkage?.unlinked_citation_count ?? 0}`,
      `DOI-resolved references: ${result.reference_linkage?.doi_verified_reference_count ?? 0}`,
      `Metadata review cases: ${result.reference_linkage?.doi_metadata_review_count ?? 0}`,
      "",
      ...evidenceRows.map((row, index) => `${index + 1}. ${priorityLabel(row.item.priority)} — ${row.recommendation}`),
      "",
      "Human review required: DOI resolution and citation linkage do not prove that a source supports a claim.",
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className={styles.workbench} aria-labelledby="source-citation-workbench-title">
      <div className={styles.head}>
        <div>
          <p>SOURCE & CITATION AI WORKBENCH · V26</p>
          <h2 id="source-citation-workbench-title">Trace each risky sentence back to evidence.</h2>
          <span>Connect matched source wording, quotation context, nearby citations, bibliography entries and DOI metadata before deciding what wording to keep.</span>
        </div>
        <div className={styles.boundaryBadge}>
          <small>EVIDENCE BOUNDARY</small>
          <strong>Human decision required</strong>
          <span>No plagiarism verdict · no detector score target</span>
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.targetSwitch} role="group" aria-label="Text to review">
          <button type="button" className={target === "proposal" ? styles.active : ""} onClick={() => { setTarget("proposal"); setResult(null); }} aria-pressed={target === "proposal"}>AI proposal</button>
          <button type="button" className={target === "original" ? styles.active : ""} onClick={() => { setTarget("original"); setResult(null); }} aria-pressed={target === "original"}>Original draft</button>
        </div>
        <div className={styles.controlMeta}>
          <span>Comparison source</span>
          <strong>{source.trim() ? sourceName || "Comparison source" : "Not supplied"}</strong>
        </div>
        <label className={styles.verifyToggle}>
          <input type="checkbox" checked={verifyCrossref} onChange={(event) => setVerifyCrossref(event.target.checked)} />
          <span><b>Verify linked DOI metadata</b><small>Optional Crossref check · bounded to linked references by the API</small></span>
        </label>
      </div>

      <div className={styles.bibliographyPanel}>
        <div>
          <span>BIBLIOGRAPHY / REFERENCES</span>
          <strong>Paste the reference list used by this section.</strong>
          <small>Author-year and conservative numeric citation markers can be linked to supplied references. DOI metadata is review evidence, not proof of source relevance.</small>
        </div>
        <textarea
          value={referencesText}
          onChange={(event) => { setReferencesText(event.target.value); setResult(null); }}
          maxLength={25000}
          placeholder={'Example:\nSmith, J. (2024). Digital learning in higher education. Journal Name. https://doi.org/10.xxxx/xxxxx'}
          aria-label="Bibliography for source and citation workbench"
        />
        <div className={styles.bibliographyActions}>
          <span>{referencesText.length.toLocaleString()} / 25,000 characters</span>
          <button type="button" onClick={runAnalysis} disabled={busy || !source.trim()}>{busy ? "Linking evidence…" : "Analyze source + citations"}</button>
        </div>
      </div>

      {error && <div className={styles.error} role="alert"><b>Workbench could not complete the check.</b><span>{error}</span></div>}

      {result ? (
        <>
          <div className={styles.metrics}>
            <article><span>PASSAGES</span><strong>{result.passage_review?.passages_reviewed ?? 0}</strong><small>source-matched sentences triaged</small></article>
            <article data-tone={(result.passage_review?.high_attention_count ?? 0) > 0 ? "warn" : "good"}><span>HIGH ATTENTION</span><strong>{result.passage_review?.high_attention_count ?? 0}</strong><small>review before using wording</small></article>
            <article><span>BIBLIOGRAPHY LINKS</span><strong>{result.reference_linkage?.linked_passage_count ?? 0}</strong><small>{result.reference_linkage?.unlinked_citation_count ?? 0} unresolved citation markers</small></article>
            <article><span>DOI METADATA</span><strong>{result.reference_linkage?.doi_verified_reference_count ?? 0}</strong><small>{result.reference_linkage?.doi_metadata_review_count ?? 0} metadata review cases</small></article>
          </div>

          <div className={styles.workflowBar}>
            <div><span>01</span><b>Student sentence</b></div><i>→</i>
            <div><span>02</span><b>Source passage</b></div><i>→</i>
            <div><span>03</span><b>Quote + citation</b></div><i>→</i>
            <div><span>04</span><b>Reference + DOI</b></div><i>→</i>
            <div><span>05</span><b>Recommendation</b></div>
          </div>

          <div className={styles.resultHead}>
            <div><span>PASSAGE EVIDENCE</span><strong>{evidenceRows.length ? "Review the evidence chain sentence by sentence." : "No matched passage rows require triage."}</strong></div>
            <button type="button" onClick={copyEvidenceBrief} disabled={!result}>{copied ? "Evidence brief copied" : "Copy evidence brief"}</button>
          </div>

          {evidenceRows.length ? (
            <div className={styles.rows}>
              {evidenceRows.map((row, index) => (
                <article className={styles.row} key={row.id} data-priority={row.item.priority}>
                  <div className={styles.rowIndex}>{String(index + 1).padStart(2, "0")}</div>
                  <div className={styles.sentenceCell}>
                    <span>STUDENT SENTENCE</span>
                    <p>{row.item.document_sentence}</p>
                    <div className={styles.tags}>
                      <em>{priorityLabel(row.item.priority)}</em>
                      <em>{Math.round(row.item.match_score)}% match strength</em>
                    </div>
                  </div>
                  <div className={styles.sourceCell}>
                    <span>MATCHED SOURCE PASSAGE</span>
                    <p>{row.sourceMatch?.source_sentence ?? "Matched source sentence is not available in this evidence row."}</p>
                    <small>{row.quote?.quote_detected ? `Quotation detected${row.quote.quote_style ? ` · ${row.quote.quote_style}` : ""}` : "Not inside a recognized quotation"}</small>
                  </div>
                  <div className={styles.citationCell}>
                    <span>CITATION + REFERENCE</span>
                    <strong>{row.item.citation_detected ? row.item.citation_marker || "Citation detected" : "No nearby citation detected"}</strong>
                    <small>{row.link ? `Bibliography link: ${row.link.link_status}` : "No bibliography link for this passage"}</small>
                    {row.link?.references?.slice(0, 2).map((reference) => (
                      <div className={styles.referenceCard} key={`${row.id}-${reference.index}`}>
                        <b>{reference.verified_title || reference.raw}</b>
                        <span>{reference.verified_doi || reference.doi || "No DOI supplied"}</span>
                        <em data-state={reference.verification_issues.length ? "review" : "ok"}>{verificationLabel(reference)}</em>
                        {reference.verification_issues.length > 0 && <small>{reference.verification_issues.join(" · ")}</small>}
                      </div>
                    ))}
                  </div>
                  <div className={styles.recommendationCell}>
                    <span>RECOMMENDATION</span>
                    <p>{row.recommendation}</p>
                    {row.item.reasons.length > 0 && <small>Evidence: {row.item.reasons.join(" · ")}</small>}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.empty}><strong>No passage-level attention rows returned.</strong><span>Still confirm quotations, citation style, bibliography completeness and whether each cited source genuinely supports the claim.</span></div>
          )}

          <div className={styles.actions}>
            <div>
              <span>NEXT HUMAN-CONTROLLED STEP</span>
              <strong>Use evidence to decide whether the proposal needs a source-safe revision.</strong>
              <small>Switching goals never auto-accepts a change. The existing sentence Decision Workspace remains the acceptance gate.</small>
            </div>
            <button type="button" onClick={onStartAiReview}>Open source-safe AI revision</button>
          </div>

          <p className={styles.caution}>{result.caution}</p>
        </>
      ) : (
        <div className={styles.empty}>
          <strong>{source.trim() ? "Ready to build the evidence chain." : "Add a comparison source first."}</strong>
          <span>{source.trim() ? "Paste the bibliography when available, then run the workbench. Without a bibliography, Averis can still inspect quote/citation context but cannot link markers to references." : "The workbench needs source text to show sentence → source evidence. It does not query or imitate a private Turnitin database."}</span>
        </div>
      )}
    </section>
  );
}
