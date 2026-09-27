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
    overlap_review_band: string;
    matched_passages: PassageMatch[];
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

export default function RevisionPage() {
  const [user, setUser] = useState<User | null>(null);
  const [draft, setDraft] = useState("");
  const [source, setSource] = useState("");
  const [sourceName, setSourceName] = useState("Comparison source");
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
          <h1>Fix weak paraphrasing, copied wording, and repetitive AI-like writing patterns with evidence.</h1>
          <p className={styles.lede}>Averis combines source-overlap metrics with writing-style signals and optional local open-source AI. It helps you revise honestly; it does not promise to hide AI use or beat academic-integrity detectors.</p>
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
          <textarea value={source} maxLength={40000} onChange={(event) => { setSource(event.target.value); setReport(null); }} placeholder="Paste a source to measure exact, fuzzy and semantic overlap…" />
          <div className={styles.metaRow}><span>Optional</span><span>No extra scan credit</span></div>
        </article>

        <div className={styles.runRow}>
          <div><b>Real metrics</b><span>Exact overlap · fuzzy passages · semantic candidate · lexical diversity · sentence variation · repeated trigrams</span></div>
          <button type="submit" disabled={busy || draft.trim().length < 50}>{busy ? "Analyzing evidence…" : "Run originality & AI-style review"}</button>
        </div>
      </form>

      {!report ? (
        <section className={styles.emptyState}><span>◎</span><h2>No revision evidence yet</h2><p>Paste your draft, optionally add the source you used, then run the review.</p></section>
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
                  <div><span>SEMANTIC</span><strong>{report.source_evidence.semantic_similarity_percent ?? "—"}{report.source_evidence.semantic_similarity_percent != null ? "%" : ""}</strong><small>{report.source_evidence.semantic_provider ?? "AI model unavailable"}</small></div>
                </div>
              </article>
            )}
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionTitle}><div><p className={styles.eyebrow}>REVISION PLAN</p><h2>Fix the underlying academic-integrity risks</h2></div><span className={styles.safeChip}>NO DETECTOR EVASION</span></div>
            <ol className={styles.actionList}>{report.revision_actions.map((action, index) => <li key={`${index}-${action}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{action}</p></li>)}</ol>
            {report.coach_summary && <div className={styles.aiCoach}><span>LOCAL AI COACH</span><p>{report.coach_summary}</p></div>}
          </section>

          {report.source_evidence && report.source_evidence.matched_passages.length > 0 && (
            <section className={styles.panel}>
              <div className={styles.sectionTitle}><div><p className={styles.eyebrow}>MATCHED PASSAGES</p><h2>Review wording before you submit</h2></div></div>
              <div className={styles.matches}>{report.source_evidence.matched_passages.map((match, index) => <article key={`${index}-${match.document_sentence}`}><div><span>MATCH {String(index + 1).padStart(2, "0")}</span><strong>{Math.round(match.score)}%</strong></div><small>YOUR DRAFT</small><p>{match.document_sentence}</p><small>SOURCE</small><p>{match.source_sentence}</p></article>)}</div>
            </section>
          )}

          <p className={styles.caution}>{report.caution}</p>
        </>
      )}
    </main>
  );
}
