"use client";

import { useEffect, useMemo, useState } from "react";

export type StudioReadinessSnapshot = {
  draftWords: number;
  wordTarget: number | null;
  sourceSupplied: boolean;
  preflightReady: boolean;
  preflightBlocked: boolean;
  proposalReady: boolean;
  finalRecheckReady: boolean;
};

export type AssignmentReadinessSignal = {
  seen: boolean;
  progress: number;
  wordTarget: number | null;
  citationStyle: string | null;
  deadlineDetected: boolean;
};

export type PlannerReadinessSignal = {
  seen: boolean;
  progress: number;
  risk: string;
  daysLeft: number | null;
  remainingWords: number | null;
};

export type CitationReadinessSignal = {
  seen: boolean;
  score: number;
  unresolved: number;
  uncited: number;
  duplicates: number;
  references: number;
};

type LaneState = "pass" | "review" | "pending";
type LaneId = "draft" | "assignment" | "length" | "evidence" | "proposal" | "citations" | "plan" | "final" | "manual";

type Lane = {
  id: LaneId;
  label: string;
  state: LaneState;
  detail: string;
  action?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onAction: (lane: LaneId) => void;
  studio: StudioReadinessSnapshot;
  assignment: AssignmentReadinessSignal;
  planner: PlannerReadinessSignal;
  citation: CitationReadinessSignal;
};

const MANUAL_CHECKS = [
  { id: "format", label: "File type and filename match the submission instructions" },
  { id: "contents", label: "Required sections, appendices, tables and figures are included" },
  { id: "sources", label: "References were checked against the original sources" },
  { id: "upload", label: "The final file opens correctly and the upload/preview was checked" },
] as const;

function stateWeight(state: LaneState) {
  if (state === "pass") return 1;
  if (state === "review") return 0.45;
  return 0;
}

function statusLabel(score: number, pending: number, reviews: number) {
  if (score >= 88 && pending === 0 && reviews <= 1) return "Strong readiness signal";
  if (score >= 65) return "Needs a focused review";
  return "Still in progress";
}

function downloadText(filename: string, value: string) {
  const blob = new Blob([value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function SubmissionReadinessCenterV31({ open, onClose, onAction, studio, assignment, planner, citation }: Props) {
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  const manualProgress = useMemo(() => {
    const done = MANUAL_CHECKS.filter((item) => manual[item.id]).length;
    return Math.round((done / MANUAL_CHECKS.length) * 100);
  }, [manual]);

  const target = studio.wordTarget ?? assignment.wordTarget;

  const lanes = useMemo<Lane[]>(() => {
    const lengthState: LaneState = target
      ? studio.draftWords >= Math.round(target * 0.9) && studio.draftWords <= Math.round(target * 1.1) ? "pass" : "review"
      : "pending";

    const citationPass = citation.seen && citation.score >= 85 && citation.unresolved === 0 && citation.duplicates === 0;
    const plannerPass = planner.seen && /comfortable|manageable/i.test(planner.risk);

    return [
      {
        id: "draft",
        label: "Draft coverage",
        state: studio.draftWords >= 50 ? "pass" : studio.draftWords > 0 ? "review" : "pending",
        detail: studio.draftWords >= 50 ? `${studio.draftWords.toLocaleString()} words are in the current Studio draft.` : "Add enough of the assignment to run meaningful checks.",
      },
      {
        id: "assignment",
        label: "Assignment requirements",
        state: assignment.seen ? assignment.progress === 100 ? "pass" : "review" : "pending",
        detail: assignment.seen ? `${assignment.progress}% of the extracted brief checklist is checked.` : "Open Assignment Intelligence and extract the brief/rubric.",
        action: "Open assignment brief",
      },
      {
        id: "length",
        label: "Word target",
        state: lengthState,
        detail: target ? `${studio.draftWords.toLocaleString()} / ${target.toLocaleString()} words in Studio.` : "No assignment word target is connected yet.",
        action: target ? undefined : "Connect a word target",
      },
      {
        id: "evidence",
        label: "Evidence gate",
        state: studio.preflightBlocked ? "review" : studio.preflightReady ? "pass" : "pending",
        detail: studio.preflightBlocked ? "The latest preflight contains a hold that needs review." : studio.preflightReady ? "The pre-generation evidence gate has been completed." : "Run the evidence gate before relying on a revision proposal.",
        action: studio.preflightReady && !studio.preflightBlocked ? undefined : "Go to evidence gate",
      },
      {
        id: "proposal",
        label: "Revision proposal",
        state: studio.proposalReady ? "pass" : "pending",
        detail: studio.proposalReady ? "A sentence-level revision proposal is available for human review." : "Generate a bounded proposal after the evidence gate passes.",
        action: studio.proposalReady ? undefined : "Go to proposal",
      },
      {
        id: "citations",
        label: "Citation & references",
        state: citationPass ? "pass" : citation.seen ? "review" : "pending",
        detail: citation.seen
          ? `${citation.score}/100 citation readiness · ${citation.unresolved} unresolved · ${citation.duplicates} duplicate groups.`
          : "Run the References assistant when the assignment uses sources.",
        action: citationPass ? undefined : "Open References",
      },
      {
        id: "plan",
        label: "Deadline plan",
        state: plannerPass ? "pass" : planner.seen ? "review" : "pending",
        detail: planner.seen
          ? `${planner.risk} workload signal · ${planner.progress}% of planned work blocks checked.`
          : "Create a workload plan if the deadline still requires staged work.",
        action: plannerPass ? undefined : "Open workload planner",
      },
      {
        id: "final",
        label: "Final evidence re-check",
        state: studio.finalRecheckReady ? "pass" : studio.proposalReady ? "review" : "pending",
        detail: studio.finalRecheckReady ? "The accepted draft has a post-decision evidence re-check." : "Re-check the accepted draft after making sentence decisions.",
        action: studio.finalRecheckReady ? undefined : "Go to final re-check",
      },
      {
        id: "manual",
        label: "Submission handoff",
        state: manualProgress === 100 ? "pass" : Object.values(manual).some(Boolean) ? "review" : "pending",
        detail: `${manualProgress}% of the final file/upload checks are confirmed by you.`,
      },
    ];
  }, [assignment, citation, manual, manualProgress, planner, studio, target]);

  const score = useMemo(() => Math.round((lanes.reduce((sum, lane) => sum + stateWeight(lane.state), 0) / lanes.length) * 100), [lanes]);
  const passes = lanes.filter((lane) => lane.state === "pass").length;
  const reviews = lanes.filter((lane) => lane.state === "review").length;
  const pending = lanes.filter((lane) => lane.state === "pending").length;
  const status = statusLabel(score, pending, reviews);

  const report = useMemo(() => {
    const rows = lanes.map((lane) => `${lane.state === "pass" ? "[PASS]" : lane.state === "review" ? "[REVIEW]" : "[PENDING]"} ${lane.label} — ${lane.detail}`);
    const manualRows = MANUAL_CHECKS.map((item) => `${manual[item.id] ? "[x]" : "[ ]"} ${item.label}`);
    return [
      "Averis Submission Readiness Center v31",
      `Readiness signal: ${score}/100 — ${status}`,
      `Draft: ${studio.draftWords.toLocaleString()} words${target ? ` / ${target.toLocaleString()} target` : ""}`,
      assignment.citationStyle ? `Assignment citation style: ${assignment.citationStyle}` : null,
      citation.seen ? `Citation readiness: ${citation.score}/100` : null,
      planner.seen ? `Workload signal: ${planner.risk}` : null,
      "",
      "Readiness areas",
      ...rows,
      "",
      "Manual submission checks",
      ...manualRows,
      "",
      "Boundary: This is a pre-submission readiness signal, not a guarantee of marks, originality-system results, policy compliance, or successful upload. Verify your university brief and submission portal yourself.",
    ].filter((item): item is string => item !== null).join("\n");
  }, [assignment.citationStyle, citation, lanes, manual, planner, score, status, studio.draftWords, target]);

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  if (!open) return null;

  return (
    <div className="readinessV31Backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="readinessV31Drawer" role="dialog" aria-modal="true" aria-labelledby="readiness-v31-title">
        <header className="readinessV31Header">
          <div>
            <span>AVERIS · SUBMISSION READINESS CENTER V31</span>
            <h2 id="readiness-v31-title">See what still needs attention before upload.</h2>
            <p>Combines the current Studio workflow with assignment, citation and workload signals from this page session. No new AI call or backend write is used.</p>
          </div>
          <button type="button" className="readinessV31Close" onClick={onClose} aria-label="Close Submission Readiness Center">×</button>
        </header>

        <div className="readinessV31Body">
          <section className="readinessV31Hero" data-state={score >= 88 && pending === 0 ? "strong" : score >= 65 ? "review" : "progress"}>
            <div className="readinessV31Score" role="img" aria-label={`Submission readiness signal ${score} out of 100`}>
              <span>READINESS SIGNAL</span>
              <strong>{score}<small>/100</small></strong>
              <p>{status}</p>
            </div>
            <div className="readinessV31HeroCopy">
              <span>LIVE PRE-SUBMISSION SNAPSHOT</span>
              <h3>{passes} areas strong · {reviews} need review · {pending} pending</h3>
              <p>Averis only marks an area strong when the corresponding local/session check has evidence. Pending tools are never silently treated as passed.</p>
              <div className="readinessV31MiniStats">
                <span><small>DRAFT</small><b>{studio.draftWords.toLocaleString()} words</b></span>
                <span><small>SOURCE</small><b>{studio.sourceSupplied ? "Connected" : "Optional / none"}</b></span>
                <span><small>FINAL RE-CHECK</small><b>{studio.finalRecheckReady ? "Complete" : "Pending"}</b></span>
              </div>
            </div>
          </section>

          <section className="readinessV31Areas" aria-label="Submission readiness areas">
            <div className="readinessV31SectionHead"><div><span>01 · READINESS AREAS</span><strong>Resolve the remaining gaps</strong></div><small>{passes}/{lanes.length} strong</small></div>
            <div className="readinessV31LaneGrid">
              {lanes.map((lane, index) => (
                <article key={lane.id} data-state={lane.state}>
                  <div className="readinessV31LaneTop"><span>{String(index + 1).padStart(2, "0")}</span><b>{lane.state === "pass" ? "STRONG" : lane.state === "review" ? "REVIEW" : "PENDING"}</b></div>
                  <strong>{lane.label}</strong>
                  <p>{lane.detail}</p>
                  {lane.action && <button type="button" onClick={() => onAction(lane.id)}>{lane.action}</button>}
                </article>
              ))}
            </div>
          </section>

          <section className="readinessV31Manual">
            <div className="readinessV31SectionHead"><div><span>02 · HUMAN HANDOFF</span><strong>Confirm the things software cannot safely infer</strong></div><small>{manualProgress}% confirmed</small></div>
            <div className="readinessV31ManualTrack" role="progressbar" aria-label="Manual submission check completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={manualProgress}><i style={{ width: `${manualProgress}%` }} /></div>
            <div className="readinessV31Checklist">
              {MANUAL_CHECKS.map((item) => (
                <label key={item.id} className={manual[item.id] ? "isDone" : ""}>
                  <input type="checkbox" checked={Boolean(manual[item.id])} onChange={(event) => setManual((current) => ({ ...current, [item.id]: event.target.checked }))} />
                  <span><strong>{item.label}</strong><small>Confirmed manually by you in this page session.</small></span>
                </label>
              ))}
            </div>
          </section>

          <section className="readinessV31Export">
            <div><span>03 · TAKE THE CHECKLIST WITH YOU</span><strong>Copy or download the readiness report</strong><small>Generated locally from the current page session.</small></div>
            <div><button type="button" onClick={copyReport}>{copied ? "Report copied" : "Copy report"}</button><button type="button" onClick={() => downloadText("averis-submission-readiness.txt", report)}>Download .txt report</button></div>
          </section>

          <p className="readinessV31Boundary">Readiness is a planning/evidence signal, not a guarantee of grades, Turnitin similarity/AI-detector outcomes, academic-policy compliance, or a successful LMS upload. Follow your institution's rules and verify the final submission yourself.</p>
        </div>
      </aside>
    </div>
  );
}
