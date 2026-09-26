"use client";

import { FormEvent, useMemo, useState } from "react";

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
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function Home() {
  const [document, setDocument] = useState<ExtractedDocument | null>(null);
  const [reference, setReference] = useState("");
  const [report, setReport] = useState<SimilarityReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const scoreTone = useMemo(() => {
    if (!report) return "score score-neutral";
    if (report.similarity_percent >= 50) return "score score-high";
    if (report.similarity_percent >= 20) return "score score-medium";
    return "score score-low";
  }, [report]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setReport(null);
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Choose a TXT, PDF or DOCX file first.");
      return;
    }

    setBusy(true);
    try {
      const data = new FormData();
      data.append("file", file);
      const response = await fetch(`${API_URL}/api/v1/documents/extract`, {
        method: "POST",
        body: data,
      });
      if (!response.ok) throw new Error((await response.json()).detail ?? "Upload failed");
      setDocument(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function compare() {
    if (!document || !reference.trim()) {
      setError("Upload a document and paste reference text to compare.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/v1/similarity/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_text: document.text,
          source_text: reference,
          source_name: "Manual reference",
        }),
      });
      if (!response.ok) throw new Error("Similarity analysis failed");
      setReport(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <div className="brandMark">A</div>
        <div>
          <strong>Averis</strong>
          <span>Academic Integrity Intelligence</span>
        </div>
        <div className="status"><i /> Local-first engine</div>
      </header>

      <section className="hero">
        <p className="eyebrow">EVIDENCE OVER GUESSWORK</p>
        <h1>Understand similarity.<br /><span>Verify the evidence.</span></h1>
        <p className="lede">A free-first, open-source academic integrity platform for document similarity, source evidence, citations, authorship indicators and code analysis.</p>
      </section>

      <section className="workspace">
        <article className="panel uploadPanel">
          <div className="panelHead">
            <div><span className="step">01</span><h2>Upload submission</h2></div>
            <span className="chip">TXT · PDF · DOCX</span>
          </div>
          <form onSubmit={upload}>
            <label className="dropzone">
              <input name="file" type="file" accept=".txt,.pdf,.docx" />
              <span className="dropIcon">↑</span>
              <strong>Choose a student submission</strong>
              <small>Milestone 1 limit: 15 MB</small>
            </label>
            <button type="submit" disabled={busy}>{busy ? "Processing…" : "Extract document"}</button>
          </form>
          {document && (
            <div className="docCard">
              <div><span className="docIcon">DOC</span></div>
              <div><strong>{document.filename}</strong><span>{document.words.toLocaleString()} words · {document.characters.toLocaleString()} characters</span></div>
              <b>Ready</b>
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panelHead">
            <div><span className="step">02</span><h2>Reference source</h2></div>
            <span className="chip">DEMO CORPUS</span>
          </div>
          <textarea value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Paste source/reference text here. In later milestones this becomes automatic corpus + scholarly + web retrieval." />
          <button className="primary" onClick={compare} disabled={busy || !document}>{busy ? "Analyzing…" : "Run integrity analysis"}</button>
        </article>
      </section>

      {error && <div className="error">{error}</div>}

      <section className="results">
        <article className="panel scorePanel">
          <p>SIMILARITY</p>
          <div className={scoreTone}>{report ? `${report.similarity_percent}%` : "—"}</div>
          <small>{report ? "Evidence-weighted score" : "Awaiting analysis"}</small>
        </article>
        <article className="panel metric"><span>Word-shingle overlap</span><strong>{report ? `${report.shingle_jaccard}%` : "—"}</strong></article>
        <article className="panel metric"><span>Matched-passage strength</span><strong>{report ? `${report.sentence_match_score}%` : "—"}</strong></article>
        <article className="panel metric"><span>Evidence matches</span><strong>{report ? report.matched_passages.length : "—"}</strong></article>
      </section>

      {report && (
        <section className="panel evidence">
          <div className="panelHead"><div><span className="step">03</span><h2>Evidence</h2></div></div>
          <p className="note">{report.evidence_note}</p>
          {report.matched_passages.length === 0 ? <p className="empty">No strong sentence-level matches found.</p> : report.matched_passages.map((match, index) => (
            <div className="match" key={`${match.document_sentence}-${index}`}>
              <div className="matchScore">{Math.round(match.score)}%</div>
              <div><small>SUBMISSION</small><p>{match.document_sentence}</p><small>SOURCE</small><p>{match.source_sentence}</p></div>
            </div>
          ))}
        </section>
      )}

      <footer>Averis · Milestone 1 · Similarity is evidence for human review, not an automatic misconduct verdict.</footer>
    </main>
  );
}
