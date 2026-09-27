"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import styles from "./evidence-navigation.module.css";

type Priority = "high_attention" | "attention" | "contextualized";
type PriorityFilter = "all" | Priority;

type MatrixItem = {
  key: string;
  priority: Priority;
  label: string;
  snippet: string;
};

type SectionTarget = {
  key: string;
  label: string;
  element: HTMLElement;
};

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function priorityFromText(text: string): Priority {
  if (text.includes("HIGH ATTENTION")) return "high_attention";
  if (text.includes("ATTENTION")) return "attention";
  return "contextualized";
}

function priorityLabel(priority: Priority) {
  if (priority === "high_attention") return "High attention";
  if (priority === "attention") return "Attention";
  return "Contextualized";
}

function findSection(headingText: string) {
  const heading = Array.from(document.querySelectorAll<HTMLElement>("h2")).find((node) =>
    node.textContent?.trim().includes(headingText),
  );
  return heading?.closest<HTMLElement>("section") ?? null;
}

function scrollToElement(target: HTMLElement | null, announcement: (message: string) => void) {
  if (!target) {
    announcement("That evidence section is not available in the current report.");
    return;
  }
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.focus({ preventScroll: true });
}

export default function EvidenceNavigator() {
  const [items, setItems] = useState<MatrixItem[]>([]);
  const [filter, setFilter] = useState<PriorityFilter>("all");
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const [checklist, setChecklist] = useState({ passages: false, references: false, policy: false });
  const [expanded, setExpanded] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const sectionsRef = useRef<SectionTarget[]>([]);
  const cardsRef = useRef(new Map<string, HTMLElement>());
  const signatureRef = useRef("");

  useEffect(() => {
    let scheduled = 0;

    const scan = () => {
      scheduled = 0;
      const matrix = findSection("Inspect the strongest context gaps first");
      if (!matrix) {
        cardsRef.current.clear();
        sectionsRef.current = [];
        if (items.length) setItems([]);
        return;
      }

      const cards = Array.from(matrix.querySelectorAll<HTMLElement>("article"));
      const nextItems: MatrixItem[] = [];
      const nextCards = new Map<string, HTMLElement>();

      cards.forEach((card, index) => {
        const text = card.textContent ?? "";
        const priority = priorityFromText(text);
        const paragraph = card.querySelector("p")?.textContent?.trim() ?? `Passage ${index + 1}`;
        const key = `${hashText(paragraph)}-${index}`;
        card.dataset.averisReviewKey = key;
        card.dataset.averisReviewPriority = priority;
        nextCards.set(key, card);
        nextItems.push({
          key,
          priority,
          label: `Passage ${String(index + 1).padStart(2, "0")}`,
          snippet: paragraph.length > 118 ? `${paragraph.slice(0, 118)}…` : paragraph,
        });
      });

      const sectionSpecs = [
        ["citation", "Citation", "Check attribution around matched passages"],
        ["quotation", "Quotation", "Separate direct-quote context from paraphrase review"],
        ["matrix", "Review matrix", "Inspect the strongest context gaps first"],
        ["references", "References", "Does the nearby citation map to an actual bibliography entry?"],
        ["plan", "Revision plan", "Fix the underlying academic-integrity risks"],
        ["semantic", "Semantic", "Meaning-level matches from the local embedding model"],
        ["lexical", "Lexical", "Review wording before you submit"],
      ] as const;
      sectionsRef.current = sectionSpecs.flatMap(([key, label, heading]) => {
        const element = findSection(heading);
        return element ? [{ key, label, element }] : [];
      });
      cardsRef.current = nextCards;

      const nextSignature = nextItems.map((item) => `${item.key}:${item.priority}`).join("|");
      if (nextSignature !== signatureRef.current) {
        signatureRef.current = nextSignature;
        setItems(nextItems);
        setFilter("all");
        setReviewed({});
        setChecklist({ passages: false, references: false, policy: false });
      }
    };

    const scheduleScan = () => {
      if (scheduled) cancelAnimationFrame(scheduled);
      scheduled = requestAnimationFrame(scan);
    };

    scheduleScan();
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (scheduled) cancelAnimationFrame(scheduled);
    };
  }, [items.length]);

  useEffect(() => {
    cardsRef.current.forEach((card, key) => {
      const priority = (card.dataset.averisReviewPriority ?? "contextualized") as Priority;
      card.hidden = filter !== "all" && priority !== filter;
      card.dataset.averisReviewed = reviewed[key] ? "true" : "false";
    });
  }, [filter, reviewed, items]);

  const counts = useMemo(() => ({
    all: items.length,
    high_attention: items.filter((item) => item.priority === "high_attention").length,
    attention: items.filter((item) => item.priority === "attention").length,
    contextualized: items.filter((item) => item.priority === "contextualized").length,
  }), [items]);

  const filteredItems = useMemo(
    () => items.filter((item) => filter === "all" || item.priority === filter),
    [items, filter],
  );

  const reviewedCount = items.filter((item) => reviewed[item.key]).length;
  const progress = items.length ? Math.round((reviewedCount / items.length) * 100) : 0;
  const checklistCount = Object.values(checklist).filter(Boolean).length;

  function jumpToItem(item: MatrixItem) {
    const card = cardsRef.current.get(item.key) ?? null;
    scrollToElement(card, setAnnouncement);
    setAnnouncement(`${item.label}: ${priorityLabel(item.priority)}.`);
  }

  function jumpToNextUnreviewed() {
    const next = filteredItems.find((item) => !reviewed[item.key]);
    if (!next) {
      setAnnouncement("No unreviewed passages remain in the current filter.");
      return;
    }
    jumpToItem(next);
  }

  function toggleReviewed(key: string) {
    setReviewed((current) => {
      const value = !current[key];
      setAnnouncement(value ? "Passage marked reviewed." : "Passage returned to the review queue.");
      return { ...current, [key]: value };
    });
  }

  function jumpToSection(key: string) {
    const section = sectionsRef.current.find((item) => item.key === key);
    scrollToElement(section?.element ?? null, setAnnouncement);
    if (section) setAnnouncement(`Moved to ${section.label} evidence.`);
  }

  if (!items.length) return null;

  return (
    <aside className={`${styles.navigator} ${expanded ? styles.expanded : styles.collapsed}`} aria-label="Evidence review navigator">
      <button type="button" className={styles.toggle} onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        <span>Evidence navigator</span>
        <strong>{reviewedCount}/{items.length}</strong>
        <b>{expanded ? "−" : "+"}</b>
      </button>

      {expanded && (
        <div className={styles.body}>
          <div className={styles.progressBlock}>
            <div><span>REVIEW PROGRESS</span><strong>{progress}%</strong></div>
            <div className={styles.progressTrack} aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>
            <small>Session-only checklist. Nothing here changes evidence scores.</small>
          </div>

          <div className={styles.sectionNav} aria-label="Jump to evidence section">
            {sectionsRef.current.map((section) => (
              <button type="button" key={section.key} onClick={() => jumpToSection(section.key)}>{section.label}</button>
            ))}
          </div>

          <div className={styles.filters} role="group" aria-label="Filter human review matrix by priority">
            {([
              ["all", "All"],
              ["high_attention", "High"],
              ["attention", "Attention"],
              ["contextualized", "Context"],
            ] as const).map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={filter === value ? styles.filterActive : styles.filterButton}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}<b>{counts[value]}</b>
              </button>
            ))}
          </div>

          <div className={styles.itemList}>
            {filteredItems.map((item) => (
              <div className={`${styles.item} ${reviewed[item.key] ? styles.itemReviewed : ""}`} key={item.key}>
                <button type="button" className={styles.itemJump} onClick={() => jumpToItem(item)}>
                  <span><b>{item.label}</b><em>{priorityLabel(item.priority)}</em></span>
                  <small>{item.snippet}</small>
                </button>
                <button
                  type="button"
                  className={styles.reviewToggle}
                  aria-label={reviewed[item.key] ? `Mark ${item.label} unreviewed` : `Mark ${item.label} reviewed`}
                  aria-pressed={Boolean(reviewed[item.key])}
                  onClick={() => toggleReviewed(item.key)}
                >
                  {reviewed[item.key] ? "✓" : "○"}
                </button>
              </div>
            ))}
          </div>

          <button type="button" className={styles.nextButton} onClick={jumpToNextUnreviewed}>Next unreviewed passage ↓</button>

          <details className={styles.checklist}>
            <summary>Reviewer checklist <b>{checklistCount}/3</b></summary>
            <label><input type="checkbox" checked={checklist.passages} onChange={(event) => setChecklist((current) => ({ ...current, passages: event.target.checked }))} /><span>Highest-attention passages inspected</span></label>
            <label><input type="checkbox" checked={checklist.references} onChange={(event) => setChecklist((current) => ({ ...current, references: event.target.checked }))} /><span>Citations and linked references checked</span></label>
            <label><input type="checkbox" checked={checklist.policy} onChange={(event) => setChecklist((current) => ({ ...current, policy: event.target.checked }))} /><span>Institution / assignment requirements confirmed</span></label>
          </details>

          <p className={styles.boundary}>Navigation and review state are presentation-only. High attention is not a misconduct verdict; contextualized is not automatic approval.</p>
          <span className={styles.srOnly} aria-live="polite">{announcement}</span>
        </div>
      )}
    </aside>
  );
}
