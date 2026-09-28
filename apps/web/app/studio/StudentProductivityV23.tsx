"use client";

import { useEffect, useMemo, useState } from "react";

import SimilarityCitationReadinessV24 from "./SimilarityCitationReadinessV24";
import SourceCitationWorkbenchV26 from "./SourceCitationWorkbenchV26";
import styles from "./student-productivity-v23.module.css";

const AUTHOR_YEAR = /\([^()]{0,90}\b(?:19|20)\d{2}[a-z]?[^()]{0,45}\)/gi;
const NUMERIC_CITATION = /\[(?:\d{1,4}\s*(?:[-–,;]\s*\d{1,4}\s*)*)\]/g;
const NUMBER = /(?<!\w)\d+(?:\.\d+)?%?(?!\w)/g;
const DOI = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi;

function wordCount(text: string) {
  const compact = text.trim();
  return compact ? compact.split(/\s+/).length : 0;
}

function uniqueMatches(text: string, pattern: RegExp) {
  return [...new Set((text.match(pattern) ?? []).map((item) => item.trim()))];
}

function protectedAudit(original: string, proposal: string) {
  const citationsBefore = [...uniqueMatches(original, AUTHOR_YEAR), ...uniqueMatches(original, NUMERIC_CITATION)];
  const citationsAfter = [...uniqueMatches(proposal, AUTHOR_YEAR), ...uniqueMatches(proposal, NUMERIC_CITATION)];
  const numbersBefore = uniqueMatches(original, NUMBER);
  const numbersAfter = uniqueMatches(proposal, NUMBER);
  const doisBefore = uniqueMatches(original, DOI);
  const doisAfter = uniqueMatches(proposal, DOI);

  return {
    citationCount: citationsBefore.length,
    numberCount: numbersBefore.length,
    doiCount: doisBefore.length,
    missingCitations: citationsBefore.filter((item) => !citationsAfter.includes(item)),
    missingNumbers: numbersBefore.filter((item) => !numbersAfter.includes(item)),
    missingDois: doisBefore.filter((item) => !doisAfter.some((candidate) => candidate.toLowerCase() === item.toLowerCase())),
  };
}

type StudentProductivityV23Props = {
  original: string;
  proposal: string;
  goalLabel: string;
  strength: "light" | "balanced";
  sourceProvided: boolean;
  serverPreservationSafe: boolean;
  recheckComplete: boolean;
  onAcceptSafe: () => void;
};

export default function StudentProductivityV23({
  original,
  proposal,
  goalLabel,
  strength,
  sourceProvided,
  serverPreservationSafe,
  recheckComplete,
  onAcceptSafe,
}: StudentProductivityV23Props) {
  const [copied, setCopied] = useState(false);
  const [wordTarget, setWordTarget] = useState(1500);
  const [sourceText, setSourceText] = useState("");
  const [sourceLabel, setSourceLabel] = useState("Comparison source");
  const audit = useMemo(() => protectedAudit(original, proposal), [original, proposal]);
  const originalWords = wordCount(original);
  const proposalWords = wordCount(proposal);
  const wordDelta = proposalWords - originalWords;
  const target = Math.max(1, wordTarget || 1);
  const targetProgress = Math.min(100, Math.max(0, Math.round((proposalWords / target) * 100)));
  const targetDelta = wordTarget - proposalWords;
  const locallySafe = audit.missingCitations.length === 0 && audit.missingNumbers.length === 0 && audit.missingDois.length === 0;
  const protectionSafe = serverPreservationSafe && locallySafe;

  useEffect(() => {
    if (!sourceProvided) {
      setSourceText("");
      return;
    }
    const sourceField = document.querySelector<HTMLTextAreaElement>('textarea[maxlength="40000"]');
    const sourceNameField = document.querySelector<HTMLInputElement>('input[aria-label="Comparison source name"]');
    setSourceText(sourceField?.value ?? "");
    setSourceLabel(sourceNameField?.value?.trim() || "Comparison source");
  }, [sourceProvided, proposal]);

  async function copyFullProposal() {
    try {
      await navigator.clipboard.writeText(proposal);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function startSourceSafeAiReview() {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
    const sourceSafeGoal = buttons.find((button) => button.textContent?.includes("Source-safe paraphrase"));
    if (!sourceSafeGoal) return;
    sourceSafeGoal.scrollIntoView({ behavior: "smooth", block: "center" });
    sourceSafeGoal.click();
  }

  return (
    <>
      <section className={styles.proposalCard} aria-label="Full generated revision proposal">
        <div className={styles.proposalHead}>
          <div>
            <p>FULL GENERATED PROPOSAL</p>
            <h2>Review the whole revision before choosing sentence-level changes.</h2>
            <span>Copying the proposal does not accept it. Your accepted draft still starts from the original until you explicitly choose changes.</span>
          </div>
          <button type="button" className={styles.copyButton} onClick={copyFullProposal}>
            {copied ? "Full proposal copied" : "Copy full proposal"}
          </button>
        </div>

        <div className={styles.proposalMeta}>
          <article><span>REVISION GOAL</span><strong>{goalLabel}</strong><small>{strength === "light" ? "Light edit" : "Balanced edit"}</small></article>
          <article><span>WORD CHANGE</span><strong>{wordDelta > 0 ? `+${wordDelta}` : wordDelta}</strong><small>{originalWords} → {proposalWords} words</small></article>
          <article><span>PROTECTED TOKENS</span><strong>{protectionSafe ? "PASS" : "REVIEW"}</strong><small>{audit.citationCount} citations · {audit.doiCount} DOI · {audit.numberCount} numbers</small></article>
          <article><span>SOURCE CONTEXT</span><strong>{sourceProvided ? "ADDED" : "OPTIONAL"}</strong><small>{sourceProvided ? "Available for evidence re-check" : "No comparison source supplied"}</small></article>
        </div>

        <pre className={styles.proposalText}>{proposal}</pre>

        <div className={styles.proposalActions}>
          <button type="button" onClick={copyFullProposal}>{copied ? "Copied" : "Copy proposal as plain text"}</button>
          <button type="button" onClick={onAcceptSafe}>Accept all preservation-safe changes into preview</button>
          <span>Sentence review remains available below. Unsafe citation, DOI, or numeric loss stays blocked.</span>
        </div>
      </section>

      <SimilarityCitationReadinessV24
        draft={original}
        source={sourceText}
        sourceName={sourceLabel}
        proposal={proposal}
        onStartAiReview={startSourceSafeAiReview}
      />

      <SourceCitationWorkbenchV26
        original={original}
        proposal={proposal}
        source={sourceText}
        sourceName={sourceLabel}
        onStartAiReview={startSourceSafeAiReview}
      />

      <section className={styles.toolkit} aria-label="Student submission toolkit">
        <div className={styles.toolkitHead}>
          <div>
            <p>STUDENT SUBMISSION TOOLKIT</p>
            <h2>Keep the revision aligned with your assignment requirements.</h2>
          </div>
          <label>
            <span>Assignment word target</span>
            <input
              type="number"
              min={100}
              max={50000}
              step={50}
              value={wordTarget}
              onChange={(event) => setWordTarget(Math.max(0, Number(event.target.value) || 0))}
            />
          </label>
        </div>

        <div className={styles.toolkitGrid}>
          <article>
            <span>WORD TARGET</span>
            <strong>{proposalWords.toLocaleString()} / {wordTarget.toLocaleString()}</strong>
            <div
              className={styles.progress}
              role="progressbar"
              aria-label="Assignment word target progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={targetProgress}
              aria-valuetext={`${proposalWords.toLocaleString()} of ${wordTarget.toLocaleString()} words, ${targetProgress}%`}
            >
              <i style={{ width: `${targetProgress}%` }} />
            </div>
            <small>{targetDelta >= 0 ? `${targetDelta.toLocaleString()} words remaining` : `${Math.abs(targetDelta).toLocaleString()} words over target`}</small>
          </article>
          <article>
            <span>ORIGINALITY WORKFLOW</span>
            <strong>Source-safe</strong>
            <small>Improve your own wording, attribution, and evidence rather than optimizing against a detector.</small>
          </article>
          <article>
            <span>EVIDENCE RE-CHECK</span>
            <strong>{recheckComplete ? "COMPLETE" : "PENDING"}</strong>
            <small>{recheckComplete ? "Accepted draft has been re-checked" : "Run after choosing the wording you want to keep"}</small>
          </article>
          <article>
            <span>SUBMISSION CONTROL</span>
            <strong>Human review</strong>
            <small>No proposal is automatically inserted into your assignment.</small>
          </article>
        </div>

        <div className={styles.checklist} aria-label="Quick submission checks">
          <span data-state={audit.missingCitations.length === 0 ? "good" : "warn"}>Citations {audit.missingCitations.length === 0 ? "preserved" : "need review"}</span>
          <span data-state={audit.missingDois.length === 0 ? "good" : "warn"}>DOIs {audit.missingDois.length === 0 ? "preserved" : "need review"}</span>
          <span data-state={audit.missingNumbers.length === 0 ? "good" : "warn"}>Numbers {audit.missingNumbers.length === 0 ? "preserved" : "need review"}</span>
          <span data-state={sourceProvided ? "good" : "neutral"}>{sourceProvided ? "Source context ready" : "Source context optional"}</span>
          <span data-state={recheckComplete ? "good" : "neutral"}>{recheckComplete ? "Post-edit evidence checked" : "Post-edit check pending"}</span>
        </div>
      </section>
    </>
  );
}
