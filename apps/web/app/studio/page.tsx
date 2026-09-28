"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase, supabaseConfigured } from "../../lib/supabase";
import StudentProductivityV23 from "./StudentProductivityV23";
import styles from "./studio.module.css";

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
  dois_before?: string[];
  dois_after?: string[];
  missing_dois?: string[];
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

type Decision = "accept" | "keep";
type RowStatus = "unchanged" | "changed" | "added" | "removed";

type TextUnit = {
  text: string;
  paragraph: number;
};

type SentenceRow = {
  id: string;
  original: string | null;
  suggested: string | null;
  paragraphHint: number;
  similarity: number;
  status: RowStatus;
  missingCitations: string[];
  missingNumbers: string[];
  missingDois: string[];
  safeToAccept: boolean;
};

const goals = [
  ["clarity", "Clarity", "Make the argument easier to follow without changing meaning."],
  ["academic", "Academic tone", "Improve precision and formality while preserving evidence."],
  ["concise", "Concise", "Remove repetition and filler without removing claims or citations."],
  ["structure", "Flow", "Improve sentence transitions while keeping the original reasoning."],
  ["paraphrase", "Source-safe paraphrase", "Improve your own wording while preserving attribution."],
  ["grammar", "Grammar", "Correct mechanics with the smallest reasonable wording changes."],
] as const;

const AUTHOR_YEAR = /\([^()]{0,90}\b(?:19|20)\d{2}[a-z]?[^()]{0,45}\)/gi;
const NUMERIC_CITATION = /\[(?:\d{1,4}\s*(?:[-–,;]\s*\d{1,4}\s*)*)\]/g;
const NUMBER = /(?<!\w)\d+(?:\.\d+)?%?(?!\w)/g;
const DOI = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi;

function goalPrompt(goal: string) {
  if (goal === "academic") return "Improve academic tone and sentence precision while preserving my meaning, citations, quotations and factual claims.";
  if (goal === "concise") return "Make the writing more concise by removing repetition and filler while preserving my meaning, citations, quotations and factual claims.";
  if (goal === "structure") return "Improve sentence flow, transitions and local structure while preserving my meaning, citations, quotations and factual claims.";
  if (goal === "paraphrase") return "Improve source-safe paraphrasing of my own draft while preserving factual claims, quotations, citations and source attribution. Do not add new claims or minimize evidence scores.";
  if (goal === "grammar") return "Correct grammar, punctuation and mechanics with the smallest reasonable wording changes while preserving my meaning, citations, quotations and factual claims.";
  return "Improve clarity and readability while preserving my meaning, citations, quotations and factual claims.";
}

function splitUnits(text: string): TextUnit[] {
  const paragraphs = text.replace(/\r\n/g, "\n").split(/\n\s*\n+/);
  const units: TextUnit[] = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const compact = paragraph.replace(/\s+/g, " ").trim();
    if (!compact) return;
    const sentences = compact.split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter(Boolean);
    sentences.forEach((sentence) => units.push({ text: sentence, paragraph: paragraphIndex }));
  });
  return units;
}

function normalized(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sentenceSimilarity(left: string, right: string) {
  const a = new Set(normalized(left).split(/\s+/).filter(Boolean));
  const b = new Set(normalized(right).split(/\s+/).filter(Boolean));
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  a.forEach((token) => { if (b.has(token)) intersection += 1; });
  return intersection / (a.size + b.size - intersection);
}

function uniqueMatches(text: string, pattern: RegExp) {
  const matches = text.match(pattern) ?? [];
  return [...new Set(matches.map((item) => item.trim()))];
}

function preservationAudit(original: string, suggestion: string) {
  const citationsBefore = [...uniqueMatches(original, AUTHOR_YEAR), ...uniqueMatches(original, NUMERIC_CITATION)];
  const citationsAfter = [...uniqueMatches(suggestion, AUTHOR_YEAR), ...uniqueMatches(suggestion, NUMERIC_CITATION)];
  const numbersBefore = uniqueMatches(original, NUMBER);
  const numbersAfter = uniqueMatches(suggestion, NUMBER);
  const doisBefore = uniqueMatches(original, DOI);
  const doisAfter = uniqueMatches(suggestion, DOI);
  return {
    missingCitations: citationsBefore.filter((item) => !citationsAfter.includes(item)),
    missingNumbers: numbersBefore.filter((item) => !numbersAfter.includes(item)),
    missingDois: doisBefore.filter((item) => !doisAfter.includes(item)),
  };
}

function alignSentences(originalText: string, suggestedText: string): SentenceRow[] {
  const original = splitUnits(originalText);
  const suggested = splitUnits(suggestedText);
  const gap = -0.52;
  const dp = Array.from({ length: original.length + 1 }, () => Array(suggested.length + 1).fill(0));
  const move = Array.from({ length: original.length + 1 }, () => Array<"diag" | "up" | "left" | "">(suggested.length + 1).fill(""));

  for (let i = 1; i <= original.length; i += 1) {
    dp[i][0] = i * gap;
    move[i][0] = "up";
  }
  for (let j = 1; j <= suggested.length; j += 1) {
    dp[0][j] = j * gap;
    move[0][j] = "left";
  }

  for (let i = 1; i <= original.length; i += 1) {
    for (let j = 1; j <= suggested.length; j += 1) {
      const similarity = sentenceSimilarity(original[i - 1].text, suggested[j - 1].text);
      const pairScore = similarity >= 0.18 ? similarity * 1.55 : -0.78;
      const diagonal = dp[i - 1][j - 1] + pairScore;
      const up = dp[i - 1][j] + gap;
      const left = dp[i][j - 1] + gap;
      const best = Math.max(diagonal, up, left);
      dp[i][j] = best;
      move[i][j] = best === diagonal ? "diag" : best === up ? "up" : "left";
    }
  }

  const raw: Array<{ original: TextUnit | null; suggested: TextUnit | null }> = [];
  let i = original.length;
  let j = suggested.length;
  while (i > 0 || j > 0) {
    const direction = move[i][j];
    if (i > 0 && j > 0 && direction === "diag") {
      raw.push({ original: original[i - 1], suggested: suggested[j - 1] });
      i -= 1;
      j -= 1;
    } else if (i > 0 && (direction === "up" || j === 0)) {
      raw.push({ original: original[i - 1], suggested: null });
      i -= 1;
    } else {
      raw.push({ original: null, suggested: suggested[j - 1] });
      j -= 1;
    }
  }

  return raw.reverse().map((pair, index) => {
    const left = pair.original?.text ?? "";
    const right = pair.suggested?.text ?? "";
    const audit = preservationAudit(left, right);
    const similarity = pair.original && pair.suggested ? sentenceSimilarity(left, right) : 0;
    const status: RowStatus = !pair.original ? "added" : !pair.suggested ? "removed" : normalized(left) === normalized(right) ? "unchanged" : "changed";
    return {
      id: `sentence-${index + 1}`,
      original: pair.original?.text ?? null,
      suggested: pair.suggested?.text ?? null,
      paragraphHint: pair.original?.paragraph ?? pair.suggested?.paragraph ?? 0,
      similarity,
      status,
      missingCitations: audit.missingCitations,
      missingNumbers: audit.missingNumbers,
      missingDois: audit.missingDois,
      safeToAccept: audit.missingCitations.length === 0 && audit.missingNumbers.length === 0 && audit.missingDois.length === 0,
    };
  });
}

function composeDraft(rows: SentenceRow[], decisions: Record<string, Decision>) {
  const chosen = rows
    .map((row) => {
      const text = row.status === "unchanged"
        ? row.original
        : decisions[row.id] === "accept"
          ? row.suggested
          : row.original;
      return text?.trim() ? { text: text.trim(), paragraph: row.paragraphHint } : null;
    })
    .filter((item): item is { text: string; paragraph: number } => Boolean(item));

  const paragraphs: string[] = [];
  let currentParagraph: number | null = null;
  chosen.forEach((item) => {
    if (currentParagraph === null || item.paragraph !== currentParagraph) {
      paragraphs.push(item.text);
      currentParagraph = item.paragraph;
    } else {
      paragraphs[paragraphs.length - 1] += ` ${item.text}`;
    }
  });
  return paragraphs.join("\n\n");
}

export default function RevisionStudioPage() {
  const [user, setUser] = useState<User | null>(null);
  const [draft, setDraft] = useState("");
  const [source, setSource] = useState("");
  const [sourceName, setSourceName] = useState("Comparison source");
  const [goal, setGoal] = useState("clarity");
  const [strength, setStrength] = useState<"light" | "balanced">("balanced");
  const [preflight, setPreflight] = useState<PreflightResponse | null>(null);
  const [result, setResult] = useState<RefineResponse | null>(null);
  const [recheck, setRecheck] = useState<PreflightResponse | null>(null);
  const [busy, setBusy] = useState<"preflight" | "generate" | "recheck" | null>(null);
  const [error, setError] = useState("");
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [decisionHistory, setDecisionHistory] = useState<Array<Record<string, Decision>>>([]);
  const [copied, setCopied] = useState(false);
  const [baselineBackup, setBaselineBackup] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => { if (active) setUser(data.session?.user ?? null); });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => { if (active) setUser(session?.user ?? null); });
    return () => { active = false; subscription.subscription.unsubscribe(); };
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
    const response = await fetch(`${API_URL}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
    const payload = (await response.json().catch(() => ({}))) as T & { detail?: string };
    if (!response.ok) throw new Error(payload.detail ?? `Request failed (${response.status}).`);
    return payload;
  }

  function clearProposal() {
    setPreflight(null);
    setResult(null);
    setRecheck(null);
    setDecisions({});
    setDecisionHistory([]);
    setCopied(false);
    setError("");
  }

  async function runPreflight(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (draft.trim().length < 50) {
      setError("Paste at least 50 characters of your own draft before running the evidence gate.");
      return;
    }
    setBusy("preflight");
    setError("");
    setResult(null);
    setRecheck(null);
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

  async function generateProposal() {
    if (!preflight?.generation_eligible) return;
    setBusy("generate");
    setError("");
    setRecheck(null);
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
      setError(err instanceof Error ? err.message : "Revision proposal failed.");
    } finally {
      setBusy(null);
    }
  }

  const rows = useMemo(() => result?.suggested_text ? alignSentences(result.original_text, result.suggested_text) : [], [result]);

  useEffect(() => {
    if (!rows.length) {
      setDecisions({});
      setDecisionHistory([]);
      return;
    }
    const initial: Record<string, Decision> = {};
    rows.forEach((row) => { if (row.status !== "unchanged") initial[row.id] = "keep"; });
    setDecisions(initial);
    setDecisionHistory([]);
  }, [rows]);

  const acceptedDraft = useMemo(() => composeDraft(rows, decisions), [rows, decisions]);
  const globalAudit = useMemo(() => preservationAudit(result?.original_text ?? "", acceptedDraft), [result, acceptedDraft]);
  const globallySafe = globalAudit.missingCitations.length === 0 && globalAudit.missingNumbers.length === 0 && globalAudit.missingDois.length === 0;
  const changedRows = rows.filter((row) => row.status !== "unchanged");
  const acceptedRows = changedRows.filter((row) => decisions[row.id] === "accept");
  const unsafeRows = changedRows.filter((row) => !row.safeToAccept);

  function updateDecision(row: SentenceRow, decision: Decision) {
    if (decision === "accept" && !row.safeToAccept) return;
    setDecisionHistory((history) => [...history.slice(-24), decisions]);
    setDecisions((current) => ({ ...current, [row.id]: decision }));
    setRecheck(null);
    setCopied(false);
  }

  function acceptSafeChanges() {
    if (!changedRows.length) return;
    setDecisionHistory((history) => [...history.slice(-24), decisions]);
    const next = { ...decisions };
    changedRows.forEach((row) => { next[row.id] = row.safeToAccept ? "accept" : "keep"; });
    setDecisions(next);
    setRecheck(null);
  }

  function resetDecisions() {
    if (!changedRows.length) return;
    setDecisionHistory((history) => [...history.slice(-24), decisions]);
    const next: Record<string, Decision> = {};
    changedRows.forEach((row) => { next[row.id] = "keep"; });
    setDecisions(next);
    setRecheck(null);
  }

  function undoDecision() {
    const previous = decisionHistory[decisionHistory.length - 1];
    if (!previous) return;
    setDecisions(previous);
    setDecisionHistory((history) => history.slice(0, -1));
    setRecheck(null);
  }

  async function recheckAcceptedDraft() {
    if (!acceptedDraft.trim() || !globallySafe) return;
    setBusy("recheck");
    setError("");
    try {
      const payload = await post<PreflightResponse>("/api/v1/ai/revision/preflight", {
        text: acceptedDraft,
        source_text: source.trim() || null,
        source_name: sourceName.trim() || "Comparison source",
        requested_goal: goalPrompt(goal),
      });
      setRecheck(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accepted-draft evidence re-check failed.");
    } finally {
      setBusy(null);
    }
  }

  async function copyAcceptedDraft() {
    if (!acceptedDraft || !globallySafe) return;
    await navigator.clipboard.writeText(acceptedDraft);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function applyAcceptedAsBaseline() {
    if (!acceptedDraft || !globallySafe) return;
    setBaselineBackup(draft);
    setDraft(acceptedDraft);
    clearProposal();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function restorePreviousBaseline() {
    if (baselineBackup == null) return;
    setDraft(baselineBackup);
    setBaselineBackup(null);
    clearProposal();
  }

  if (supabaseConfigured && !user) {
    return (
      <main className={styles.page}>
        <section className={styles.locked}>
          <span className={styles.brand} aria-hidden="true" />
          <p className={styles.eyebrow}>AVERIS REVISION STUDIO</p>
          <h1>Sign in to review and accept revision proposals sentence by sentence.</h1>
          <p>The studio keeps the evidence-first boundary attached to your authenticated Averis session.</p>
          <Link href="/">Return to Averis and sign in</Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>REVISION STUDIO · V23</p>
          <h1>Review every proposed sentence before it becomes your draft.</h1>
          <p className={styles.lede}>Choose Local Ollama, Private Browser AI, or Cloud AI in the runtime bar. Averis checks evidence first, requests a proposal only through the runtime you selected, and keeps every wording decision under your control.</p>
        </div>
        <aside className={styles.boundaryCard}>
          <span>HUMAN-CONTROLLED REVISION</span>
          <strong>Keep original by default.</strong>
          <small>Citation, DOI, and number loss blocks acceptance until you review the wording.</small>
        </aside>
      </section>

      <section className={styles.flowStrip} aria-label="Revision Studio workflow">
        <div><span>01</span><strong>Evidence gate</strong><small>writing + optional source</small></div>
        <i aria-hidden="true">→</i>
        <div><span>02</span><strong>Selected-runtime proposal</strong><small>browser, local, or cloud</small></div>
        <i aria-hidden="true">→</i>
        <div><span>03</span><strong>Sentence review</strong><small>accept or keep original</small></div>
        <i aria-hidden="true">→</i>
        <div><span>04</span><strong>Evidence re-check</strong><small>before using accepted text</small></div>
      </section>

      {baselineBackup != null && (
        <div className={styles.restoreBar}>
          <span>New baseline applied locally in this browser session.</span>
          <button type="button" onClick={restorePreviousBaseline}>Restore previous baseline</button>
        </div>
      )}

      {error && <div className={styles.error} role="alert"><b>!</b><span>{error}</span></div>}

      <form className={styles.setupGrid} onSubmit={runPreflight}>
        <section className={styles.editorCard}>
          <div className={styles.cardHead}><span>01</span><div><small>ORIGINAL DRAFT</small><h2>Start from text you are responsible for</h2></div></div>
          <textarea value={draft} maxLength={12000} onChange={(event) => { setDraft(event.target.value); clearProposal(); }} placeholder="Paste the section you want to revise…" />
          <div className={styles.meta}><span>{draft.trim() ? draft.trim().split(/\s+/).length : 0} words</span><span>{draft.length.toLocaleString()} / 12,000 characters</span></div>
        </section>

        <aside className={styles.intentCard}>
          <div className={styles.cardHead}><span>02</span><div><small>REVISION INTENT</small><h2>Choose the writing goal</h2></div></div>
          <div className={styles.goalGrid}>
            {goals.map(([key, label, copy]) => (
              <button type="button" key={key} className={goal === key ? styles.goalActive : ""} onClick={() => { setGoal(key); clearProposal(); }} aria-pressed={goal === key}>
                <strong>{label}</strong><small>{copy}</small>
              </button>
            ))}
          </div>
          <div className={styles.strengthRow}>
            <span>EDIT STRENGTH</span>
            <div>
              <button type="button" className={strength === "light" ? styles.selected : ""} onClick={() => setStrength("light")} aria-pressed={strength === "light"}>Light</button>
              <button type="button" className={strength === "balanced" ? styles.selected : ""} onClick={() => setStrength("balanced")} aria-pressed={strength === "balanced"}>Balanced</button>
            </div>
          </div>
        </aside>

        <section className={styles.sourceCard}>
          <div className={styles.cardHead}><span>03</span><div><small>OPTIONAL SOURCE CONTEXT</small><h2>Re-check evidence after your accepted edits</h2></div></div>
          <input value={sourceName} maxLength={250} onChange={(event) => { setSourceName(event.target.value); clearProposal(); }} aria-label="Comparison source name" />
          <textarea value={source} maxLength={40000} onChange={(event) => { setSource(event.target.value); clearProposal(); }} placeholder="Paste source text only when you want before/after source evidence…" />
          <div className={styles.meta}><span>Optional</span><span>Source similarity is evidence, not an optimization target</span></div>
        </section>

        <div className={styles.actionBar}>
          <div><b>Step 1 · evidence first</b><span>No revision proposal is requested before the preflight boundary runs.</span></div>
          <button type="submit" disabled={busy !== null || draft.trim().length < 50}>{busy === "preflight" ? "Checking evidence…" : "Run evidence gate"}</button>
        </div>
      </form>

      {preflight && (
        <section className={styles.preflightCard}>
          <div className={styles.sectionHead}>
            <div><p className={styles.eyebrow}>PREFLIGHT</p><h2>Evidence before generation</h2></div>
            <span className={preflight.generation_eligible ? styles.goodChip : styles.warnChip}>{preflight.generation_eligible ? "REVISION ELIGIBLE" : "GENERATION BLOCKED"}</span>
          </div>
          <div className={styles.metrics}>
            <article><span>STYLE UNIFORMITY</span><strong>{preflight.writing.style_uniformity_signal}</strong><small>/100 review signal</small></article>
            <article><span>SENTENCES</span><strong>{preflight.writing.sentence_count}</strong><small>{preflight.writing.word_count} words</small></article>
            <article><span>SOURCE SIMILARITY</span><strong>{preflight.source_evidence ? `${preflight.source_evidence.similarity_percent}%` : "—"}</strong><small>{preflight.source_evidence?.review_band ?? "no source supplied"}</small></article>
            <article><span>BOUNDARY</span><strong>{preflight.generation_eligible ? "PASS" : "HOLD"}</strong><small>{preflight.boundary.replaceAll("_", " ")}</small></article>
          </div>
          {preflight.blocked_reason && <p className={styles.blockedReason}>{preflight.blocked_reason}</p>}
          {preflight.evidence_first_actions.length > 0 && <ul className={styles.preflightActions}>{preflight.evidence_first_actions.slice(0, 4).map((action) => <li key={action}>{action}</li>)}</ul>}
          <div className={styles.generateBar}>
            <div><b>Step 2 · request a bounded proposal</b><span>The selected runtime stays explicit. Averis does not automatically switch to another paid or local runtime.</span></div>
            <button type="button" onClick={generateProposal} disabled={!preflight.generation_eligible || busy !== null}>{busy === "generate" ? "Generating proposal…" : "Generate revision proposal"}</button>
          </div>
        </section>
      )}

      {result && !result.suggested_text && (
        <section className={styles.runtimeCard}>
          <span>SELECTED RUNTIME STATUS</span>
          <h2>Proposal generation is not available from the selected runtime.</h2>
          <p>{result.blocked_reason ?? "The selected runtime did not return a revision proposal."}</p>
          <small>Evidence review remains available. Averis does not silently switch to another inference provider.</small>
        </section>
      )}

      {result?.suggested_text && (
        <>
          <StudentProductivityV23
            original={result.original_text}
            proposal={result.suggested_text}
            goalLabel={goals.find(([key]) => key === goal)?.[1] ?? "Clarity"}
            strength={strength}
            sourceProvided={Boolean(source.trim())}
            serverPreservationSafe={result.preservation?.acceptance_eligible ?? false}
            recheckComplete={Boolean(recheck)}
            onAcceptSafe={acceptSafeChanges}
          />

          <section className={styles.studioSection}>
            <div className={styles.sectionHead}>
              <div><p className={styles.eyebrow}>SENTENCE REVIEW</p><h2>Accept changes one unit at a time</h2></div>
              <span className={globallySafe ? styles.goodChip : styles.warnChip}>{globallySafe ? "PROTECTED TOKENS PRESERVED" : "PRESERVATION HOLD"}</span>
            </div>

            <div className={styles.summaryGrid}>
              <div><span>CHANGED UNITS</span><strong>{changedRows.length}</strong><small>unchanged text stays original</small></div>
              <div><span>ACCEPTED</span><strong>{acceptedRows.length}</strong><small>explicit user decisions</small></div>
              <div><span>BLOCKED UNITS</span><strong>{unsafeRows.length}</strong><small>citation / DOI / number loss</small></div>
              <div><span>WHOLE PROPOSAL CHECK</span><strong>{result.preservation?.acceptance_eligible ? "PASS" : "REVIEW"}</strong><small>{result.evidence_version}</small></div>
            </div>

            <div className={styles.reviewToolbar}>
              <button type="button" onClick={acceptSafeChanges} disabled={!changedRows.length}>Accept all preservation-safe</button>
              <button type="button" onClick={resetDecisions} disabled={!changedRows.length}>Keep all originals</button>
              <button type="button" onClick={undoDecision} disabled={!decisionHistory.length}>Undo last decision</button>
            </div>

            <div className={styles.diffHeader} aria-hidden="true"><span>ORIGINAL</span><span>PROPOSED</span><span>DECISION</span></div>
            <div className={styles.diffList}>
              {rows.map((row, index) => {
                const decision = decisions[row.id] ?? "keep";
                return (
                  <article className={`${styles.diffRow} ${row.status === "unchanged" ? styles.unchanged : ""}`} key={row.id}>
                    <div className={styles.originalCell}>
                      <span>#{String(index + 1).padStart(2, "0")} · {row.status.toUpperCase()}</span>
                      <p>{row.original ?? <em>No original sentence</em>}</p>
                    </div>
                    <div className={styles.proposedCell}>
                      <span>{row.status === "unchanged" ? "NO WORDING CHANGE" : `${Math.round(row.similarity * 100)}% TOKEN OVERLAP`}</span>
                      <p>{row.suggested ?? <em>Proposed deletion</em>}</p>
                      {!row.safeToAccept && (
                        <div className={styles.preservationWarning}>
                          <b>Acceptance blocked</b>
                          {row.missingCitations.length > 0 && <small>Missing citation: {row.missingCitations.join(" · ")}</small>}
                          {row.missingDois.length > 0 && <small>Missing DOI: {row.missingDois.join(" · ")}</small>}
                          {row.missingNumbers.length > 0 && <small>Missing number: {row.missingNumbers.join(" · ")}</small>}
                        </div>
                      )}
                    </div>
                    <div className={styles.decisionCell}>
                      {row.status === "unchanged" ? <span className={styles.unchangedChip}>UNCHANGED</span> : (
                        <>
                          <button type="button" className={decision === "accept" ? styles.acceptActive : ""} disabled={!row.safeToAccept} onClick={() => updateDecision(row, "accept")} aria-pressed={decision === "accept"}>Accept proposed</button>
                          <button type="button" className={decision === "keep" ? styles.keepActive : ""} onClick={() => updateDecision(row, "keep")} aria-pressed={decision === "keep"}>Keep original</button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            <section className={styles.acceptedPreview}>
              <div className={styles.previewHead}>
                <div><p className={styles.eyebrow}>ACCEPTED DRAFT PREVIEW</p><h3>Only your explicit decisions are composed here</h3></div>
                <span>{acceptedDraft.trim() ? acceptedDraft.trim().split(/\s+/).length : 0} words</span>
              </div>
              <pre>{acceptedDraft}</pre>
              {!globallySafe && (
                <div className={styles.globalHold} role="alert">
                  <b>Protected-token hold</b>
                  <span>The composed draft still removes protected content. Revert the affected decisions before copying, applying, or re-checking.</span>
                  {globalAudit.missingCitations.length > 0 && <small>Citations: {globalAudit.missingCitations.join(" · ")}</small>}
                  {globalAudit.missingDois.length > 0 && <small>DOIs: {globalAudit.missingDois.join(" · ")}</small>}
                  {globalAudit.missingNumbers.length > 0 && <small>Numbers: {globalAudit.missingNumbers.join(" · ")}</small>}
                </div>
              )}
              <div className={styles.previewActions}>
                <button type="button" onClick={recheckAcceptedDraft} disabled={!globallySafe || busy !== null || acceptedDraft.trim().length < 50}>{busy === "recheck" ? "Re-checking evidence…" : "Re-check accepted draft"}</button>
                <button type="button" onClick={copyAcceptedDraft} disabled={!globallySafe}>{copied ? "Copied" : "Copy accepted draft"}</button>
                <button type="button" onClick={applyAcceptedAsBaseline} disabled={!globallySafe}>Use as new baseline</button>
              </div>
            </section>
          </section>
        </>
      )}

      {recheck && (
        <section className={styles.recheckCard}>
          <div className={styles.sectionHead}>
            <div><p className={styles.eyebrow}>POST-DECISION EVIDENCE</p><h2>Review the accepted draft before using it</h2></div>
            <span className={recheck.generation_eligible ? styles.goodChip : styles.warnChip}>RE-CHECK COMPLETE</span>
          </div>
          <div className={styles.compareGrid}>
            <article><span>STYLE SIGNAL</span><div><b>{preflight?.writing.style_uniformity_signal ?? "—"}</b><i>→</i><strong>{recheck.writing.style_uniformity_signal}</strong></div><small>context signal, not authorship proof</small></article>
            <article><span>SOURCE SIMILARITY</span><div><b>{preflight?.source_evidence ? `${preflight.source_evidence.similarity_percent}%` : "—"}</b><i>→</i><strong>{recheck.source_evidence ? `${recheck.source_evidence.similarity_percent}%` : "—"}</strong></div><small>evidence context, never an optimization target</small></article>
            <article><span>WORDS</span><div><b>{preflight?.writing.word_count ?? "—"}</b><i>→</i><strong>{recheck.writing.word_count}</strong></div><small>accepted-draft size</small></article>
          </div>
          <p className={styles.caution}>A lower or higher similarity value after revision does not prove better academic integrity. Review quotation, citation, reference, and institutional requirements separately before submission.</p>
        </section>
      )}

      <footer className={styles.footerNote}>
        <span>AVERIS REVISION STUDIO</span>
        <p>Source-safe originality support · no automatic runtime fallback · no automatic acceptance · evidence re-check before submission.</p>
        <Link href="/revision/">Open Evidence AI</Link>
        <Link href="/refine/">Open Writing Refinement</Link>
      </footer>
    </main>
  );
}
