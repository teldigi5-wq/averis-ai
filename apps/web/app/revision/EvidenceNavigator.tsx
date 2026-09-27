"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "./evidence-navigation.module.css";

type Priority = "high_attention" | "attention" | "contextualized" | string;
type PriorityFilter = "all" | "high_attention" | "attention" | "contextualized";

export type PassageReviewItem = {
  document_sentence: string;
  match_score: number;
  priority: Priority;
  reasons: string[];
  quote_detected: boolean;
  citation_detected: boolean;
  citation_marker: string | null;
  reference_link_status: string;
  verified_reference_count: number;
  metadata_review_reference_count: number;
};

export type PassageReviewMatrix = {
  passages_reviewed: number;
  high_attention_count: number;
  attention_count: number;
  contextualized_count: number;
  items: PassageReviewItem[];
  scope_note: string;
};

type PassageMatch = {
  document_sentence: string;
  source_sentence: string;
  score: number;
};

type EvidenceNavigatorProps = {
  matrix: PassageReviewMatrix;
  matchedPassages: PassageMatch[];
};

export function evidenceKey(sentence: string) {
  let hash = 2166136261;
  for (let index = 0; index < sentence.length; index += 1) {
    hash ^= sentence.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function priorityLabel(priority: string) {
  if (priority === "high_attention") return "HIGH ATTENTION";
  if (priority === "attention") return "ATTENTION";
  return "CONTEXTUALIZED";
}

function reasonLabel(reason: string) {
  const labels: Record<string, string> = {
    quoted_without_citation_marker: "Quoted wording has no nearby citation marker",
    high_overlap_unquoted: "High-overlap wording is not inside a recognized quotation",
    citation_marker_missing: "Nearby citation marker was not detected",
    citation_not_linked_to_bibliography: "Citation does not map to the supplied bibliography",
    citation_link_ambiguous: "Citation maps ambiguously to the supplied bibliography",
    reference_metadata_review: "Linked DOI metadata needs author/year review",
    reference_verification_unavailable: "External reference verification should be retried",
  };
  return labels[reason] ?? reason.replaceAll("_", " ");
}

function scrollToId(id: string) {
  const target = document.getElementById(id);
  if (!target) return false;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.focus({ preventScroll: true });
  return true;
}

export default function EvidenceNavigator({ matrix, matchedPassages }: EvidenceNavigatorProps) {
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const [checklist, setChecklist] = useState({ passages: false, references: false, policy: false });
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    setPriorityFilter("all");
    setReasonFilter("all");
    setReviewed({});
    setChecklist({ passages: false, references: false, policy: false });
    setAnnouncement("");
  }, [matrix]);

  const reasons = useMemo(
    () => Array.from(new Set(matrix.items.flatMap((item) => item.reasons))).sort(),
    [matrix.items],
  );

  const sourceBySentence = useMemo(() => {
    const entries = matchedPassages.map((match) => [match.document_sentence, match] as const);
    return new Map(entries);
  }, [matchedPassages]);

  const visibleItems = useMemo(
    () => matrix.items.filter((item) => {
      const priorityMatches = priorityFilter === "all" || item.priority === priorityFilter;
      const reasonMatches = reasonFilter === "all" || item.reasons.includes(reasonFilter);
      return priorityMatches && reasonMatches;
    }),
    [matrix.items, priorityFilter, reasonFilter],
  );

  const reviewedCount = matrix.items.reduce(
    (count, item) => count + (reviewed[evidenceKey(item.document_sentence)] ? 1 : 0),
    0,
  );
  const progress = matrix.passages_reviewed > 0 ? Math.round((reviewedCount / matrix.passages_reviewed) * 100) : 0;

  function toggleReviewed(item: PassageReviewItem) {
    const key = evidenceKey(item.document_sentence);
    setReviewed((current) => {
      const next = !current[key];
      setAnnouncement(next ? "Passage marked reviewed." : "Passage returned to the review queue.");
      return { ...current, [key]: next };
    });
  }

  function jumpToNext() {
    const next = visibleItems.find((item) => !reviewed[evidenceKey(item.document_sentence)]);
    if (!next) {
      setAnnouncement("No unreviewed passages remain in the current filter.");
      return;
    }
    const key = evidenceKey(next.document_sentence);
    if (scrollToId(`review-${key}`)) setAnnouncement("Moved to the next unreviewed passage.");
  }

  function openMatch(item: PassageReviewItem) {
    const key = evidenceKey(item.document_sentence);
    if (!scrollToId(`evidence-${key}`)) {
      setAnnouncement("The separate lexical match card is not available for this passage.");
    } else {
      setAnnouncement("Moved to the lexical source-match evidence.");
    }
  }

  const checklistComplete = Object.values(checklist).filter(Boolean).length;

  return (
    <section className={styles.navigator} aria-labelledby="evidence-navigator-title">
      <div className={styles.header}>
        <div>
          <p>EVIDENCE NAVIGATION · REVIEW WORKSPACE</p>
          <h2 id="evidence-navigator-title">Work through the highest-priority evidence first</h2>
          <span>Filters and checklist state are local to this browser session and do not change Averis scores.</span>
        </div>
        <div className={styles.progressCard} aria-live="polite">
          <small>REVIEW PROGRESS</small>
          <strong>{reviewedCount}/{matrix.passages_reviewed}</strong>
          <span>{progress}% inspected</span>
          <div className={styles.progressTrack} aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters} role="group" aria-label="Filter passages by review priority">
          {([
            ["all", "All", matrix.passages_reviewed],
            ["high_attention", "High attention", matrix.high_attention_count],
            ["attention", "Attention", matrix.attention_count],
            ["contextualized", "Contextualized", matrix.contextualized_count],
          ] as const).map(([value, label, count]) => (
            <button
              type="button"
              key={value}
              className={priorityFilter === value ? styles.filterActive : styles.filterButton}
              aria-pressed={priorityFilter === value}
              onClick={() => setPriorityFilter(value)}
            >
              {label}<b>{count}</b>
            </button>
          ))}
        </div>
        <label className={styles.reasonFilter}>
          <span>Reason</span>
          <select value={reasonFilter} onChange={(event) => setReasonFilter(event.target.value)}>
            <option value="all">All review reasons</option>
            {reasons.map((reason) => <option value={reason} key={reason}>{reasonLabel(reason)}</option>)}
          </select>
        </label>
        <button type="button" className={styles.nextButton} onClick={jumpToNext}>Next unreviewed ↓</button>
      </div>

      <div className={styles.summaryRow}>
        <span>{visibleItems.length} passage{visibleItems.length === 1 ? "" : "s"} in current view</span>
        {(priorityFilter !== "all" || reasonFilter !== "all") && (
          <button type="button" onClick={() => { setPriorityFilter("all"); setReasonFilter("all"); }}>Clear filters</button>
        )}
      </div>

      <div className={styles.cards}>
        {visibleItems.length === 0 ? (
          <div className={styles.empty}>No passages match the current filters.</div>
        ) : visibleItems.map((item, index) => {
          const key = evidenceKey(item.document_sentence);
          const isReviewed = Boolean(reviewed[key]);
          const sourceMatch = sourceBySentence.get(item.document_sentence);
          return (
            <article
              key={`${key}-${index}`}
              id={`review-${key}`}
              tabIndex={-1}
              className={`${styles.reviewCard} ${styles[item.priority as "high_attention" | "attention" | "contextualized"] ?? ""} ${isReviewed ? styles.reviewed : ""}`}
            >
              <div className={styles.cardTop}>
                <div>
                  <small>PASSAGE {String(matrix.items.indexOf(item) + 1).padStart(2, "0")}</small>
                  <strong>{priorityLabel(item.priority)}</strong>
                </div>
                <span>{Math.round(item.match_score)}% match</span>
              </div>

              <p className={styles.draftText}>{item.document_sentence}</p>

              <div className={styles.contextRow}>
                <span>{item.quote_detected ? "✓ quotation detected" : "○ quotation not detected"}</span>
                <span>{item.citation_detected ? "✓ citation marker detected" : "○ citation marker missing"}</span>
                <span>reference: {item.reference_link_status.replaceAll("_", " ")}</span>
              </div>

              {item.reasons.length > 0 ? (
                <ul className={styles.reasons}>{item.reasons.map((reason) => <li key={reason}>{reasonLabel(reason)}</li>)}</ul>
              ) : (
                <p className={styles.noReason}>No deterministic priority reason is active. Human review still decides whether the passage is appropriately used.</p>
              )}

              {sourceMatch && (
                <details className={styles.sourcePreview}>
                  <summary>Preview matched source wording</summary>
                  <p>{sourceMatch.source_sentence}</p>
                </details>
              )}

              <div className={styles.cardActions}>
                <button type="button" onClick={() => toggleReviewed(item)} aria-pressed={isReviewed}>
                  {isReviewed ? "✓ Reviewed" : "Mark reviewed"}
                </button>
                <button type="button" onClick={() => openMatch(item)}>Open match evidence ↘</button>
              </div>
            </article>
          );
        })}
      </div>

      <div className={styles.checklist}>
        <div>
          <p>REVIEWER CHECKLIST</p>
          <h3>Finish the evidence review before submission</h3>
          <span>{checklistComplete}/3 confirmations complete · session only</span>
        </div>
        <label><input type="checkbox" checked={checklist.passages} onChange={(event) => setChecklist((current) => ({ ...current, passages: event.target.checked }))} /><span>Highest-attention passages inspected</span></label>
        <label><input type="checkbox" checked={checklist.references} onChange={(event) => setChecklist((current) => ({ ...current, references: event.target.checked }))} /><span>Citations and linked references checked</span></label>
        <label><input type="checkbox" checked={checklist.policy} onChange={(event) => setChecklist((current) => ({ ...current, policy: event.target.checked }))} /><span>Institution / assignment requirements confirmed</span></label>
      </div>

      <p className={styles.scope}>{matrix.scope_note}</p>
      <span className={styles.srOnly} aria-live="polite">{announcement}</span>
    </section>
  );
}
