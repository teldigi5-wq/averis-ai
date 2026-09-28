"use client";

import { useCallback, useEffect, useState } from "react";

import SubmissionReadinessCenterV31, {
  type AssignmentReadinessSignal,
  type CitationReadinessSignal,
  type DocumentQualityReadinessSignal,
  type PlannerReadinessSignal,
  type StudioReadinessSnapshot,
} from "./SubmissionReadinessCenterV31";

type LaneId = "draft" | "assignment" | "length" | "evidence" | "proposal" | "citations" | "document" | "plan" | "final" | "manual";

const EMPTY_STUDIO: StudioReadinessSnapshot = {
  draftWords: 0,
  wordTarget: null,
  sourceSupplied: false,
  preflightReady: false,
  preflightBlocked: false,
  proposalReady: false,
  finalRecheckReady: false,
};

const EMPTY_ASSIGNMENT: AssignmentReadinessSignal = { seen: false, progress: 0, wordTarget: null, citationStyle: null, deadlineDetected: false };
const EMPTY_PLANNER: PlannerReadinessSignal = { seen: false, progress: 0, risk: "Not checked", daysLeft: null, remainingWords: null };
const EMPTY_CITATION: CitationReadinessSignal = { seen: false, score: 0, unresolved: 0, uncited: 0, duplicates: 0, references: 0 };
const EMPTY_DOCUMENT: DocumentQualityReadinessSignal = { seen: false, score: 0, issues: 0, highAttention: 0, structureWarnings: 0, consistencyWarnings: 0 };

function compact(text: string | null | undefined) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function numberFrom(text: string | null | undefined) {
  const match = (text ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function wordCount(text: string) {
  const value = compact(text);
  return value ? value.split(" ").length : 0;
}

function readStudio(): StudioReadinessSnapshot {
  const draft = document.querySelector<HTMLTextAreaElement>('textarea[maxlength="12000"]')?.value ?? "";
  const source = document.querySelector<HTMLTextAreaElement>('textarea[maxlength="40000"]')?.value ?? "";
  const mainText = compact(document.querySelector<HTMLElement>(".studioV25Scope main")?.textContent);
  const toolkit = document.querySelector<HTMLElement>('section[aria-label="Student submission toolkit"]');
  const toolkitTarget = Number(toolkit?.querySelector<HTMLInputElement>('input[type="number"]')?.value ?? 0);
  const wordTarget = Number.isFinite(toolkitTarget) && toolkitTarget >= 100 ? toolkitTarget : null;

  return {
    draftWords: wordCount(draft),
    wordTarget,
    sourceSupplied: Boolean(source.trim()),
    preflightReady: mainText.includes("Evidence before generation"),
    preflightBlocked: mainText.includes("GENERATION BLOCKED"),
    proposalReady: mainText.includes("FULL GENERATED PROPOSAL"),
    finalRecheckReady: mainText.includes("POST-DECISION EVIDENCE") || mainText.includes("RE-CHECK COMPLETE"),
  };
}

function assignmentSignal(): AssignmentReadinessSignal | null {
  const drawer = document.querySelector<HTMLElement>(".assignmentV28Drawer");
  if (!drawer) return null;
  const progress = numberFrom(drawer.querySelector<HTMLElement>('[aria-label="Assignment checklist completion"]')?.getAttribute("aria-valuenow")) ?? 0;
  const cards = drawer.querySelectorAll<HTMLElement>(".assignmentV28Snapshot article");
  if (!cards.length) return null;
  const wordTarget = numberFrom(cards[0]?.querySelector("strong")?.textContent);
  const citationRaw = compact(cards[1]?.querySelector("strong")?.textContent);
  const deadlineRaw = compact(cards[2]?.querySelector("strong")?.textContent);
  return {
    seen: true,
    progress: Math.max(0, Math.min(100, progress)),
    wordTarget: wordTarget && wordTarget >= 100 ? wordTarget : null,
    citationStyle: citationRaw && !/not found/i.test(citationRaw) ? citationRaw : null,
    deadlineDetected: /detected/i.test(deadlineRaw),
  };
}

function plannerSignal(): PlannerReadinessSignal | null {
  const drawer = document.querySelector<HTMLElement>(".plannerV29Drawer");
  if (!drawer) return null;
  const progress = numberFrom(drawer.querySelector<HTMLElement>('[aria-label="Workload plan completion"]')?.getAttribute("aria-valuenow")) ?? 0;
  const cards = drawer.querySelectorAll<HTMLElement>(".plannerV29Snapshot article");
  if (!cards.length) return null;
  const daysLeft = numberFrom(cards[0]?.querySelector("strong")?.textContent);
  const remainingWords = numberFrom(cards[1]?.querySelector("strong")?.textContent);
  const risk = compact(cards[3]?.querySelector("strong")?.textContent) || "Not checked";
  return { seen: true, progress: Math.max(0, Math.min(100, progress)), risk, daysLeft, remainingWords };
}

function citationSignal(): CitationReadinessSignal | null {
  const drawer = document.querySelector<HTMLElement>(".citationV30Drawer");
  if (!drawer) return null;
  const scoreCards = drawer.querySelectorAll<HTMLElement>(".citationV30Score article");
  if (!scoreCards.length) return null;
  const issueCards = drawer.querySelectorAll<HTMLElement>(".citationV30IssueGrid article");
  const score = numberFrom(scoreCards[0]?.querySelector("strong")?.textContent) ?? 0;
  const references = numberFrom(scoreCards[2]?.querySelector("strong")?.textContent) ?? 0;
  const unresolved = numberFrom(issueCards[0]?.querySelector("strong")?.textContent) ?? 0;
  const uncited = numberFrom(issueCards[1]?.querySelector("strong")?.textContent) ?? 0;
  const duplicates = numberFrom(issueCards[2]?.querySelector("strong")?.textContent) ?? 0;
  return { seen: true, score, unresolved, uncited, duplicates, references };
}

function clickButtonContaining(label: string) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((item) => compact(item.textContent).includes(label));
  if (button && !button.disabled) {
    button.click();
    return true;
  }
  return false;
}

function sectionForText(label: string) {
  const node = Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3,p,span,strong,b")).find((item) => compact(item.textContent).includes(label));
  return node?.closest<HTMLElement>("section,form,article") ?? node?.parentElement ?? null;
}

export default function StudioReadinessLauncherV31() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [studio, setStudio] = useState<StudioReadinessSnapshot>(EMPTY_STUDIO);
  const [assignment, setAssignment] = useState<AssignmentReadinessSignal>(EMPTY_ASSIGNMENT);
  const [planner, setPlanner] = useState<PlannerReadinessSignal>(EMPTY_PLANNER);
  const [citation, setCitation] = useState<CitationReadinessSignal>(EMPTY_CITATION);
  const [documentQuality, setDocumentQuality] = useState<DocumentQualityReadinessSignal>(EMPTY_DOCUMENT);

  const refresh = useCallback(() => {
    const main = document.querySelector<HTMLElement>(".studioV25Scope main");
    const signedOut = compact(main?.textContent).includes("Sign in to review and accept revision proposals");
    setVisible(Boolean(main && !signedOut));
    setStudio(readStudio());
    const nextAssignment = assignmentSignal();
    if (nextAssignment) setAssignment(nextAssignment);
    const nextPlanner = plannerSignal();
    if (nextPlanner) setPlanner(nextPlanner);
    const nextCitation = citationSignal();
    if (nextCitation) setCitation(nextCitation);
  }, []);

  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(refresh);
    };
    const onDocumentQuality = (event: Event) => {
      const custom = event as CustomEvent<DocumentQualityReadinessSignal>;
      if (custom.detail?.seen) setDocumentQuality(custom.detail);
      schedule();
    };

    refresh();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["aria-valuenow", "data-risk"] });
    document.addEventListener("input", schedule, true);
    document.addEventListener("change", schedule, true);
    window.addEventListener("averis:assignment-word-target", schedule as EventListener);
    window.addEventListener("averis:document-quality", onDocumentQuality as EventListener);
    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("input", schedule, true);
      document.removeEventListener("change", schedule, true);
      window.removeEventListener("averis:assignment-word-target", schedule as EventListener);
      window.removeEventListener("averis:document-quality", onDocumentQuality as EventListener);
    };
  }, [refresh]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleAction = (lane: LaneId) => {
    setOpen(false);
    window.setTimeout(() => {
      if (lane === "assignment" || lane === "length") {
        clickButtonContaining("Assignment brief");
        return;
      }
      if (lane === "citations") {
        clickButtonContaining("References");
        return;
      }
      if (lane === "document") {
        clickButtonContaining("Document quality");
        return;
      }
      if (lane === "plan") {
        clickButtonContaining("Workload planner");
        return;
      }
      if (lane === "evidence") {
        if (!clickButtonContaining("Run evidence gate")) sectionForText("Evidence before generation")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (lane === "proposal") {
        if (!clickButtonContaining("Generate revision proposal")) sectionForText("FULL GENERATED PROPOSAL")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (lane === "final") {
        if (!clickButtonContaining("Re-check accepted draft")) sectionForText("POST-DECISION EVIDENCE")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 80);
  };

  if (!visible) return null;

  return (
    <>
      <button type="button" className="studioV31ReadinessLauncher" onClick={() => setOpen(true)}>
        <span aria-hidden="true">✓</span>
        <div><strong>Submission readiness</strong><small>Final dashboard · Alt + Shift + S</small></div>
      </button>
      <SubmissionReadinessCenterV31
        open={open}
        onClose={() => setOpen(false)}
        onAction={handleAction}
        studio={studio}
        assignment={assignment}
        planner={planner}
        citation={citation}
        document={documentQuality}
      />
    </>
  );
}
