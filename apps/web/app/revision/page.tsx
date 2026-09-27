"use client";

import { FormEvent, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase, supabaseConfigured } from "../../lib/supabase";
import styles from "./revision.module.css";

type PassageMatch = {
  document_sentence: string;
  source_sentence: string;
  score: number;
};

type CitationPassageReview = {
  document_sentence: string;
  match_score: number;
  citation_detected: boolean;
  citation_marker: string | null;
};

type QuotePassageContext = {
  document_sentence: string;
  match_score: number;
  citation_detected: boolean;
  citation_marker: string | null;
  quote_detected: boolean;
  quote_style: string | null;
  context_status: string;
};

type LinkedReference = {
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

type CitationReferenceLink = {
  document_sentence: string;
  match_score: number;
  citation_marker: string | null;
  link_status: string;
  references: LinkedReference[];
};

type RevisionReport = {
  writing: {
    word_count: number;
    sentence_count: number;
    paragraph_count: number;
    lexical_diversity_percent: number;
    hapax_ratio_percent: number;
    sentence_length_mean: number;
    sentence_length_cv_percent: number;
    paragraph_length_cv_percent: number;
    repeated_trigram_ratio_percent: number;
    style_uniformity_signal: number;
    style_uniformity_band: string;
  };
  source_evidence: null | {
    exact_overlap_percent: number;
    fuzzy_passage_percent: number;
    minhash_candidate_percent: number | null;
    lexical_vector_percent: number | null;
    semantic_similarity_percent: number | null;
    semantic_provider: string | null;
    semantic_calibrated: boolean;
    semantic_calibration_id: string | null;
    overlap_review_band: string;
    matched_passages: PassageMatch[];
    semantic_passages: PassageMatch[];
  };
  citation_review: null | {
    matched_passage_count: number;
    citation_detected_count: number;
    uncited_match_count: number;
    citation_coverage_percent: number;
    passages: CitationPassageReview[];
    scope_note: string;
  };
  quote_review: null | {
    matched_passage_count: number;
    quoted_passage_count: number;
    quoted_with_citation_count: number;
    quoted_without_citation_count: number;
    unquoted_with_citation_count: number;
    unquoted_without_citation_count: number;
    high_match_unquoted_count: number;
    passages: QuotePassageContext[];
    scope_note: string;
  };
  reference_linkage: null | {
    supplied_reference_count: number;
    linked_passage_count: number;
    unlinked_citation_count: number;
    doi_verified_reference_count: number;
    doi_metadata_review_count: number;
    verification_unavailable_count: number;
    links: CitationReferenceLink[];
    scope_note: string;
  };
  revision_actions: string[];
  ai_enabled: boolean;
  ai_provider: string;
  semantic_model: string | null;
  coach_summary: string | null;
  caution: string;
  evidence_version: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function toneClass(band: string) {
  if (band === "high review") return styles.high;
  if (band === "review") return styles.review;
  return styles.low;
}

function verificationLabel(status: string) {
  if (status === "verified_doi") return "DOI VERIFIED";
  if (status === "verified_doi_metadata_review") return "DOI METADATA REVIEW";
  if (status === "doi_not_found") return "DOI NOT FOUND";
  if (status === "verification_unavailable") return "VERIFY RETRY";
  if (status === "not_checked_limit") return "NOT CHECKED";
  return "LOCAL LINK";
}

function quoteContextLabel(status: string) {
  if (status === "quoted_with_marker") return "QUOTED + MARKER";
  if (status === "quoted_without_marker") return "QUOTED · CHECK CITATION";
  if (status === "unquoted_with_marker") return "CITED PARAPHRASE CHECK";
  return "UNQUOTED · CHECK ATTRIBUTION";
}

export default function RevisionPage() {
  const [user, setUser] = useState<User | null>(null);
  const [draft, setDraft] = useState("");
  const [source, setSource] = useState("");
  const [sourceName, setSourceName] = useState("Comparison source");
  const [references, setReferences] = useState("");
  const [report, setReport] = useState<RevisionReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUser(data.session?.user ?? null);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) setReport(null);
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function accessToken() {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.trim().length < 50) {
      setError("Paste at least 50 characters of your own draft before running the review.");
      return;
    }

    setBusy(true);
    setError("");
    setReport(null);
    try {
      const token = await accessToken();
      const headers = new Headers({ "Content-Type": "application/json" });
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const response = await fetch(`${API_URL}/api/v1/ai/revision/analyze`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          text: draft,
          source_text: source.trim() || null,
          source_name: sourceName.trim() || "Comparison source",
          references_text: references.trim() || null,
          verify_linked_references: true,
          include_ai_coach: true,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as RevisionReport & { detail?: string };
      if (!response.ok) throw new Error(payload.detail ?? `Request failed (${response.status}).`);
      setReport(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revision analysis failed.");
    } finally {
      setBusy(false);
    }
  }

  if (supabaseConfigured && !user) {
    return (
      <main className={styles.page}>
        <section className={styles.lockedCard}>
          <span className={styles.brandMark}>A</span>
          <p className={styles.eyebrow}>AVERIS REVISION COACH</p>
          <h1>Sign in to review originality and writing signals.</h1>
          <p>The coach works on your authenticated Averis session and does not provide detector-evasion rewriting.</p>
          <a href="/" className={styles.primaryLink}>Return to Averis and sign in</a>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>AI EVIDENCE LAYER · REVISION COACH</p>
          <h1>Fix weak paraphrasing, copied wording, missing attribution, and reference gaps with evidence.</h1>
          <p className={styles.lede}>Averis combines source overlap, quotation context, citation context, bibliography linkage, writing-style, and optional local semantic evidence. It helps you revise honestly; it does not promise to hide AI use or beat academic-integrity detectors.</p>
        </div>
        <div className={styles.boundaryCard}>
          <span>ACADEMIC-INTEGRITY BOUNDARY</span>
          <strong>Improve the work, not the detector score.</strong>
          <small>AI/style signals are not proof of authorship.</small>
        </div>
      </section>

      {error && <div className={styles.error}><b>!</b>{error}</div>}

      <form className={styles.workbench} onSubmit={analyze}>
        <article className={styles.panel}>
          <div className={styles.panelHead}><span>01</span><div><small>YOUR DRAFT</small><h2>Paste the text you want to improve</h2></div></div>
          <textarea value={draft} maxLength={80000} onChange={(event) => { setDraft(event.target.value); setReport(null); }} placeholder="Paste your draft here…" />
          <div className={styles.metaRow}><span>{draft.trim() ? draft.trim().split(/\s+/).length.toLocaleString() : 0} words</span><span>{draft.length.toLocaleString()} / 80,000 characters</span></div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHead}><span>02</span><div><small>OPTIONAL SOURCE EVIDENCE</small><h2>Paste the source you are worried about</h2></div></div>
          <input value={sourceName} maxLength={250} onChange={(event) => setSourceName(event.target.value)} aria-label="Comparison source name" />
          <textarea value={source} maxLength={40000} onChange={(event) => { setSource(event.target.value); setReport(null); }} placeholder="Paste a source to measure exact, fuzzy, semantic, quotation, and citation-context evidence…" />
          <div className={styles.metaRow}><span>Optional</span><span>No extra scan credit</span></div>
        </article>

        <article className={`${styles.panel} ${styles.referencePanel}`}>
          <div className={styles.panelHead}><span>03</span><div><small>OPTIONAL BIBLIOGRAPHY</small><h2>Link nearby citation markers to your actual references</h2></div></div>
          <textarea value={references} maxLength={25000} onChange={(event) => { setReferences(event.target.value); setReport(null); }} placeholder="Paste the bibliography / reference list here. Author-year and numbered citations can be linked to entries; linked DOI metadata is checked with Crossref when available…" />
          <div className={styles.metaRow}><span>{references.trim() ? references.trim().split(/\n+/).filter(Boolean).length : 0} reference lines</span><span>Up to 5 linked DOIs checked · public Crossref</span></div>
        </article>

        <div className={styles.runRow}>
          <div><b>Evidence chain</b><span>Exact overlap · fuzzy passages · quotation context · citation proximity · bibliography linkage · DOI metadata · semantic candidates · writing metrics</span></div>
          <button type="submit" disabled={busy || draft.trim().length < 50}>{busy ? "Analyzing evidence…" : "Run originality & writing review"}</button>
        </div>
      </form>

      {!report ? (
        <section className={styles.emptyState}><span>◎</span><h2>No revision evidence yet</h2><p>Paste your draft, optionally add the source and bibliography you used, then run the review.</p></section>
      ) : (
        <>
          <section className={styles.statusStrip}>
            <div><span>AI RUNTIME</span><strong>{report.ai_enabled ? "ACTIVE" : "FALLBACK"}</strong><small>{report.ai_enabled ? report.semantic_model ?? report.ai_provider : "Deterministic metrics only"}</small></div>
            <div><span>STYLE REVIEW</span><strong>{report.writing.style_uniformity_signal}</strong><small>/100 uniformity signal</small></div>
            <div><span>EVIDENCE VERSION</span><strong>{report.evidence_version}</strong><small>transparent metric set</small></div>
          </section>

          <section className={styles.resultsGrid}>
            <article className={styles.panel}>
              <div className={styles.sectionTitle}><div><p className={styles.eyebrow}>WRITING SIGNALS</p><h2>Naturalness and repetition metrics</h2></div><span className={`${styles.band} ${toneClass(report.writing.style_uniformity_band)}`}>{report.writing.style_uniformity_band}</span></div>
              <div className={styles.metricGrid}>
                <div><span>LEXICAL DIVERSITY</span><strong>{report.writing.lexical_diversity_percent}%</strong><small>unique-word share</small></div>
                <div><span>SENTENCE VARIATION</span><strong>{report.writing.sentence_length_cv_percent}%</strong><small>length CV</small></div>
                <div><span>REPEATED TRIGRAMS</span><strong>{report.writing.repeated_trigram_ratio_percent}%</strong><small>repeated 3-word frames</small></div>
                <div><span>PARAGRAPH VARIATION</span><strong>{report.writing.paragraph_length_cv_percent}%</strong><small>length CV</small></div>
              </div>
              <p className={styles.scopeNote}>These style metrics can highlight overly uniform or repetitive prose. They are not an AI-authorship probability.</p>
            </article>

            {report.source_evidence && (
              <article className={styles.panel}>
                <div className={styles.sectionTitle}><div><p className={styles.eyebrow}>SOURCE EVIDENCE</p><h2>How closely the supplied source matches</h2></div><span className={`${styles.band} ${toneClass(report.source_evidence.overlap_review_band)}`}>{report.source_evidence.overlap_review_band}</span></div>
                <div className={styles.metricGrid}>
                  <div><span>EXACT OVERLAP</span><strong>{report.source_evidence.exact_overlap_percent}%</strong><small>word-shingle Jaccard</small></div>
                  <div><span>FUZZY PASSAGES</span><strong>{report.source_evidence.fuzzy_passage_percent}%</strong><small>sentence evidence</small></div>
                  <div><span>MINHASH</span><strong>{report.source_evidence.minhash_candidate_percent ?? "—"}</strong><small>candidate signal</small></div>
                  <div><span>SEMANTIC</span><strong>{report.source_evidence.semantic_similarity_percent ?? "—"}{report.source_evidence.semantic_similarity_percent != null ? "%" : ""}</strong><small>{report.source_evidence.semantic_similarity_percent == null ? "AI model unavailable" : report.source_evidence.semantic_calibrated ? `calibrated · ${report.source_evidence.semantic_calibration_id}` : "candidate only · not calibrated"}</small></div>
                </div>
                {report.source_evidence.semantic_similarity_percent != null && !report.source_evidence.semantic_calibrated && <p className={styles.scopeNote}>Semantic scores are shown for inspection only. They do not raise or lower the review band until a labeled benchmark supplies certified thresholds.</p>}
              </article>
            )}
          </section>

          {report.citation_review && report.citation_review.matched_passage_count > 0 && (
            <section className={styles.panel}>
              <div className={styles.sectionTitle}>
                <div><p className={styles.eyebrow}>CITATION CONTEXT</p><h2>Check attribution around matched passages</h2></div>
                <span className={styles.safeChip}>{report.citation_review.uncited_match_count > 0 ? "REVIEW ATTRIBUTION" : "MARKERS FOUND"}</span>
              </div>
              <div className={styles.metricGrid}>
                <div><span>CITATION COVERAGE</span><strong>{report.citation_review.citation_coverage_percent}%</strong><small>near matched passages</small></div>
                <div><span>PASSAGES REVIEWED</span><strong>{report.citation_review.matched_passage_count}</strong><small>strong lexical/fuzzy matches</small></div>
                <div><span>MARKER DETECTED</span><strong>{report.citation_review.citation_detected_count}</strong><small>common nearby citation form</small></div>
                <div><span>UNCITED CANDIDATES</span><strong>{report.citation_review.uncited_match_count}</strong><small>needs manual attribution review</small></div>
              </div>
              {report.citation_review.uncited_match_count > 0 && (
                <div className={styles.matches}>
                  {report.citation_review.passages.filter((item) => !item.citation_detected).slice(0, 4).map((item, index) => (
                    <article key={`citation-${index}-${item.document_sentence}`}>
                      <div><span>ATTRIBUTION CHECK {String(index + 1).padStart(2, "0")}</span><strong>{Math.round(item.match_score)}%</strong></div>
                      <small>MATCHED DRAFT PASSAGE</small>
                      <p>{item.document_sentence}</p>
                      <small>No nearby recognized citation marker detected</small>
                    </article>
                  ))}
                </div>
              )}
              <p className={styles.scopeNote}>{report.citation_review.scope_note}</p>
            </section>
          )}

          {report.quote_review && report.quote_review.matched_passage_count > 0 && (
            <section className={styles.panel}>
              <div className={styles.sectionTitle}>
                <div><p className={styles.eyebrow}>QUOTATION CONTEXT</p><h2>Separate direct-quote context from paraphrase review</h2></div>
                <span className={styles.safeChip}>{report.quote_review.quoted_without_citation_count > 0 || report.quote_review.high_match_unquoted_count > 0 ? "CHECK WORDING" : "CONTEXT RECORDED"}</span>
              </div>
              <div className={styles.metricGrid}>
                <div><span>QUOTED MATCHES</span><strong>{report.quote_review.quoted_passage_count}</strong><small>recognized quotation context</small></div>
                <div><span>QUOTED + MARKER</span><strong>{report.quote_review.quoted_with_citation_count}</strong><small>quote with nearby citation form</small></div>
                <div><span>QUOTED · NO MARKER</span><strong>{report.quote_review.quoted_without_citation_count}</strong><small>check attribution requirements</small></div>
                <div><span>HIGH MATCH · UNQUOTED</span><strong>{report.quote_review.high_match_unquoted_count}</strong><small>85%+ passage match, quote not detected</small></div>
              </div>
              <div className={styles.matches}>
                {report.quote_review.passages.filter((item) => item.quote_detected || item.match_score >= 85).slice(0, 6).map((item, index) => (
                  <article key={`quote-${index}-${item.document_sentence}`}>
                    <div><span>WORDING CONTEXT {String(index + 1).padStart(2, "0")}</span><strong>{Math.round(item.match_score)}%</strong></div>
                    <small>{quoteContextLabel(item.context_status)}</small>
                    <p>{item.document_sentence}</p>
                    {item.citation_marker && <small>Nearby marker: {item.citation_marker}</small>}
                  </article>
                ))}
              </div>
              <p className={styles.scopeNote}>{report.quote_review.scope_note}</p>
            </section>
          )}

          {report.reference_linkage && (
            <section className={styles.panel}>
              <div className={styles.sectionTitle}>
                <div><p className={styles.eyebrow}>REFERENCE LINKAGE</p><h2>Does the nearby citation map to an actual bibliography entry?</h2></div>
                <span className={styles.safeChip}>{report.reference_linkage.unlinked_citation_count > 0 || report.reference_linkage.doi_metadata_review_count > 0 ? "CHECK LINKS" : "BIBLIOGRAPHY LINKED"}</span>
              </div>
              <div className={styles.metricGrid}>
                <div><span>REFERENCES SUPPLIED</span><strong>{report.reference_linkage.supplied_reference_count}</strong><small>parsed bibliography entries</small></div>
                <div><span>PASSAGES LINKED</span><strong>{report.reference_linkage.linked_passage_count}</strong><small>citation marker → reference</small></div>
                <div><span>UNRESOLVED MARKERS</span><strong>{report.reference_linkage.unlinked_citation_count}</strong><small>marker not mapped to bibliography</small></div>
                <div><span>DOI RESOLVED</span><strong>{report.reference_linkage.doi_verified_reference_count}</strong><small>Crossref record found</small></div>
                <div><span>METADATA REVIEW</span><strong>{report.reference_linkage.doi_metadata_review_count}</strong><small>author/year mismatch after DOI resolve</small></div>
                <div><span>VERIFY RETRY</span><strong>{report.reference_linkage.verification_unavailable_count}</strong><small>Crossref temporarily unavailable</small></div>
              </div>
              <div className={styles.matches}>
                {report.reference_linkage.links.filter((item) => item.citation_marker).slice(0, 6).map((item, index) => (
                  <article key={`reference-link-${index}-${item.document_sentence}`}>
                    <div><span>REFERENCE LINK {String(index + 1).padStart(2, "0")}</span><strong>{item.link_status === "linked" ? "LINKED" : item.link_status === "ambiguous_link" ? "REVIEW" : "UNRESOLVED"}</strong></div>
                    <small>MATCHED DRAFT PASSAGE</small>
                    <p>{item.document_sentence}</p>
                    <small>NEARBY MARKER</small>
                    <p>{item.citation_marker}</p>
                    {item.references.length > 0 ? item.references.map((reference) => (
                      <div className={styles.referenceEvidence} key={`${item.document_sentence}-${reference.index}`}>
                        <span>REFERENCE {reference.index} · {verificationLabel(reference.verification_status)}</span>
                        <p>{reference.raw}</p>
                        {reference.verified_title && <small>Crossref: {reference.verified_title}{reference.verified_year ? ` · ${reference.verified_year}` : ""}{reference.verified_doi ? ` · ${reference.verified_doi}` : ""}</small>}
                        {reference.verification_issues.length > 0 && <small>Review: {reference.verification_issues.map((issue) => issue.replaceAll("_", " ")).join(" · ")}</small>}
                      </div>
                    )) : <small>No supplied bibliography entry matched this marker.</small>}
                  </article>
                ))}
              </div>
              <p className={styles.scopeNote}>{report.reference_linkage.scope_note}</p>
            </section>
          )}

          <section className={styles.panel}>
            <div className={styles.sectionTitle}><div><p className={styles.eyebrow}>REVISION PLAN</p><h2>Fix the underlying academic-integrity risks</h2></div><span className={styles.safeChip}>NO DETECTOR EVASION</span></div>
            <ol className={styles.actionList}>{report.revision_actions.map((action, index) => <li key={`${index}-${action}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{action}</p></li>)}</ol>
            {report.coach_summary && <div className={styles.aiCoach}><span>LOCAL AI COACH</span><p>{report.coach_summary}</p></div>}
          </section>

          {report.source_evidence && report.source_evidence.semantic_passages.length > 0 && (
            <section className={styles.panel}>
              <div className={styles.sectionTitle}><div><p className={styles.eyebrow}>SEMANTIC PARAPHRASE CANDIDATES</p><h2>Meaning-level matches from the local embedding model</h2></div><span className={styles.safeChip}>{report.source_evidence.semantic_calibrated ? "CALIBRATED EVIDENCE" : "CANDIDATE EVIDENCE"}</span></div>
              <div className={styles.matches}>{report.source_evidence.semantic_passages.map((match, index) => <article key={`semantic-${index}-${match.document_sentence}`}><div><span>SEMANTIC {String(index + 1).padStart(2, "0")}</span><strong>{Math.round(match.score)}%</strong></div><small>YOUR DRAFT</small><p>{match.document_sentence}</p><small>SOURCE</small><p>{match.source_sentence}</p></article>)}</div>
              <p className={styles.scopeNote}>Semantic cosine scores help surface paraphrases that may not share the same words. They are candidate evidence, not a plagiarism verdict.</p>
            </section>
          )}

          {report.source_evidence && report.source_evidence.matched_passages.length > 0 && (
            <section className={styles.panel}>
              <div className={styles.sectionTitle}><div><p className={styles.eyebrow}>LEXICAL / FUZZY MATCHED PASSAGES</p><h2>Review wording before you submit</h2></div></div>
              <div className={styles.matches}>{report.source_evidence.matched_passages.map((match, index) => <article key={`${index}-${match.document_sentence}`}><div><span>MATCH {String(index + 1).padStart(2, "0")}</span><strong>{Math.round(match.score)}%</strong></div><small>YOUR DRAFT</small><p>{match.document_sentence}</p><small>SOURCE</small><p>{match.source_sentence}</p></article>)}</div>
            </section>
          )}

          <p className={styles.caution}>{report.caution}</p>
        </>
      )}
    </main>
  );
}
