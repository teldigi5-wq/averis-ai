"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { supabase, supabaseConfigured } from "../../../lib/supabase";
import { useAveris2Account } from "../Averis2AccountProvider";
import shellStyles from "../averis2.module.css";
import styles from "./new-review.module.css";

type ExtractedDocument = {
  filename: string;
  media_type: string | null;
  characters: number;
  words: number;
  text: string;
};

type PassageMatch = {
  document_sentence: string;
  source_sentence: string;
  score: number;
};

type SimilarityReport = {
  source_name: string;
  similarity_percent: number;
  shingle_jaccard: number;
  sentence_match_score: number;
  matched_passages: PassageMatch[];
  evidence_note: string;
  scan_id: string | null;
  credits_remaining: number | null;
  exclusions_applied: string[];
  min_match_words: number;
  document_words_original: number | null;
  document_words_analyzed: number | null;
  document_words_excluded: number | null;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function percent(value: number) {
  return `${Math.round(value * 100) / 100}%`;
}

export default function NewReviewClient() {
  const { user, profile, loading: accountLoading, refresh } = useAveris2Account();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [document, setDocument] = useState<ExtractedDocument | null>(null);
  const [reference, setReference] = useState("");
  const [excludeQuotes, setExcludeQuotes] = useState(false);
  const [excludeBibliography, setExcludeBibliography] = useState(false);
  const [minMatchWords, setMinMatchWords] = useState(3);
  const [report, setReport] = useState<SimilarityReport | null>(null);
  const [busy, setBusy] = useState<"upload" | "compare" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const canScan = !supabaseConfigured || Boolean(user && (profile?.credits_remaining ?? 0) > 0);
  const matchedCount = report?.matched_passages.length ?? 0;
  const controlsSummary = useMemo(() => {
    const applied: string[] = [];
    if (excludeQuotes) applied.push("quoted spans excluded");
    if (excludeBibliography) applied.push("bibliography excluded");
    applied.push(`minimum ${minMatchWords} words`);
    return applied.join(" · ");
  }, [excludeBibliography, excludeQuotes, minMatchWords]);

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

  function resetResult() {
    setReport(null);
    setError("");
    setNotice("");
  }

  async function extractDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetResult();

    if (supabaseConfigured && !user) {
      setError("Sign in before uploading a submission.");
      return;
    }

    const file = fileInputRef.current?.files?.[0];
    if (!file || file.size === 0) {
      setSelectedFileName("");
      setError("Choose a TXT, PDF or DOCX file first.");
      return;
    }

    setBusy("upload");
    try {
      const data = new FormData();
      data.append("file", file);
      const payload = await apiRequest<ExtractedDocument>("/api/v1/documents/extract", { method: "POST", body: data });
      setDocument(payload);
      setNotice("Document extracted in memory. The original upload is not persisted by this beta flow.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  async function compare() {
    setError("");
    setNotice("");

    if (!document || !reference.trim()) {
      setError("Upload a document and paste reference text to compare.");
      return;
    }
    if (!canScan) {
      setError("No free scan credits remain on this account.");
      return;
    }

    setBusy("compare");
    try {
      const payload = await apiRequest<SimilarityReport>("/api/v1/similarity/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_text: document.text,
          source_text: reference,
          source_name: "Manual reference",
          document_name: document.filename,
          exclude_quotes: excludeQuotes,
          exclude_bibliography: excludeBibliography,
          min_match_words: minMatchWords,
        }),
      });
      setReport(payload);
      setNotice("Integrity review complete. Inspect the evidence below rather than treating the percentage as a verdict.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setBusy(null);
    }
  }

  if (accountLoading) {
    return <section className={shellStyles.placeholderCard}><h2>Loading account…</h2><p>Restoring the existing Averis session before enabling document review.</p></section>;
  }

  if (supabaseConfigured && !user) {
    return (
      <section className={shellStyles.placeholderCard}>
        <h2>Sign in before starting a review</h2>
        <p>Averis 2.0 reuses the existing certified authentication flow rather than creating a second login system.</p>
        <Link className={shellStyles.primaryButton} href="/">Sign in on Averis</Link>
      </section>
    );
  }

  return (
    <>
      <div className={shellStyles.previewNotice} role="note"><span className={shellStyles.statusDot}/>Same certified extraction and similarity API behavior · new presentation layer</div>

      <header className={shellStyles.pageHeader}>
        <div className={shellStyles.pageHeading}>
          <span className={shellStyles.eyebrow}>New review</span>
          <h1 className={shellStyles.pageTitle}>Review a document with transparent evidence</h1>
          <p className={shellStyles.pageDescription}>Upload your draft, choose bounded analysis controls, and inspect the exact passages supporting the similarity signal.</p>
        </div>
        <span className={styles.creditBadge}>{profile ? `${profile.credits_remaining} credits available` : "Local preview"}</span>
      </header>

      {error ? <div className={styles.errorBanner} role="alert">{error}</div> : null}
      {notice ? <div className={styles.noticeBanner} role="status">{notice}</div> : null}

      <section className={styles.inputGrid}>
        <form className={styles.panel} onSubmit={extractDocument}>
          <div className={styles.panelHeading}><div><span>01</span><div><small>Submission</small><h2>Upload your draft</h2></div></div><em>TXT · PDF · DOCX</em></div>

          <label className={styles.uploadZone}>
            <input
              ref={fileInputRef}
              type="file"
              name="file"
              accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => {
                setSelectedFileName(event.target.files?.[0]?.name ?? "");
                setDocument(null);
                resetResult();
              }}
            />
            <span className={styles.uploadIcon} aria-hidden="true">↑</span>
            <strong>{selectedFileName || "Drag & drop your file here, or click to browse"}</strong>
            <small>TXT, PDF, DOCX · maximum 15 MB · processed in memory</small>
          </label>

          {document ? <div className={styles.fileState}><div><strong>{document.filename}</strong><span>{document.words} words · {document.characters} characters</span></div><b>Ready</b></div> : null}

          <button className={styles.primaryAction} type="submit" disabled={busy !== null || !selectedFileName}>{busy === "upload" ? "Extracting…" : document ? "Replace extracted document" : "Extract document"}</button>
        </form>

        <section className={styles.panel}>
          <div className={styles.panelHeading}><div><span>02</span><div><small>Comparison source</small><h2>Paste source text</h2></div></div><em>Manual evidence</em></div>
          <textarea className={styles.referenceInput} value={reference} onChange={(event) => { setReference(event.target.value); resetResult(); }} placeholder="Paste the source text you want to compare with your submission…" rows={10}/>
          <div className={styles.inputMeta}><span>Exact/fuzzy evidence only</span><span>{reference.trim() ? `${reference.trim().split(/\s+/).length} source words` : "No source text yet"}</span></div>
          <button className={styles.primaryAction} type="button" disabled={busy !== null || !document || !reference.trim() || !canScan} onClick={() => void compare()}>{busy === "compare" ? "Analyzing…" : "Run integrity analysis · 1 credit"}</button>
        </section>
      </section>

      <section className={styles.controlsPanel}>
        <div className={styles.panelHeading}><div><span>03</span><div><small>Analysis controls</small><h2>Choose what counts as primary evidence</h2></div></div><em>Transparent filters</em></div>
        <div className={styles.controlGrid}>
          <label className={styles.controlCard}><input type="checkbox" checked={excludeQuotes} onChange={(event) => { setExcludeQuotes(event.target.checked); resetResult(); }}/><span><strong>Exclude quotations</strong><small>Ignore explicit straight or curly double-quoted spans.</small></span></label>
          <label className={styles.controlCard}><input type="checkbox" checked={excludeBibliography} onChange={(event) => { setExcludeBibliography(event.target.checked); resetResult(); }}/><span><strong>Exclude bibliography</strong><small>Ignore text after a recognized standalone reference heading.</small></span></label>
          <label className={styles.rangeCard}><span><strong>Minimum match size</strong><b>{minMatchWords} words</b></span><input type="range" min="3" max="12" value={minMatchWords} onChange={(event) => { setMinMatchWords(Number(event.target.value)); resetResult(); }}/><small>Require at least this many words for exact/passage evidence.</small></label>
        </div>
        <p className={styles.controlsNote}>{controlsSummary}. These controls filter comparison evidence; they do not decide whether misconduct occurred.</p>
      </section>

      {report ? (
        <section className={styles.resultsSection} aria-labelledby="review-result-title">
          <div className={styles.resultMetrics}>
            <article><span>Similarity</span><strong>{percent(report.similarity_percent)}</strong><small>Evidence-weighted comparison</small></article>
            <article><span>Word-shingle overlap</span><strong>{percent(report.shingle_jaccard)}</strong><small>Exact phrase structure</small></article>
            <article><span>Passage strength</span><strong>{percent(report.sentence_match_score)}</strong><small>Fuzzy sentence evidence</small></article>
            <article><span>Evidence matches</span><strong>{matchedCount}</strong><small>Reviewable passages</small></article>
          </div>

          <div className={styles.evidencePanel}>
            <div className={styles.evidenceHeader}><div><small>04 · Evidence view</small><h2 id="review-result-title">Matched passages</h2></div><span>{report.min_match_words}-word minimum</span></div>
            <p className={styles.evidenceNote}>{report.evidence_note}</p>
            {report.matched_passages.length ? report.matched_passages.map((match, index) => (
              <article className={styles.matchCard} key={`${match.document_sentence}-${index}`}>
                <strong>{percent(match.score)}</strong>
                <div><small>Submission</small><p>{match.document_sentence}</p><small>Source</small><p>{match.source_sentence}</p></div>
              </article>
            )) : <div className={styles.emptyEvidence}>No passage-level evidence met the current threshold.</div>}
          </div>
        </section>
      ) : null}
    </>
  );
}
