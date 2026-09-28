"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type PhaseId = "draft" | "evidence" | "proposal" | "sources" | "decisions" | "final";
type PhaseState = "done" | "active" | "pending" | "hold";

type Snapshot = {
  visible: boolean;
  draftChars: number;
  draftWords: number;
  sourceReady: boolean;
  preflightReady: boolean;
  preflightBlocked: boolean;
  proposalReady: boolean;
  sourceWorkbenchReady: boolean;
  sourceWorkbenchComplete: boolean;
  decisionsReady: boolean;
  finalRecheckReady: boolean;
  activePhase: PhaseId;
};

type Phase = {
  id: PhaseId;
  number: string;
  label: string;
  short: string;
};

const PHASES: Phase[] = [
  { id: "draft", number: "01", label: "Draft", short: "Write" },
  { id: "evidence", number: "02", label: "Evidence", short: "Check" },
  { id: "proposal", number: "03", label: "Proposal", short: "Revise" },
  { id: "sources", number: "04", label: "Sources", short: "Link" },
  { id: "decisions", number: "05", label: "Decisions", short: "Choose" },
  { id: "final", number: "06", label: "Final", short: "Verify" },
];

const EMPTY: Snapshot = {
  visible: false,
  draftChars: 0,
  draftWords: 0,
  sourceReady: false,
  preflightReady: false,
  preflightBlocked: false,
  proposalReady: false,
  sourceWorkbenchReady: false,
  sourceWorkbenchComplete: false,
  decisionsReady: false,
  finalRecheckReady: false,
  activePhase: "draft",
};

function compact(text: string | null | undefined) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function wordCount(text: string) {
  const value = compact(text);
  return value ? value.split(" ").length : 0;
}

function textNodeIncludes(needle: string) {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3,p,span,strong,small,b"));
  return candidates.find((element) => compact(element.textContent).includes(needle)) ?? null;
}

function sectionFor(needle: string) {
  const node = textNodeIncludes(needle);
  return node?.closest<HTMLElement>("section,form,article") ?? node?.parentElement ?? null;
}

function phaseElement(id: PhaseId) {
  if (id === "draft") {
    return document.querySelector<HTMLTextAreaElement>('textarea[maxlength="12000"]')?.closest<HTMLElement>("section,form") ?? null;
  }
  if (id === "evidence") return sectionFor("Evidence before generation");
  if (id === "proposal") return sectionFor("FULL GENERATED PROPOSAL");
  if (id === "sources") return sectionFor("SOURCE & CITATION AI WORKBENCH");
  if (id === "decisions") return sectionFor("SENTENCE REVIEW");
  return sectionFor("POST-DECISION EVIDENCE") ?? sectionFor("ACCEPTED DRAFT PREVIEW");
}

function buttonByText(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) => compact(button.textContent).includes(label)) ?? null;
}

function inferActivePhase(): PhaseId {
  const available = PHASES
    .map((phase) => ({ id: phase.id, element: phaseElement(phase.id) }))
    .filter((item): item is { id: PhaseId; element: HTMLElement } => Boolean(item.element));

  if (!available.length) return "draft";

  let selected = available[0].id;
  let bestTop = Number.NEGATIVE_INFINITY;
  for (const item of available) {
    const top = item.element.getBoundingClientRect().top;
    if (top <= 220 && top > bestTop) {
      selected = item.id;
      bestTop = top;
    }
  }
  return selected;
}

function readSnapshot(): Snapshot {
  const main = document.querySelector<HTMLElement>(".studioV25Scope main");
  if (!main || compact(main.textContent).includes("Sign in to review and accept revision proposals")) return EMPTY;

  const draftField = document.querySelector<HTMLTextAreaElement>('textarea[maxlength="12000"]');
  const sourceField = document.querySelector<HTMLTextAreaElement>('textarea[maxlength="40000"]');
  const text = compact(main.textContent);
  const draft = draftField?.value ?? "";

  return {
    visible: true,
    draftChars: draft.trim().length,
    draftWords: wordCount(draft),
    sourceReady: Boolean(sourceField?.value.trim()),
    preflightReady: text.includes("Evidence before generation"),
    preflightBlocked: text.includes("GENERATION BLOCKED"),
    proposalReady: text.includes("FULL GENERATED PROPOSAL"),
    sourceWorkbenchReady: text.includes("SOURCE & CITATION AI WORKBENCH"),
    sourceWorkbenchComplete: text.includes("PASSAGE EVIDENCE") || text.includes("No passage-level attention rows returned"),
    decisionsReady: text.includes("SENTENCE REVIEW"),
    finalRecheckReady: text.includes("POST-DECISION EVIDENCE") || text.includes("RE-CHECK COMPLETE"),
    activePhase: inferActivePhase(),
  };
}

function phaseState(phase: PhaseId, snapshot: Snapshot): PhaseState {
  if (phase === "draft") return snapshot.draftChars >= 50 ? "done" : snapshot.activePhase === phase ? "active" : "pending";
  if (phase === "evidence") {
    if (snapshot.preflightBlocked) return "hold";
    if (snapshot.preflightReady) return "done";
  }
  if (phase === "proposal" && snapshot.proposalReady) return "done";
  if (phase === "sources") {
    if (snapshot.sourceWorkbenchComplete) return "done";
    if (snapshot.sourceWorkbenchReady && snapshot.sourceReady) return snapshot.activePhase === phase ? "active" : "pending";
  }
  if (phase === "decisions" && snapshot.decisionsReady) return snapshot.finalRecheckReady ? "done" : snapshot.activePhase === phase ? "active" : "pending";
  if (phase === "final" && snapshot.finalRecheckReady) return "done";
  return snapshot.activePhase === phase ? "active" : "pending";
}

export default function StudioCommandCenterV27() {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [focusMode, setFocusMode] = useState(false);

  const refresh = useCallback(() => {
    setSnapshot(readSnapshot());
  }, []);

  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(refresh);
    };

    refresh();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener("input", schedule, true);
    document.addEventListener("change", schedule, true);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("input", schedule, true);
      document.removeEventListener("change", schedule, true);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [refresh]);

  useEffect(() => {
    const scope = document.querySelector<HTMLElement>(".studioV25Scope");
    if (!scope) return;
    if (focusMode) scope.dataset.v27Focus = "true";
    else delete scope.dataset.v27Focus;
    return () => { delete scope.dataset.v27Focus; };
  }, [focusMode]);

  const scrollToPhase = useCallback((id: PhaseId) => {
    const target = phaseElement(id);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(refresh, 450);
  }, [refresh]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey) return;
      const index = Number(event.key) - 1;
      if (index >= 0 && index < PHASES.length) {
        event.preventDefault();
        scrollToPhase(PHASES[index].id);
      }
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        setFocusMode((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [scrollToPhase]);

  const completed = useMemo(() => {
    let count = 0;
    if (snapshot.draftChars >= 50) count += 1;
    if (snapshot.preflightReady && !snapshot.preflightBlocked) count += 1;
    if (snapshot.proposalReady) count += 1;
    if (snapshot.sourceWorkbenchComplete || (!snapshot.sourceReady && snapshot.proposalReady)) count += 1;
    if (snapshot.decisionsReady) count += 1;
    if (snapshot.finalRecheckReady) count += 1;
    return count;
  }, [snapshot]);

  const progress = Math.round((completed / PHASES.length) * 100);

  const quickAction = useMemo(() => {
    if (snapshot.draftChars < 50) return { label: "Continue draft", phase: "draft" as PhaseId, button: null as string | null };
    if (!snapshot.preflightReady) return { label: "Run evidence gate", phase: "evidence" as PhaseId, button: "Run evidence gate" };
    if (snapshot.preflightBlocked) return { label: "Review evidence hold", phase: "evidence" as PhaseId, button: null };
    if (!snapshot.proposalReady) return { label: "Generate proposal", phase: "proposal" as PhaseId, button: "Generate revision proposal" };
    if (snapshot.sourceReady && snapshot.sourceWorkbenchReady && !snapshot.sourceWorkbenchComplete) return { label: "Review sources", phase: "sources" as PhaseId, button: null };
    if (!snapshot.finalRecheckReady) return { label: "Review decisions", phase: "decisions" as PhaseId, button: null };
    return { label: "Copy final draft", phase: "final" as PhaseId, button: "Copy accepted draft" };
  }, [snapshot]);

  const runQuickAction = () => {
    if (quickAction.button) {
      const button = buttonByText(quickAction.button);
      if (button && !button.disabled) {
        button.click();
        window.setTimeout(refresh, 350);
        return;
      }
    }
    scrollToPhase(quickAction.phase);
  };

  if (!snapshot.visible) return null;

  return (
    <nav className="studioV27Command" aria-label="Revision Studio command center">
      <div className="studioV27Command__top">
        <div className="studioV27Command__identity">
          <span className="studioV27Command__pulse" aria-hidden="true" />
          <div>
            <small>AVERIS STUDIO · V27</small>
            <strong>Command Center</strong>
          </div>
        </div>

        <div className="studioV27Command__meter" aria-label={`Revision workflow ${progress}% complete`}>
          <div className="studioV27Command__meterCopy">
            <span>WORKFLOW</span>
            <b>{progress}%</b>
          </div>
          <div className="studioV27Command__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <i style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="studioV27Command__telemetry">
          <span><small>DRAFT</small><b>{snapshot.draftWords} words</b></span>
          <span><small>SOURCE</small><b>{snapshot.sourceReady ? "Added" : "Optional"}</b></span>
          <span><small>STATUS</small><b>{snapshot.finalRecheckReady ? "Verified" : snapshot.preflightBlocked ? "Hold" : "In progress"}</b></span>
        </div>

        <div className="studioV27Command__actions">
          <button type="button" className="studioV27Command__focus" onClick={() => setFocusMode((current) => !current)} aria-pressed={focusMode}>
            {focusMode ? "Exit focus" : "Focus mode"}
          </button>
          <button type="button" className="studioV27Command__primary" onClick={runQuickAction}>{quickAction.label}</button>
        </div>
      </div>

      <div className="studioV27Command__phases" role="list" aria-label="Revision workflow stages">
        {PHASES.map((phase) => {
          const state = phaseState(phase.id, snapshot);
          const active = snapshot.activePhase === phase.id;
          return (
            <button
              type="button"
              key={phase.id}
              role="listitem"
              className="studioV27Command__phase"
              data-state={state}
              data-active={active ? "true" : "false"}
              onClick={() => scrollToPhase(phase.id)}
              aria-label={`${phase.number} ${phase.label}${state === "done" ? ", complete" : state === "hold" ? ", needs review" : ""}`}
            >
              <span>{phase.number}</span>
              <div><strong>{phase.label}</strong><small>{phase.short}</small></div>
              <i aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <div className="studioV27Command__hint">
        <span>Long assignment?</span>
        <b>Alt + Shift + 1–6</b>
        <small>jump between Studio stages</small>
        <i aria-hidden="true" />
        <b>Alt + Shift + F</b>
        <small>toggle focus mode</small>
      </div>
    </nav>
  );
}
