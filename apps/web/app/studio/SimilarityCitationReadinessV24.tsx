"use client";

import { useMemo, useState } from "react";

import styles from "./similarity-citation-readiness-v24.module.css";

const AUTHOR_YEAR = /\([^()]{0,90}\b(?:19|20)\d{2}[a-z]?[^()]{0,45}\)/i;
const NUMERIC_CITATION = /\[(?:\d{1,4}\s*(?:[-–,;]\s*\d{1,4}\s*)*)\]/;
const NUMBER = /(?<!\w)\d+(?:\.\d+)?%?(?!\w)/;
const QUOTE = /["“”‘’]/;

type SourceEvidence = {
  similarity_percent: number;
  exact_overlap_percent: number;
  fuzzy_passage_percent: number;
  matched_passage_count?: number;
  strongest_passage_score?: number | null;
  review_band: string;
};

type Props = {
  draft: string;
  source: string;
  sourceName: string;
  proposal: string | null;
  evidence: SourceEvidence | null;
  generationEligible: boolean;
  busy: boolean;
  onRequestAiRevision: () => void;
};

type PassageReview = {
  id: string;
  sentence: string;
  phrase: string;
  sharedWords: number;
  hasCitation: boolean;
  hasQuote: boolean;
  hasNumber: boolean;
  severity: "high" | "medium" | "context";
};

function compact(text: string) {
  return text.toLowerCase().replace(/[“”‘’]/g, "\"").replace(/[^a-z0-9.%]+/g, " ").replace(/\s+/g, " ").trim();
}

function splitSentences(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 18);
}

function longestSharedPhrase(sentence: string, source: string) {
  const sentenceWords = compact(sentence).split(" ").filter(Boolean);
  const sourceCompact = ` ${compact(source)} `;
  const max = Math.min(16, sentenceWords.length);
  for (let size = max; size >= 6; size -= 1) {
    for (let start = 0; start <= sentenceWords.length - size; start += 1) {
      const phrase = sentenceWords.slice(start, start + size).join(" ");
      if (sourceCompact.includes(` ${phrase} `)) return { phrase, sharedWords: size };
    }
  }
  return null;
}

function reviewPassages(text: string, source: string): PassageReview[] {
  if (!text.trim() || !source.trim()) return [];
  return splitSentences(text)
    .map((sentence, index) => {
      const shared = longestSharedPhrase(sentence, source);
      if (!shared) return null;
      const hasCitation = AUTHOR_YEAR.test(sentence) || NUMERIC_CITATION.test(sentence);
      const hasQuote = QUOTE.test(sentence);
      const severity: PassageReview["severity"] = shared.sharedWords >= 12 ? "high" : shared.sharedWords >= 8 ? "medium" : "context";
      return {
        id: `passage-${index + 1}`,
        sentence,
        phrase: shared.phrase,
        sharedWords: shared.sharedWords,
        hasCitation,
        hasQuote,
        hasNumber: NUMBER.test(sentence),
        severity,
      } satisfies PassageReview;
    })
    .filter((item): item is PassageReview => Boolean(item))
    .sort((left, right) => right.sharedWords - left.sharedWords)
    .slice(0, 6);
}

function reviewLabel(item: PassageReview) {
  if (item.severity === "high" && !item.hasCitation && !item.hasQuote) return "Citation or quotation review";
  if (item.severity === "high") return "Close wording review";
  if (item.severity === "medium" && !item.hasCitation) return "Attribution review";
  if (item.severity === "medium") return "Paraphrase review";
  return "Source context";
}

export default function SimilarityCitationReadinessV24({
  draft,
  source,
  sourceName,
  proposal,
  evidence,
  generationEligible,
  busy,
  onRequestAiRevision,
}: Props) {
  const [copied, setCopied] = useState(false);
  const draftReviews = useMemo(() => reviewPassages(draft, source), [draft, source]);
  const proposalReviews = useMemo(() => reviewPassages(proposal ?? "", source), [proposal, source]);
  const highRisk = draftReviews.filter((item) => item.severity === "high");
  const citationChecks = draftReviews.filter((item) => !item.hasCitation && item.sharedWords >= 8);
  const numericChecks = draftReviews.filter((item) => item.hasNumber && !item.hasCitation);
  const proposalHighRisk = proposalReviews.filter((item) => item.severity === "high");
  const readiness = highRisk.length === 0 && citationChecks.length === 0 ? "READY FOR HUMAN REVIEW" : "SOURCE REVIEW NEEDED";

  async function copyNotes() {
    const lines = [
      `Averis Similarity & Citation Readiness — ${sourceName || "Comparison source"}`,
      `Status: ${readiness}`,
      `Close-wording passages: ${highRisk.length}`,
      `Citation checks: ${citationChecks.length}`,
      `Numeric claim checks: ${numericChecks.length}`,
      "",
      ...draftReviews.map((item, index) => `${index + 1}. ${reviewLabel(item)} — shared phrase: “${item.phrase}”`),
      "",
      "This is source-review evidence, not a Turnitin or AI-detector score.",
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
    <section className={styles.panel} aria-labelledby="similarity-readiness-title">
      <div className={styles.head}>
        <div>
          <p>AI SIMILARITY & CITATION READINESS · V24</p>
          <h2 id="similarity-readiness-title">Find source-risky wording before submission.</h2>
          <span>Averis reviews the supplied source for close wording, missing attribution, quotation needs, and citation context. It does not predict, target, or bypass a Turnitin or AI-detector score.</span>
        </div>
        <div className={styles.status} data-state={readiness === "READY FOR HUMAN REVIEW" ? "good" : "review"}>
          <small>READINESS</small>
          <strong>{readiness}</strong>
        </div>
      </div>

      <div className={styles.metrics}>
        <article><span>CLOSE WORDING</span><strong>{highRisk.length}</strong><small>12+ contiguous source words</small></article>
        <article><span>CITATION CHECKS</span><strong>{citationChecks.length}</strong><small>close wording without nearby citation</small></article>
        <article><span>NUMERIC CLAIMS</span><strong>{numericChecks.length}</strong><small>matched sentences with uncited numbers</small></article>
        <article><span>SERVER EVIDENCE</span><strong>{evidence ? evidence.review_band.toUpperCase() : "—"}</strong><small>{evidence ? `${evidence.matched_passage_count ?? 0} matched passages` : "source evidence unavailable"}</small></article>
      </div>

      <div className={styles.boundary}>
        <b>What this AI action does</b>
        <span>It asks the selected Averis runtime to improve source-safe wording while preserving meaning, claims, quotations, citations, DOIs, and numbers. It never asks the model to make text “undetectable,” lower a detector score, or conceal authorship.</span>
        <button type="button" onClick={onRequestAiRevision} disabled={!generationEligible || busy || !source.trim()}>
          {busy ? "AI review in progress…" : "Ask AI for source-safe revision"}
        </button>
      </div>

      {draftReviews.length > 0 ? (
        <div className={styles.passages}>
          <div className={styles.passagesHead}>
            <div><span>PASSAGE REVIEW</span><strong>Inspect the wording that overlaps most closely with the supplied source.</strong></div>
            <button type="button" onClick={copyNotes}>{copied ? "Review notes copied" : "Copy review notes"}</button>
          </div>
          {draftReviews.map((item, index) => (
            <article key={item.id} className={styles.passage} data-severity={item.severity}>
              <div className={styles.index}>{String(index + 1).padStart(2, "0")}</div>
              <div className={styles.passageBody}>
                <div className={styles.passageMeta}>
                  <strong>{reviewLabel(item)}</strong>
                  <span>{item.sharedWords} shared source words</span>
                  <span>{item.hasCitation ? "Citation nearby" : "No citation detected nearby"}</span>
                  {item.hasQuote && <span>Quotation marks present</span>}
                </div>
                <p>{item.sentence}</p>
                <small>Closest exact phrase: “{item.phrase}”</small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.empty}><strong>No long exact source phrases found.</strong><span>Still verify citations, quotation rules, references, and your university’s submission requirements manually.</span></div>
      )}

      {proposal && (
        <div className={styles.comparison}>
          <div><span>AI PROPOSAL SOURCE CHECK</span><strong>{proposalHighRisk.length === 0 ? "No 12+ word exact source phrase found" : `${proposalHighRisk.length} close-wording passage${proposalHighRisk.length === 1 ? "" : "s"} still need review`}</strong></div>
          <p>This comparison is evidence for human review only. A lower overlap count is not treated as proof that a submission is acceptable.</p>
        </div>
      )}
    </section>
  );
}
