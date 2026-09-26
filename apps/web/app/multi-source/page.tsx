"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase, supabaseConfigured } from "../../lib/supabase";
import styles from "./multi-source.module.css";

type ExtractedDocument = {
  filename: string;
  media_type: string | null;
  characters: number;
  words: number;
  text: string;
};

type SourceInput = {
  id: number;
  name: string;
  text: string;
};

type ContributionPassage = {
  document_sentence: string;
  source_sentence: string;
  score: number;
  matched_words: number;
};

type Contribution = {
  source_name: string;
  matched_sentence_count: number;
  matched_word_count: number;
  document_coverage_percent: number;
  average_passage_score: number;
  passages: ContributionPassage[];
};

type ContributionReport = {
  contributions: Contribution[];
  document_words_original: number;
  document_words_analyzed: number;
  document_words_excluded: number;
  total_matched_words: number;
  matched_document_coverage_percent: number;
  exclusions_applied: string[];
  min_match_words: number;
  evidence_note: string;
  evidence_version: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function wordCount(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export default function MultiSourcePage() {
  const [user, setUser] = useState<User | null>(null);
  const [document, setDocument] = useState<ExtractedDocument | null>(null);
  const [sources, setSources] = useState<SourceInput[]>([
    { id: 1, name: "Source 1", text: "" },
    { id: 2, name: "Source 2", text: "" },
  ]);
  const [nextSourceId, setNextSourceId] = useState(3);
  const [excludeQuotes, setExcludeQuotes] = useState(false);
  const [excludeBibliography, setExcludeBibliography] = useState(false);
  const [minMatchWords, setMinMatchWords] = useState(3);
  const [report, setReport] = useState<ContributionReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const validSources = useMemo(
    () => sources.filter((source) => source.name.trim() && source.text.trim()),
    [sources],
  );

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUser(data.session?.user ?? null);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setDocument(null);
        setReport(null);
      }
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

  async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await accessToken();
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(`${API_URL}${path}`, { ...init, headers });
    const payload = (await response.json().catch(() => ({}))) as { detail?: string } & T;
    if (!response.ok) throw new Error(payload.detail ?? `Request failed (${response.status}).`);
    return payload as T;
  }

  function clearResult() {
    setReport(null);
    setError("");
    setNotice("");
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (supabaseConfigured && !user) {
      setError("Sign in from the main Averis workspace before uploading a submission.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Choose a TXT, PDF or DOCX file first.");
      return;
    }

    setBusy("upload");
    setError("");
    setNotice("");
    setReport(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const payload = await apiRequest<ExtractedDocument>("/api/v1/documents/extract", {
        method: "POST",
        body,
      });
      setDocument(payload);
      setNotice("Submission extracted in memory. Add your comparison sources below.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  function updateSource(id: number, patch: Partial<Pick<SourceInput, "name" | "text">>) {
    setSources((current) => current.map((source) => (source.id === id ? { ...source, ...patch } : source)));
    clearResult();
  }

  function addSource() {
    if (sources.length >= 5) return;
    setSources((current) => [...current, { id: nextSourceId, name: `Source ${current.length + 1}`, text: "" }]);
    setNextSourceId((value) => value + 1);
    clearResult();
  }

  function removeSource(id: number) {
    if (sources.length <= 1) return;
    setSources((current) => current.filter((source) => source.id !== id));
    clearResult();
  }

  async function analyze() {
    if (!document) {
      setError("Upload your submission first.");
      return;
    }
    if (validSources.length === 0) {
      setError("Add text to at least one named source.");
      return;
    }

    setBusy("analyze");
    setError("");
    setNotice("");
    try {
      const payload = await apiRequest<ContributionReport>("/api/v1/similarity/contributions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_text: document.text,
          sources: validSources.map((source) => ({
            source_name: source.name.trim(),
            source_text: source.text,
          })),
          exclude_quotes: excludeQuotes,
          exclude_bibliography: excludeBibliography,
          min_match_words: minMatchWords,
        }),
      });
      setReport(payload);
      setNotice("Source breakdown complete. No additional scan credit was used.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Multi-source analysis failed.");
    } finally {
      setBusy(null);
    }
  }

  if (supabaseConfigured && !user) {
    return (
      <main className={styles.page}>
        <section className={styles.lockedCard}>
          <span className={styles.brandMark}>A</span>
          <p className={styles.eyebrow}>AVERIS MULTI-SOURCE</p>
          <h1>Sign in to analyze multiple sources.</h1>
          <p>Your Averis account session protects source-analysis requests and free-tier rate limits.</p>
          <a href="/" className={styles.primaryLink}>Return to Averis and sign in</a>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>MULTI-SOURCE EVIDENCE</p>
          <h1>See which sources contribute to the matched document coverage.</h1>
          <p className={styles.lede}>Compare one submission with up to five sources. Each submission sentence can belong to only its strongest qualifying source match, so overlapping sources are not double-counted.</p>
        </div>
        <div className={styles.truthCard}>
          <span>SUPPORTING EVIDENCE</span>
          <strong>No extra scan credit</strong>
          <small>Coverage is not another plagiarism score.</small>
        </div>
      </section>

      {error && <div className={styles.error}><b>!</b>{error}</div>}
      {notice && <div className={styles.notice}><b>✓</b>{notice}</div>}

      <section className={styles.topGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <div><span>01</span><div><small>SUBMISSION</small><h2>Upload your draft</h2></div></div>
            <em>TXT · PDF · DOCX</em>
          </div>
          <form onSubmit={upload} className={styles.uploadForm}>
            <label className={styles.dropzone}>
              <input name="file" type="file" accept=".txt,.pdf,.docx" />
              <b>{document ? "Replace submission" : "Choose submission"}</b>
              <small>Maximum 15 MB · processed in memory</small>
            </label>
            <button type="submit" disabled={Boolean(busy)}>{busy === "upload" ? "Extracting…" : "Extract document"}</button>
          </form>
          {document && (
            <div className={styles.docReady}>
              <span>DOC</span>
              <div><strong>{document.filename}</strong><small>{document.words.toLocaleString()} words · {document.characters.toLocaleString()} characters</small></div>
              <b>READY</b>
            </div>
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <div><span>02</span><div><small>EVIDENCE CONTROLS</small><h2>Set the comparison boundary</h2></div></div>
            <em>TRANSPARENT</em>
          </div>
          <label className={styles.toggleRow}>
            <input type="checkbox" checked={excludeQuotes} onChange={(event) => { setExcludeQuotes(event.target.checked); clearResult(); }} />
            <span><b>Exclude quotations</b><small>Ignore explicit double-quoted spans.</small></span>
          </label>
          <label className={styles.toggleRow}>
            <input type="checkbox" checked={excludeBibliography} onChange={(event) => { setExcludeBibliography(event.target.checked); clearResult(); }} />
            <span><b>Exclude bibliography</b><small>Ignore text after a recognized standalone reference heading.</small></span>
          </label>
          <label className={styles.rangeRow}>
            <span><b>Minimum match size</b><strong>{minMatchWords} words</strong></span>
            <input type="range" min="3" max="50" value={minMatchWords} onChange={(event) => { setMinMatchWords(Number(event.target.value)); clearResult(); }} />
          </label>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.sourcesHeader}>
          <div className={styles.panelHead}>
            <div><span>03</span><div><small>COMPARISON SOURCES</small><h2>Add up to five source texts</h2></div></div>
          </div>
          <button className={styles.secondaryButton} type="button" onClick={addSource} disabled={sources.length >= 5 || Boolean(busy)}>+ Add source</button>
        </div>

        <div className={styles.sourceGrid}>
          {sources.map((source, index) => (
            <article className={styles.sourceEditor} key={source.id}>
              <div className={styles.sourceEditorHead}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <input value={source.name} maxLength={250} onChange={(event) => updateSource(source.id, { name: event.target.value })} aria-label={`Source ${index + 1} name`} />
                <button type="button" onClick={() => removeSource(source.id)} disabled={sources.length <= 1 || Boolean(busy)} aria-label={`Remove source ${index + 1}`}>×</button>
              </div>
              <textarea value={source.text} maxLength={40000} onChange={(event) => updateSource(source.id, { text: event.target.value })} placeholder="Paste the source text here…" />
              <small>{wordCount(source.text).toLocaleString()} words · {source.text.length.toLocaleString()} / 40,000 characters</small>
            </article>
          ))}
        </div>

        <div className={styles.analyzeRow}>
          <div><b>{validSources.length}</b><span>ready source{validSources.length === 1 ? "" : "s"}</span></div>
          <button type="button" onClick={analyze} disabled={Boolean(busy) || !document || validSources.length === 0}>{busy === "analyze" ? "Calculating coverage…" : "Analyze source contribution"}</button>
        </div>
      </section>

      <section className={styles.resultsSection}>
        <div className={styles.resultsTitle}>
          <div><p className={styles.eyebrow}>SOURCE BREAKDOWN</p><h2>Unique matched-document coverage</h2></div>
          {report && <span>{report.evidence_version}</span>}
        </div>

        {!report ? (
          <div className={styles.emptyState}><span>◎</span><h3>No contribution evidence yet</h3><p>Upload a submission, add source texts, and run the contribution analysis.</p></div>
        ) : (
          <>
            <div className={styles.summaryGrid}>
              <article><span>TOTAL UNIQUE COVERAGE</span><strong>{report.matched_document_coverage_percent}%</strong><small>{report.total_matched_words.toLocaleString()} matched document words</small></article>
              <article><span>ANALYZED WORDS</span><strong>{report.document_words_analyzed.toLocaleString()}</strong><small>of {report.document_words_original.toLocaleString()} original</small></article>
              <article><span>EXCLUDED WORDS</span><strong>{report.document_words_excluded.toLocaleString()}</strong><small>{report.exclusions_applied.length ? report.exclusions_applied.join(" + ") : "no matching exclusions"}</small></article>
              <article><span>MINIMUM MATCH</span><strong>{report.min_match_words}</strong><small>words per eligible passage</small></article>
            </div>

            <div className={styles.contributionList}>
              {report.contributions.map((item, index) => (
                <article className={styles.contributionCard} key={`${item.source_name}-${index}`}>
                  <div className={styles.contributionHead}>
                    <div><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{item.source_name}</h3><small>{item.matched_sentence_count} assigned sentence{item.matched_sentence_count === 1 ? "" : "s"} · {item.matched_word_count} words</small></div></div>
                    <strong>{item.document_coverage_percent}%</strong>
                  </div>
                  <div className={styles.coverageTrack}><span style={{ width: `${clampPercent(item.document_coverage_percent)}%` }} /></div>
                  <div className={styles.contributionFacts}><span>Average passage strength <b>{item.average_passage_score}%</b></span><span>Unique document coverage <b>{item.document_coverage_percent}%</b></span></div>
                  {item.passages.length > 0 && (
                    <details className={styles.passages}>
                      <summary>Review strongest passage evidence ({item.passages.length})</summary>
                      {item.passages.map((passage, passageIndex) => (
                        <div className={styles.passage} key={`${passage.document_sentence}-${passageIndex}`}>
                          <div><b>{Math.round(passage.score)}%</b><small>{passage.matched_words} document words</small></div>
                          <div><span>SUBMISSION</span><p>{passage.document_sentence}</p><span>SOURCE</span><p>{passage.source_sentence}</p></div>
                        </div>
                      ))}
                    </details>
                  )}
                </article>
              ))}
            </div>
            <p className={styles.scopeNote}>{report.evidence_note}</p>
          </>
        )}
      </section>
    </main>
  );
}
