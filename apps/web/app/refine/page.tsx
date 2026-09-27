"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase, supabaseConfigured } from "../../lib/supabase";
import styles from "./refine.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type WritingMetrics = {
  word_count: number;
  sentence_count: number;
  paragraph_count: number;
  lexical_diversity_percent: number;
  sentence_length_cv_percent: number;
  paragraph_length_cv_percent: number;
  repeated_trigram_ratio_percent: number;
  style_uniformity_signal: number;
  style_uniformity_band: string;
};

type SourceEvidence = {
  source_name: string;
  similarity_percent: number;
  exact_overlap_percent: number;
  fuzzy_passage_percent: number;
  matched_passage_count?: number;
  strongest_passage_score?: number | null;
  review_band: string;
  evidence_note?: string;
};

type PreflightResponse = {
  writing: WritingMetrics;
  source_evidence: SourceEvidence | null;
  generation_eligible: boolean;
  boundary: string;
  blocked_reason: string | null;
  evidence_first_actions: string[];
  caution: string;
  evidence_version: string;
};

type Preservation = {
  citations_before: string[];
  citations_after: string[];
  missing_citations: string[];
  numbers_before: string[];
  numbers_after: string[];
  missing_numbers: string[];
  length_change_percent: number;
  acceptance_eligible: boolean;
};

type RefineResponse = {
  generation_eligible: boolean;
  runtime_available: boolean;
  boundary: string;
  blocked_reason: string | null;
  original_text: string;
  suggested_text: string | null;
  preservation: Preservation | null;
  source_evidence_before: SourceEvidence | null;
  source_evidence_after: SourceEvidence | null;
  caution: string;
  evidence_version: string;
};

const goals = [
  ["clarity", "Clarity", "Make the argument easier to follow without changing meaning."],
  ["academic", "Academic tone", "Tighten wording and formality while preserving your voice."],
  ["concise", "Concise", "Remove repetition and unnecessary filler without removing evidence."],
  ["structure", "Structure", "Improve sentence flow and logical transitions."],
] as const;

function goalPrompt(goal: string) {
  if (goal === "academic") return "Improve academic tone and sentence precision while preserving my meaning, citations, quotations and factual claims.";
  if (goal === "concise") return "Make the writing more concise by removing repetition and filler while preserving my meaning, citations, quotations and factual claims.";
  if (goal === "structure") return "Improve sentence flow, transitions and local structure while preserving my meaning, citations, quotations and factual claims.";
  return "Improve clarity and readability while preserving my meaning, citations, quotations and factual claims.";
}

export default function RefinePage() {
  const [user, setUser] = useState<User | null>(null);
  const [draft, setDraft] = useState("");
  const [source, setSource] = useState("");
  const [sourceName, setSourceName] = useState("Comparison source");
  const [goal, setGoal] = useState("clarity");
  const [strength, setStrength] = useState<"light" | "balanced">("balanced");
  const [preflight, setPreflight] = useState<PreflightResponse | null>(null);
  const [result, setResult] = useState<RefineResponse | null>(null);
  const [busy, setBusy] = useState<"preflight" | "refine" | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const wordCount = useMemo(() => draft.trim() ? draft.trim().split(/\s+/).length : 0, [draft]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUser(data.session?.user ?? null);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUser(session?.user ?? null);
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

  async function post<T>(path: string, body: object): Promise<T> {
    const token = await accessToken();
    const headers = new Headers({ "Content-Type": "application/json" });
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as T & { detail?: string };
    if (!response.ok) throw new Error(payload.detail ?? `Request failed (${response.status}).`);
    return payload;
  }

  function resetEvidence() {
    setPreflight(null);
    setResult(null);
    setCopied(false);
    setError("");
  }

  async function runPreflight(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (draft.trim().length < 50) {
      setError("Paste at least 50 characters of your own draft before running the evidence check.");
      return;
    }
    setBusy("preflight");
    setError("");
    setResult(null);
    try {
      const payload = await post<PreflightResponse>("/api/v1/ai/revision/preflight", {
        text: draft,
        source_text: source.trim() || null,
        source_name: sourceName.trim() || "Comparison source",
        requested_goal: goalPrompt(goal),
      });
      setPreflight(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preflight review failed.");
    } finally {
      setBusy(null);
    }
  }

  async function generateRefinement() {
    if (!preflight?.generation_eligible) return;
    setBusy("refine");
    setError("");
    setCopied(false);
    try {
      const payload = await post<RefineResponse>("/api/v1/ai/revision/refine", {
        text: draft,
        source_text: source.trim() || null,
        source_name: sourceName.trim() || "Comparison source",
        requested_goal: goalPrompt(goal),
        strength,
      });
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Writing refinement failed.");
    } finally {
      setBusy(null);
    }
  }

  async function copySuggestion() {
    if (!result?.suggested_text) return;
    await navigator.clipboard.writeText(result.suggested_text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function reviewSuggestionAgain() {
    if (!result?.suggested_text) return;
    setDraft(result.suggested_text);
    setPreflight(null);
    setResult(null);
    setCopied(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (supabaseConfigured && !user) {
    return (
      <main className={styles.page}>
        <section className={styles.locked}>
          <span className={styles.logo} aria-hidden="true" />
          <p>AVERIS WRITING REFINEMENT</p>
          <h1>Sign in before generating a revision proposal.</h1>
          <span>The evidence-first review and local-AI boundary stay attached to your authenticated Averis session.</span>
          <a href="/">Return to Averis and sign in</a>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>WRITING REFINEMENT · LOCAL OLLAMA PATH</p>
          <h1>Make the writing stronger without hiding the evidence.</h1>
          <p className={styles.lede}>Averis checks writing and source evidence first, then can propose a clearer academic version when the optional local Ollama runtime is available. The workflow preserves citations and numbers and never optimizes for detector evasion.</p>
        </div>
        <aside className={styles.boundaryCard}>
          <span>SAFE REVISION BOUNDARY</span>
          <strong>Evidence → proposal → preservation check → re-review.</strong>
          <small>No AI-detector score optimization. No fabricated sources.</small>
        </aside>
      </section>

      {error ? <div className={styles.error}><b>!</b><span>{error}</span></div> : null}

      <form className={styles.workbench} onSubmit={runPreflight}>
        <section className={styles.editorPanel}>
          <div className={styles.panelHead}>
            <span>01</span>
            <div><small>YOUR ORIGINAL TEXT</small><h2>Start from your own draft</h2></div>
            <b>{wordCount.toLocaleString()} words</b>
          </div>
          <textarea
            value={draft}
            maxLength={12000}
            onChange={(event) => { setDraft(event.target.value); resetEvidence(); }}
            placeholder="Paste the section you want to improve…"
          />
          <div className={styles.editorMeta}><span>{draft.length.toLocaleString()} / 12,000 characters</span><span>Use a section, not an entire thesis</span></div>
        </section>

        <aside className={styles.controlPanel}>
          <div className={styles.panelHead}>
            <span>02</span>
            <div><small>REVISION INTENT</small><h2>Choose what should improve</h2></div>
          </div>
          <div className={styles.goalGrid}>
            {goals.map(([key, label, copy]) => (
              <button
                type="button"
                key={key}
                className={goal === key ? styles.goalActive : ""}
                onClick={() => { setGoal(key); resetEvidence(); }}
              >
                <strong>{label}</strong><small>{copy}</small>
              </button>
            ))}
          </div>
          <div className={styles.strengthRow}>
            <span>EDIT STRENGTH</span>
            <div>
              <button type="button" className={strength === "light" ? styles.selected : ""} onClick={() => setStrength("light")}>Light</button>
              <button type="button" className={strength === "balanced" ? styles.selected : ""} onClick={() => setStrength("balanced")}>Balanced</button>
            </div>
          </div>
        </aside>

        <section className={styles.sourcePanel}>
          <div className={styles.panelHead}>
            <span>03</span>
            <div><small>OPTIONAL SOURCE CONTEXT</small><h2>Re-check source overlap after the proposal</h2></div>
          </div>
          <input value={sourceName} maxLength={250} onChange={(event) => { setSourceName(event.target.value); resetEvidence(); }} aria-label="Source name" />
          <textarea value={source} maxLength={40000} onChange={(event) => { setSource(event.target.value); resetEvidence(); }} placeholder="Paste the source text only when you want before/after source evidence…" />
          <div className={styles.editorMeta}><span>Optional</span><span>Averis does not tell the model to chase a lower overlap score</span></div>
        </section>

        <div className={styles.preflightBar}>
          <div><b>Step 1 · evidence first</b><span>Writing metrics and optional source overlap are shown before any revision proposal can run.</span></div>
          <button type="submit" disabled={busy !== null || draft.trim().length < 50}>{busy === "preflight" ? "Checking evidence…" : "Run preflight evidence"}</button>
        </div>
      </form>

      {preflight ? (
        <section className={styles.preflightResults}>
          <div className={styles.resultsHead}>
            <div><p className={styles.eyebrow}>PREFLIGHT EVIDENCE</p><h2>See what the system knows before it changes a word.</h2></div>
            <span className={preflight.generation_eligible ? styles.eligible : styles.blocked}>{preflight.generation_eligible ? "REVISION ELIGIBLE" : "GENERATION BLOCKED"}</span>
          </div>

          <div className={styles.metricGrid}>
            <article><span>STYLE UNIFORMITY</span><strong>{preflight.writing.style_uniformity_signal}</strong><small>/100 writing signal · not authorship proof</small></article>
            <article><span>LEXICAL DIVERSITY</span><strong>{preflight.writing.lexical_diversity_percent}%</strong><small>unique-word share</small></article>
            <article><span>SENTENCE VARIATION</span><strong>{preflight.writing.sentence_length_cv_percent}%</strong><small>length variation</small></article>
            <article><span>REPEATED TRIGRAMS</span><strong>{preflight.writing.repeated_trigram_ratio_percent}%</strong><small>repeated three-word frames</small></article>
          </div>

          {preflight.source_evidence ? (
            <div className={styles.sourceEvidence}>
              <div><span>OVERALL SOURCE SIGNAL</span><strong>{preflight.source_evidence.similarity_percent}%</strong></div>
              <div><span>EXACT OVERLAP</span><strong>{preflight.source_evidence.exact_overlap_percent}%</strong></div>
              <div><span>FUZZY PASSAGE</span><strong>{preflight.source_evidence.fuzzy_passage_percent}%</strong></div>
              <div><span>REVIEW BAND</span><strong>{preflight.source_evidence.review_band}</strong></div>
            </div>
          ) : null}

          <div className={styles.actionsPanel}>
            <div>
              <span>WHAT TO REVIEW FIRST</span>
              <ul>{preflight.evidence_first_actions.map((action) => <li key={action}>{action}</li>)}</ul>
            </div>
            {preflight.blocked_reason ? <p className={styles.blockReason}>{preflight.blocked_reason}</p> : null}
          </div>

          {preflight.generation_eligible ? (
            <div className={styles.generateBar}>
              <div><b>Step 2 · generate a proposal</b><span>The backend re-checks the same safety boundary before asking Ollama to revise the text.</span></div>
              <button type="button" disabled={busy !== null} onClick={generateRefinement}>{busy === "refine" ? "Generating locally…" : "Generate refinement proposal"}</button>
            </div>
          ) : null}
        </section>
      ) : null}

      {result ? (
        <section className={styles.resultSection}>
          <div className={styles.resultsHead}>
            <div><p className={styles.eyebrow}>REFINEMENT RESULT</p><h2>{result.suggested_text ? "Compare before accepting anything." : "The writing runtime is not available here yet."}</h2></div>
            <span className={result.runtime_available ? styles.eligible : styles.runtimeOff}>{result.runtime_available ? "OLLAMA RESPONSE" : "LOCAL RUNTIME OFF"}</span>
          </div>

          {!result.suggested_text ? (
            <div className={styles.runtimeMessage}>
              <span className={styles.logo} aria-hidden="true" />
              <div><strong>Evidence works without Ollama.</strong><p>{result.blocked_reason ?? "Enable the configured local Ollama model to generate a proposal."}</p></div>
            </div>
          ) : (
            <>
              <div className={styles.compareGrid}>
                <article><span>ORIGINAL</span><p>{result.original_text}</p></article>
                <article><span>SUGGESTED</span><p>{result.suggested_text}</p></article>
              </div>

              {result.preservation ? (
                <div className={styles.preservationPanel}>
                  <div className={result.preservation.acceptance_eligible ? styles.checkGood : styles.checkWarn}>
                    <span>PRESERVATION CHECK</span>
                    <strong>{result.preservation.acceptance_eligible ? "No tracked citations or numbers were dropped" : "Review missing citation / numeric details"}</strong>
                  </div>
                  <div><span>LENGTH CHANGE</span><strong>{result.preservation.length_change_percent > 0 ? "+" : ""}{result.preservation.length_change_percent}%</strong></div>
                  <div><span>CITATIONS MISSING</span><strong>{result.preservation.missing_citations.length}</strong></div>
                  <div><span>NUMBERS MISSING</span><strong>{result.preservation.missing_numbers.length}</strong></div>
                </div>
              ) : null}

              {result.source_evidence_before && result.source_evidence_after ? (
                <div className={styles.beforeAfterEvidence}>
                  <div><span>BEFORE · SOURCE SIGNAL</span><strong>{result.source_evidence_before.similarity_percent}%</strong><small>{result.source_evidence_before.review_band}</small></div>
                  <i>→</i>
                  <div><span>AFTER · SOURCE SIGNAL</span><strong>{result.source_evidence_after.similarity_percent}%</strong><small>{result.source_evidence_after.review_band}</small></div>
                  <p>This comparison is evidence only. Averis does not instruct the model to minimize the score.</p>
                </div>
              ) : null}

              <div className={styles.resultActions}>
                <button type="button" onClick={copySuggestion}>{copied ? "Copied" : "Copy suggestion"}</button>
                <button type="button" className={styles.secondary} onClick={reviewSuggestionAgain}>Use as draft & re-check evidence</button>
              </div>
            </>
          )}
          <p className={styles.caution}>{result.caution}</p>
        </section>
      ) : null}
    </main>
  );
}
