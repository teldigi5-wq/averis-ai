"use client";

import { useEffect, useMemo, useState } from "react";

type PlannerProps = {
  open: boolean;
  onClose: () => void;
  currentDraftWords: number;
};

type PlanDay = {
  date: Date;
  hours: number;
  phase: string;
  detail: string;
  words: number;
  buffer: boolean;
};

function localToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromInputDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDay(date: Date) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(date);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readStudioWordTarget() {
  const toolkit = document.querySelector<HTMLElement>('section[aria-label="Student submission toolkit"]');
  const input = toolkit?.querySelector<HTMLInputElement>('input[type="number"]');
  const target = Number(input?.value ?? 0);
  return Number.isFinite(target) && target >= 100 ? target : null;
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function icsDate(date: Date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

export default function StudentWorkloadPlannerV29({ open, onClose, currentDraftWords }: PlannerProps) {
  const today = useMemo(() => localToday(), []);
  const defaultDue = useMemo(() => toInputDate(addDays(today, 14)), [today]);
  const [dueDate, setDueDate] = useState(defaultDue);
  const [wordTarget, setWordTarget] = useState(1500);
  const [weekdayHours, setWeekdayHours] = useState(1.5);
  const [weekendHours, setWeekendHours] = useState(3);
  const [wordsPerHour, setWordsPerHour] = useState(300);
  const [reviewBufferDays, setReviewBufferDays] = useState(2);
  const [priorityFocus, setPriorityFocus] = useState("");
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [assignmentTargetSeen, setAssignmentTargetSeen] = useState(false);

  useEffect(() => {
    const onTarget = (event: Event) => {
      const custom = event as CustomEvent<{ target?: number }>;
      const target = Number(custom.detail?.target ?? 0);
      if (Number.isFinite(target) && target >= 100) {
        setWordTarget(target);
        setAssignmentTargetSeen(true);
      }
    };
    window.addEventListener("averis:assignment-word-target", onTarget as EventListener);
    return () => window.removeEventListener("averis:assignment-word-target", onTarget as EventListener);
  }, []);

  useEffect(() => {
    if (!open) return;
    const studioTarget = readStudioWordTarget();
    if (studioTarget) {
      setWordTarget(studioTarget);
      setAssignmentTargetSeen(true);
    }

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

  const model = useMemo(() => {
    const due = fromInputDate(dueDate);
    const start = localToday();
    if (!due || due < start) {
      return {
        valid: false,
        daysLeft: 0,
        remainingWords: Math.max(0, wordTarget - currentDraftWords),
        capacityHours: 0,
        estimatedHours: 0,
        risk: "Set a future deadline",
        days: [] as PlanDay[],
      };
    }

    const calendarDays: Date[] = [];
    for (let cursor = new Date(start); cursor <= due && calendarDays.length < 120; cursor = addDays(cursor, 1)) {
      calendarDays.push(new Date(cursor));
    }

    const bufferCount = clamp(Math.round(reviewBufferDays), 0, Math.max(0, calendarDays.length - 1));
    const remainingWords = Math.max(0, wordTarget - currentDraftWords);
    const writingDays = calendarDays.slice(0, Math.max(1, calendarDays.length - bufferCount));
    const workableWritingDays = writingDays.filter((date) => {
      const weekend = date.getDay() === 0 || date.getDay() === 6;
      return (weekend ? weekendHours : weekdayHours) > 0;
    });
    const wordsPerWritingDay = workableWritingDays.length ? Math.ceil(remainingWords / workableWritingDays.length) : remainingWords;

    const days: PlanDay[] = calendarDays.map((date, index) => {
      const weekend = date.getDay() === 0 || date.getDay() === 6;
      const hours = Math.max(0, weekend ? weekendHours : weekdayHours);
      const buffer = index >= calendarDays.length - bufferCount;
      const progress = calendarDays.length <= 1 ? 1 : index / (calendarDays.length - 1);

      let phase = "Draft + develop";
      let detail = "Move the assignment forward against the brief and word target.";
      if (buffer) {
        phase = index === calendarDays.length - 1 ? "Submission check" : "Final review buffer";
        detail = index === calendarDays.length - 1
          ? "Confirm file format, filename, citations, references and upload readiness."
          : "Re-read against the rubric, repair weak evidence and run the final Averis checks.";
      } else if (progress < 0.15) {
        phase = "Plan + source map";
        detail = "Break down the brief, outline sections and identify evidence needed for the highest-value criteria.";
      } else if (progress < 0.7) {
        phase = "Draft + develop";
        detail = "Write or revise core sections while keeping claims, sources and citations connected.";
      } else if (progress < 0.86) {
        phase = "Rubric-focused revision";
        detail = "Spend time where the rubric carries the most value; strengthen reasoning before polishing language.";
      } else {
        phase = "Evidence + citation pass";
        detail = "Check source support, quotation boundaries, citations, DOI/reference links and protected numbers.";
      }

      const canWrite = !buffer && hours > 0;
      return {
        date,
        hours,
        phase,
        detail,
        words: canWrite ? Math.min(remainingWords, wordsPerWritingDay) : 0,
        buffer,
      };
    });

    const capacityHours = days.reduce((sum, day) => sum + day.hours, 0);
    const estimatedHours = remainingWords / Math.max(100, wordsPerHour) + 5 + Math.min(4, calendarDays.length * 0.15);
    const ratio = estimatedHours > 0 ? capacityHours / estimatedHours : 2;
    const risk = ratio >= 1.35 ? "Comfortable" : ratio >= 1 ? "Manageable" : ratio >= 0.7 ? "Tight" : "High pressure";

    return {
      valid: true,
      daysLeft: Math.max(0, calendarDays.length - 1),
      remainingWords,
      capacityHours,
      estimatedHours,
      risk,
      days,
    };
  }, [currentDraftWords, dueDate, reviewBufferDays, weekdayHours, weekendHours, wordTarget, wordsPerHour]);

  const completedPercent = useMemo(() => {
    if (!model.days.length) return 0;
    const done = model.days.filter((day) => completed[toInputDate(day.date)]).length;
    return Math.round((done / model.days.length) * 100);
  }, [completed, model.days]);

  async function copyPlan() {
    if (!model.valid) return;
    const lines = [
      "Averis Student Workload Plan",
      `Deadline: ${dueDate}`,
      `Draft: ${currentDraftWords.toLocaleString()} / ${wordTarget.toLocaleString()} words`,
      `Available study capacity: ${model.capacityHours.toFixed(1)} hours`,
      `Planning estimate: ${model.estimatedHours.toFixed(1)} hours`,
      `Workload signal: ${model.risk}`,
      priorityFocus.trim() ? `Priority focus: ${priorityFocus.trim()}` : "",
      "",
      ...model.days.map((day) => `${completed[toInputDate(day.date)] ? "[x]" : "[ ]"} ${formatDay(day.date)} — ${day.phase} — ${day.hours.toFixed(1)}h${day.words ? ` — aim ~${day.words} words` : ""}`),
    ].filter(Boolean);
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function exportCalendar() {
    if (!model.valid) return;
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const events = model.days.map((day, index) => {
      const start = icsDate(day.date);
      const end = icsDate(addDays(day.date, 1));
      const description = `${day.detail}${day.words ? ` Aim for about ${day.words} words.` : ""}${priorityFocus.trim() ? ` Priority: ${priorityFocus.trim()}.` : ""}`;
      return [
        "BEGIN:VEVENT",
        `UID:averis-v29-${start}-${index}@averis.local`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end}`,
        `SUMMARY:${escapeIcs(`Averis: ${day.phase}`)}`,
        `DESCRIPTION:${escapeIcs(description)}`,
        "END:VEVENT",
      ].join("\r\n");
    }).join("\r\n");

    const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Averis//Student Workload Planner v29//EN\r\nCALSCALE:GREGORIAN\r\n${events}\r\nEND:VCALENDAR\r\n`;
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "averis-workload-plan.ics";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  if (!open) return null;

  return (
    <div className="plannerV29Backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="plannerV29Drawer" role="dialog" aria-modal="true" aria-labelledby="planner-v29-title">
        <header className="plannerV29Header">
          <div>
            <span>AVERIS · STUDENT WORKLOAD PLANNER V29</span>
            <h2 id="planner-v29-title">Turn the deadline into a realistic plan.</h2>
            <p>Local browser planning only. No calendar account, Groq request, Azure call, Supabase write or paid service is required.</p>
          </div>
          <button type="button" className="plannerV29Close" onClick={onClose} aria-label="Close Student Workload Planner">×</button>
        </header>

        <div className="plannerV29Body">
          <section className="plannerV29Controls">
            <div className="plannerV29SectionHead">
              <div><span>01 · PLAN INPUTS</span><strong>Set the deadline and the time you actually have</strong></div>
              <small>{assignmentTargetSeen ? "Assignment target connected" : "Manual planning"}</small>
            </div>
            <div className="plannerV29Fields">
              <label><span>Deadline</span><input type="date" min={toInputDate(today)} value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
              <label><span>Assignment word target</span><input type="number" min={100} max={50000} step={50} value={wordTarget} onChange={(event) => setWordTarget(Math.max(100, Number(event.target.value) || 100))} /></label>
              <label><span>Weekday study hours / day</span><input type="number" min={0} max={12} step={0.5} value={weekdayHours} onChange={(event) => setWeekdayHours(clamp(Number(event.target.value) || 0, 0, 12))} /></label>
              <label><span>Weekend study hours / day</span><input type="number" min={0} max={16} step={0.5} value={weekendHours} onChange={(event) => setWeekendHours(clamp(Number(event.target.value) || 0, 0, 16))} /></label>
              <label><span>Writing pace estimate</span><input type="number" min={100} max={1000} step={50} value={wordsPerHour} onChange={(event) => setWordsPerHour(clamp(Number(event.target.value) || 100, 100, 1000))} /><small>words/hour for planning only</small></label>
              <label><span>Final review buffer</span><input type="number" min={0} max={14} step={1} value={reviewBufferDays} onChange={(event) => setReviewBufferDays(clamp(Number(event.target.value) || 0, 0, 14))} /><small>days reserved before submission</small></label>
            </div>
            <label className="plannerV29Priority"><span>Highest-mark / highest-risk focus (optional)</span><input type="text" maxLength={180} value={priorityFocus} onChange={(event) => setPriorityFocus(event.target.value)} placeholder="Example: Analysis 40% · Evidence quality 30%" /></label>
          </section>

          <section className="plannerV29Snapshot" aria-label="Workload planning snapshot">
            <article><span>DAYS LEFT</span><strong>{model.valid ? model.daysLeft : "—"}</strong><small>calendar days until the deadline</small></article>
            <article><span>WORDS REMAINING</span><strong>{model.remainingWords.toLocaleString()}</strong><small>{currentDraftWords.toLocaleString()} / {wordTarget.toLocaleString()} drafted</small></article>
            <article><span>STUDY CAPACITY</span><strong>{model.valid ? `${model.capacityHours.toFixed(1)}h` : "—"}</strong><small>based on the availability you entered</small></article>
            <article data-risk={model.risk.toLowerCase().replace(/\s+/g, "-")}><span>WORKLOAD SIGNAL</span><strong>{model.risk}</strong><small>planning estimate, not a guarantee of completion</small></article>
          </section>

          {model.valid ? (
            <>
              <section className="plannerV29Progress">
                <div><span>PLAN COMPLETION</span><strong>{completedPercent}%</strong></div>
                <div className="plannerV29ProgressTrack" role="progressbar" aria-label="Workload plan completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completedPercent}><i style={{ width: `${completedPercent}%` }} /></div>
                <small>Check off work blocks as you finish them. Nothing is persisted after this page session.</small>
              </section>

              <section className="plannerV29Timeline">
                <div className="plannerV29SectionHead"><div><span>02 · DAILY ROADMAP</span><strong>Protect the deadline with staged work</strong></div><small>{model.estimatedHours.toFixed(1)}h planning estimate</small></div>
                <div className="plannerV29Days">
                  {model.days.map((day, index) => {
                    const key = toInputDate(day.date);
                    const done = Boolean(completed[key]);
                    return (
                      <label className={`plannerV29Day${done ? " isDone" : ""}${day.buffer ? " isBuffer" : ""}`} key={key}>
                        <input type="checkbox" checked={done} onChange={(event) => setCompleted((current) => ({ ...current, [key]: event.target.checked }))} />
                        <span className="plannerV29DayIndex">{String(index + 1).padStart(2, "0")}</span>
                        <span className="plannerV29DayMain"><b>{formatDay(day.date)}</b><strong>{day.phase}</strong><small>{day.detail}</small></span>
                        <span className="plannerV29DayMeta"><b>{day.hours.toFixed(1)}h</b><small>{day.words ? `~${day.words} words` : day.buffer ? "review" : "no writing target"}</small></span>
                      </label>
                    );
                  })}
                </div>
              </section>

              <section className="plannerV29Actions">
                <div><span>03 · TAKE IT WITH YOU</span><strong>Keep the plan usable outside Averis</strong><small>Both exports are created locally in the browser.</small></div>
                <div><button type="button" onClick={copyPlan}>{copied ? "Plan copied" : "Copy plan"}</button><button type="button" onClick={exportCalendar}>Export calendar (.ics)</button></div>
              </section>
            </>
          ) : (
            <section className="plannerV29Empty"><span>DEADLINE REQUIRED</span><strong>Choose a valid future deadline.</strong><p>Averis will then distribute planning, drafting, evidence review and final buffer work across the time you have.</p></section>
          )}

          <p className="plannerV29Boundary">The planner helps allocate your own work. It does not change assignment policy, invent completion evidence, auto-submit work, or weaken Averis citation/evidence review.</p>
        </div>
      </aside>
    </div>
  );
}
