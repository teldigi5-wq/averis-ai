"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type PassageMatch = {
  document_sentence: string;
  source_sentence: string;
  score: number;
};

type IntegrityReport = {
  source_name: string;
  similarity_percent: number;
  shingle_jaccard: number;
  sentence_match_score: number;
  matched_passages: PassageMatch[];
  evidence_note: string;
  scan_id: string | null;
  exclusions_applied: string[];
  min_match_words: number;
  document_words_original: number | null;
  document_words_analyzed: number | null;
  document_words_excluded: number | null;
};

type Props = {
  documentName: string;
  report: IntegrityReport;
};

function reportFileStem(name: string) {
  const withoutExtension = name.replace(/\.[^.]+$/, "");
  const normalized = withoutExtension
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return normalized || "submission";
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

export default function IntegrityReportExport({ documentName, report }: Props) {
  const [mounted, setMounted] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  function exportReport() {
    const generated = new Date();
    setGeneratedAt(generated.toISOString());

    const previousTitle = window.document.title;
    const exportTitle = `Averis-${reportFileStem(documentName)}-integrity-report`;
    const restoreTitle = () => {
      window.document.title = previousTitle;
      window.removeEventListener("afterprint", restoreTitle);
    };

    window.addEventListener("afterprint", restoreTitle);
    window.document.title = exportTitle;
    window.setTimeout(() => window.print(), 0);
    window.setTimeout(restoreTitle, 3000);
  }

  const printableReport = (
    <article className="printReport" aria-label="Averis integrity evidence report">
      <header className="printReportHeader">
        <div className="printBrand"><span>A</span><div><strong>Averis</strong><small>Academic Integrity Intelligence</small></div></div>
        <div className="printReportTitle"><p>INTEGRITY EVIDENCE REPORT</p><h1>Pre-submission similarity review</h1></div>
      </header>

      <section className="printMetaGrid">
        <div><span>DOCUMENT</span><strong>{documentName}</strong></div>
        <div><span>COMPARISON SOURCE</span><strong>{report.source_name}</strong></div>
        <div><span>GENERATED</span><strong>{generatedAt ? new Date(generatedAt).toLocaleString() : "Prepared on demand"}</strong></div>
        <div><span>SCAN REFERENCE</span><strong>{report.scan_id ?? "Local/development scan"}</strong></div>
      </section>

      <section className="printScoreGrid">
        <div className="printScorePrimary"><span>SIMILARITY</span><strong>{report.similarity_percent}%</strong><small>Primary evidence score</small></div>
        <div><span>EXACT OVERLAP</span><strong>{report.shingle_jaccard}%</strong><small>Word-shingle Jaccard</small></div>
        <div><span>PASSAGE STRENGTH</span><strong>{report.sentence_match_score}%</strong><small>Fuzzy sentence evidence</small></div>
        <div><span>MATCHED PASSAGES</span><strong>{report.matched_passages.length}</strong><small>Reviewable sentence matches</small></div>
      </section>

      <section className="printSection">
        <div className="printSectionHead"><span>01</span><div><small>ANALYSIS CONTROLS</small><h2>What was included in the comparison</h2></div></div>
        <div className="printControlGrid">
          <div><span>MINIMUM MATCH</span><strong>{report.min_match_words} words</strong></div>
          <div><span>ORIGINAL WORDS</span><strong>{report.document_words_original ?? "-"}</strong></div>
          <div><span>ANALYZED WORDS</span><strong>{report.document_words_analyzed ?? "-"}</strong></div>
          <div><span>EXCLUDED WORDS</span><strong>{report.document_words_excluded ?? "-"}</strong></div>
        </div>
        <div className="printExclusions">
          <b>Text exclusions actually applied:</b>
          {report.exclusions_applied.length === 0 ? (
            <span>None detected for the selected controls.</span>
          ) : (
            report.exclusions_applied.map((exclusion) => <span key={exclusion}>{label(exclusion)}</span>)
          )}
        </div>
      </section>

      <section className="printSection">
        <div className="printSectionHead"><span>02</span><div><small>PASSAGE EVIDENCE</small><h2>Matched submission and source sentences</h2></div></div>
        {report.matched_passages.length === 0 ? (
          <p className="printEmpty">No strong sentence-level matches were returned after the selected evidence controls.</p>
        ) : report.matched_passages.map((match, index) => (
          <article className="printMatch" key={`${match.document_sentence}-${index}`}>
            <div className="printMatchScore">{Math.round(match.score)}%</div>
            <div>
              <small>SUBMISSION</small>
              <p>{match.document_sentence}</p>
              <small>SOURCE</small>
              <p>{match.source_sentence}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="printSection printInterpretation">
        <div className="printSectionHead"><span>03</span><div><small>INTERPRETATION</small><h2>Evidence boundary</h2></div></div>
        <p>{report.evidence_note}</p>
        <p><strong>Important:</strong> This report is a review aid. A similarity percentage, passage match, excluded quotation, or bibliography match is not by itself proof of plagiarism or academic misconduct. Final interpretation requires human review and the rules of the relevant institution or assessment.</p>
      </section>

      <footer className="printFooter">
        <span>Averis - Check before you submit.</span>
        <span>This PDF is produced by the browser print engine from the current scan result; Averis does not need to store the exported PDF.</span>
      </footer>
    </article>
  );

  return (
    <>
      <button
        type="button"
        className="reportExportButton"
        onClick={exportReport}
        title="Open the browser print dialog, then choose Save as PDF"
      >
        Save PDF
      </button>
      {mounted ? createPortal(printableReport, window.document.body) : null}
    </>
  );
}
