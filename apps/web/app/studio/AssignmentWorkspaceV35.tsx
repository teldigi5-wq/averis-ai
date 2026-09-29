"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type HistoryRow = { at: string; action: string; words: number };
type AssignmentWorkspace = {
  id: string;
  title: string;
  module: string;
  dueDate: string;
  wordTarget: number | null;
  brief: string;
  draft: string;
  source: string;
  references: string;
  notes: string;
  autosave: boolean;
  createdAt: string;
  updatedAt: string;
  history: HistoryRow[];
};

type Props = { open: boolean; onClose: () => void };

type LiveContext = { brief: string; references: string; dueDate: string; wordTarget: number | null };

const STORAGE_KEY = "averis:assignment-workspaces:v35";
const ACTIVE_KEY = "averis:assignment-workspace-active:v35";
const MAX_WORKSPACES = 8;
const EMPTY_LIVE: LiveContext = { brief: "", references: "", dueDate: "", wordTarget: null };

function compact(value: string | null | undefined) { return (value ?? "").replace(/\s+/g, " ").trim(); }
function wordCount(value: string) { const text = compact(value); return text ? text.split(" ").length : 0; }
function nowIso() { return new Date().toISOString(); }
function safeDateLabel(value: string) {
  if (!value) return "No deadline";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}
function localId() { return `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function cleanWorkspace(input: Partial<AssignmentWorkspace>): AssignmentWorkspace | null {
  const id = typeof input.id === "string" && input.id ? input.id.slice(0, 80) : localId();
  const createdAt = typeof input.createdAt === "string" ? input.createdAt : nowIso();
  const updatedAt = typeof input.updatedAt === "string" ? input.updatedAt : createdAt;
  return {
    id,
    title: String(input.title ?? "Untitled assignment").slice(0, 120),
    module: String(input.module ?? "").slice(0, 100),
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(input.dueDate ?? "")) ? String(input.dueDate) : "",
    wordTarget: Number.isFinite(Number(input.wordTarget)) && Number(input.wordTarget) >= 100 ? Math.round(Number(input.wordTarget)) : null,
    brief: String(input.brief ?? "").slice(0, 16000),
    draft: String(input.draft ?? "").slice(0, 12000),
    source: String(input.source ?? "").slice(0, 40000),
    references: String(input.references ?? "").slice(0, 30000),
    notes: String(input.notes ?? "").slice(0, 5000),
    autosave: input.autosave !== false,
    createdAt,
    updatedAt,
    history: Array.isArray(input.history) ? input.history.slice(-8).map((row) => ({ at: String(row.at ?? updatedAt), action: String(row.action ?? "Saved").slice(0, 80), words: Number(row.words ?? 0) || 0 })) : [],
  };
}
function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [] as AssignmentWorkspace[];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_WORKSPACES).map((item) => cleanWorkspace(item)).filter((item): item is AssignmentWorkspace => Boolean(item));
  } catch { return [] as AssignmentWorkspace[]; }
}
function saveStored(items: AssignmentWorkspace[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_WORKSPACES))); return true; } catch { return false; }
}
function nativeTextareaValue(element: HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}
function studioFields() {
  return {
    draft: document.querySelector<HTMLTextAreaElement>('textarea[maxlength="12000"]'),
    source: document.querySelector<HTMLTextAreaElement>('textarea[maxlength="40000"]'),
  };
}
function readStudioTarget() {
  const toolkit = document.querySelector<HTMLElement>('section[aria-label="Student submission toolkit"]');
  const value = Number(toolkit?.querySelector<HTMLInputElement>('input[type="number"]')?.value ?? 0);
  return Number.isFinite(value) && value >= 100 ? Math.round(value) : null;
}
function referenceCount(value: string) {
  const text = value.replace(/\r/g, "").trim();
  if (!text) return 0;
  const blocks = text.split(/\n\s*\n+/).filter((item) => compact(item));
  if (blocks.length > 1) return blocks.length;
  return text.split("\n").filter((item) => compact(item).length >= 10).length || 1;
}
function appendHistory(workspace: AssignmentWorkspace, action: string): HistoryRow[] {
  return [...workspace.history, { at: nowIso(), action, words: wordCount(workspace.draft) }].slice(-8);
}
function downloadBackup(workspaces: AssignmentWorkspace[]) {
  const payload = JSON.stringify({ format: "averis-assignment-workspaces-v35", exportedAt: nowIso(), workspaces }, null, 2);
  const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `averis-assignment-workspaces-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function AssignmentWorkspaceV35({ open, onClose }: Props) {
  const [workspaces, setWorkspaces] = useState<AssignmentWorkspace[]>([]);
  const [activeId, setActiveId] = useState("");
  const [live, setLive] = useState<LiveContext>(EMPTY_LIVE);
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const autosaveTimer = useRef<number | null>(null);

  useEffect(() => {
    const items = readStored();
    setWorkspaces(items);
    const remembered = localStorage.getItem(ACTIVE_KEY) ?? "";
    setActiveId(items.some((item) => item.id === remembered) ? remembered : items[0]?.id ?? "");
  }, []);

  const active = useMemo(() => workspaces.find((item) => item.id === activeId) ?? null, [activeId, workspaces]);

  const persist = (next: AssignmentWorkspace[], nextActive = activeId) => {
    setWorkspaces(next);
    if (nextActive) localStorage.setItem(ACTIVE_KEY, nextActive); else localStorage.removeItem(ACTIVE_KEY);
    if (!saveStored(next)) setNotice("Browser storage is full or unavailable. Export a backup before continuing.");
  };

  const updateActive = (patch: Partial<AssignmentWorkspace>, action?: string) => {
    if (!active) return;
    const next = workspaces.map((item) => {
      if (item.id !== active.id) return item;
      const updated: AssignmentWorkspace = { ...item, ...patch, updatedAt: nowIso() };
      if (action) updated.history = appendHistory(updated, action);
      return updated;
    });
    persist(next, active.id);
  };

  useEffect(() => {
    const onBrief = (event: Event) => {
      const value = String((event as CustomEvent<{ brief?: string }>).detail?.brief ?? "").slice(0, 16000);
      setLive((current) => ({ ...current, brief: value }));
    };
    const onRefs = (event: Event) => {
      const value = String((event as CustomEvent<{ references?: string }>).detail?.references ?? "").slice(0, 30000);
      setLive((current) => ({ ...current, references: value }));
    };
    const onDeadline = (event: Event) => {
      const value = String((event as CustomEvent<{ dueDate?: string }>).detail?.dueDate ?? "");
      setLive((current) => ({ ...current, dueDate: /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : current.dueDate }));
    };
    const onTarget = (event: Event) => {
      const value = Number((event as CustomEvent<{ target?: number }>).detail?.target ?? 0);
      if (Number.isFinite(value) && value >= 100) setLive((current) => ({ ...current, wordTarget: Math.round(value) }));
    };
    window.addEventListener("averis:assignment-brief-state", onBrief as EventListener);
    window.addEventListener("averis:references-state", onRefs as EventListener);
    window.addEventListener("averis:planner-deadline-state", onDeadline as EventListener);
    window.addEventListener("averis:assignment-word-target", onTarget as EventListener);
    return () => {
      window.removeEventListener("averis:assignment-brief-state", onBrief as EventListener);
      window.removeEventListener("averis:references-state", onRefs as EventListener);
      window.removeEventListener("averis:planner-deadline-state", onDeadline as EventListener);
      window.removeEventListener("averis:assignment-word-target", onTarget as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!active?.autosave) return;
    const schedule = () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = window.setTimeout(() => {
        const fields = studioFields();
        const draft = fields.draft?.value ?? active.draft;
        const source = fields.source?.value ?? active.source;
        const target = readStudioTarget() ?? live.wordTarget ?? active.wordTarget;
        const brief = live.brief || active.brief;
        const references = live.references || active.references;
        const dueDate = live.dueDate || active.dueDate;
        const changed = draft !== active.draft || source !== active.source || target !== active.wordTarget || brief !== active.brief || references !== active.references || dueDate !== active.dueDate;
        if (!changed) return;
        const next = workspaces.map((item) => item.id === active.id ? { ...item, draft: draft.slice(0, 12000), source: source.slice(0, 40000), wordTarget: target, brief: brief.slice(0, 16000), references: references.slice(0, 30000), dueDate, updatedAt: nowIso() } : item);
        persist(next, active.id);
      }, 850);
    };
    document.addEventListener("input", schedule, true);
    document.addEventListener("change", schedule, true);
    window.addEventListener("averis:assignment-brief-state", schedule as EventListener);
    window.addEventListener("averis:references-state", schedule as EventListener);
    window.addEventListener("averis:planner-deadline-state", schedule as EventListener);
    window.addEventListener("averis:assignment-word-target", schedule as EventListener);
    return () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
      document.removeEventListener("input", schedule, true);
      document.removeEventListener("change", schedule, true);
      window.removeEventListener("averis:assignment-brief-state", schedule as EventListener);
      window.removeEventListener("averis:references-state", schedule as EventListener);
      window.removeEventListener("averis:planner-deadline-state", schedule as EventListener);
      window.removeEventListener("averis:assignment-word-target", schedule as EventListener);
    };
  }, [active, live, workspaces]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  function createWorkspace() {
    if (workspaces.length >= MAX_WORKSPACES) { setNotice(`Local workspace limit reached (${MAX_WORKSPACES}). Export or remove an old workspace first.`); return; }
    const fields = studioFields();
    const created: AssignmentWorkspace = {
      id: localId(), title: `Assignment ${workspaces.length + 1}`, module: "", dueDate: live.dueDate, wordTarget: readStudioTarget() ?? live.wordTarget,
      brief: live.brief, draft: (fields.draft?.value ?? "").slice(0, 12000), source: (fields.source?.value ?? "").slice(0, 40000), references: live.references,
      notes: "", autosave: true, createdAt: nowIso(), updatedAt: nowIso(), history: [],
    };
    created.history = appendHistory(created, "Workspace created from current Studio");
    persist([created, ...workspaces], created.id);
    setActiveId(created.id);
    setNotice("Local assignment workspace created. Auto-save is enabled for this browser profile.");
  }

  function captureCurrent() {
    if (!active) return;
    const fields = studioFields();
    const draft = (fields.draft?.value ?? active.draft).slice(0, 12000);
    const source = (fields.source?.value ?? active.source).slice(0, 40000);
    updateActive({ draft, source, brief: (live.brief || active.brief).slice(0, 16000), references: (live.references || active.references).slice(0, 30000), dueDate: live.dueDate || active.dueDate, wordTarget: readStudioTarget() ?? live.wordTarget ?? active.wordTarget }, "Captured current Studio state");
    setNotice("Current Studio state saved locally.");
  }

  function restoreActive() {
    if (!active) return;
    const fields = studioFields();
    if (fields.draft) nativeTextareaValue(fields.draft, active.draft);
    if (fields.source) nativeTextareaValue(fields.source, active.source);
    window.dispatchEvent(new CustomEvent("averis:workspace-brief", { detail: { brief: active.brief } }));
    window.dispatchEvent(new CustomEvent("averis:workspace-references", { detail: { references: active.references } }));
    if (active.dueDate) window.dispatchEvent(new CustomEvent("averis:workspace-deadline", { detail: { dueDate: active.dueDate } }));
    if (active.wordTarget) window.dispatchEvent(new CustomEvent("averis:assignment-word-target", { detail: { target: active.wordTarget } }));
    window.dispatchEvent(new CustomEvent("averis:workspace-restored", { detail: { id: active.id, title: active.title } }));
    updateActive({}, "Restored workspace into Studio");
    setNotice("Workspace restored into Studio. Re-run evidence/readiness checks because analysis results are intentionally not persisted.");
  }

  function removeActive() {
    if (!active || !window.confirm(`Delete the local workspace “${active.title}”? This cannot be undone unless you exported a backup.`)) return;
    const next = workspaces.filter((item) => item.id !== active.id);
    const nextId = next[0]?.id ?? "";
    setActiveId(nextId);
    persist(next, nextId);
    setNotice("Local workspace deleted.");
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const candidates = Array.isArray(parsed?.workspaces) ? parsed.workspaces : [];
      const imported = candidates.map((item: Partial<AssignmentWorkspace>) => cleanWorkspace(item)).filter((item: AssignmentWorkspace | null): item is AssignmentWorkspace => Boolean(item));
      if (!imported.length) throw new Error("No compatible workspaces found");
      const merged = [...imported, ...workspaces].filter((item, index, rows) => rows.findIndex((candidate) => candidate.id === item.id) === index).slice(0, MAX_WORKSPACES);
      persist(merged, imported[0].id);
      setActiveId(imported[0].id);
      setNotice(`${Math.min(imported.length, MAX_WORKSPACES)} workspace${imported.length === 1 ? "" : "s"} imported locally.`);
    } catch { setNotice("That file is not a compatible Averis v35 workspace backup."); }
  }

  if (!open) return null;

  const progress = active?.wordTarget ? Math.min(100, Math.round((wordCount(active.draft) / active.wordTarget) * 100)) : null;

  return <div className="workspaceV35Backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="workspaceV35Drawer" role="dialog" aria-modal="true" aria-labelledby="workspace-v35-title">
      <header className="workspaceV35Header"><div><span>AVERIS · ASSIGNMENT WORKSPACE V35</span><h2 id="workspace-v35-title">Keep one assignment’s moving parts together.</h2><p>Opt-in local workspace storage for the brief, draft, source context, references, deadline, target and notes. No new cloud/database write is used.</p></div><button type="button" className="workspaceV35Close" onClick={onClose} aria-label="Close Assignment Workspace">×</button></header>
      <div className="workspaceV35Body">
        <section className="workspaceV35Privacy"><span>LOCAL-ONLY STORAGE</span><strong>Saved in this browser profile, not synced to Averis.</strong><p>Anyone using the same browser profile may be able to access these local workspaces. On a shared/public computer, keep auto-save off, export what you need, then delete the workspace.</p></section>
        <div className="workspaceV35Grid">
          <section className="workspaceV35Library"><div className="workspaceV35SectionHead"><div><span>01 · ASSIGNMENTS</span><strong>Your local workspace library</strong></div><small>{workspaces.length}/{MAX_WORKSPACES}</small></div><div className="workspaceV35LibraryActions"><button type="button" className="workspaceV35Primary" onClick={createWorkspace}>New from current Studio</button><button type="button" onClick={() => downloadBackup(workspaces)} disabled={!workspaces.length}>Export all</button><button type="button" onClick={() => fileRef.current?.click()}>Import</button><input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importBackup}/></div>{workspaces.length ? <div className="workspaceV35Cards">{workspaces.map((item) => <button type="button" key={item.id} data-active={item.id === activeId ? "true" : "false"} onClick={() => { setActiveId(item.id); localStorage.setItem(ACTIVE_KEY, item.id); }}><span>{item.module || "ASSIGNMENT"}</span><strong>{item.title || "Untitled assignment"}</strong><small>{wordCount(item.draft).toLocaleString()} words · {safeDateLabel(item.dueDate)}</small><i>{new Date(item.updatedAt).toLocaleDateString()}</i></button>)}</div> : <div className="workspaceV35Empty"><span>NO LOCAL WORKSPACE YET</span><strong>Create one from the current Studio.</strong><p>This is opt-in: nothing is written to browser storage until you create or import a workspace.</p></div>}</section>
          <section className="workspaceV35Editor">{active ? <><div className="workspaceV35SectionHead"><div><span>02 · ACTIVE WORKSPACE</span><strong>Edit the assignment identity</strong></div><small>{active.autosave ? "Auto-save on" : "Manual save"}</small></div><div className="workspaceV35Fields"><label><span>ASSIGNMENT NAME</span><input value={active.title} maxLength={120} onChange={(event) => updateActive({ title: event.target.value })}/></label><label><span>MODULE / COURSE</span><input value={active.module} maxLength={100} onChange={(event) => updateActive({ module: event.target.value })}/></label><label><span>DEADLINE</span><input type="date" value={active.dueDate} onChange={(event) => updateActive({ dueDate: event.target.value })}/></label><label><span>WORD TARGET</span><input type="number" min={100} max={100000} value={active.wordTarget ?? ""} onChange={(event) => { const value = Number(event.target.value); updateActive({ wordTarget: Number.isFinite(value) && value >= 100 ? Math.round(value) : null }); }}/></label></div><label className="workspaceV35Notes"><span>WORKSPACE NOTES</span><textarea value={active.notes} maxLength={5000} onChange={(event) => updateActive({ notes: event.target.value })} placeholder="Tutor feedback, next action, questions to resolve, source reminders…"/></label><label className="workspaceV35Autosave"><input type="checkbox" checked={active.autosave} onChange={(event) => updateActive({ autosave: event.target.checked })}/><span><strong>Auto-save this workspace locally</strong><small>Updates draft/source/context in browser storage while this workspace is active.</small></span></label><div className="workspaceV35EditorActions"><button type="button" className="workspaceV35Primary" onClick={restoreActive}>Restore to Studio</button><button type="button" onClick={captureCurrent}>Capture current Studio</button><button type="button" className="workspaceV35Danger" onClick={removeActive}>Delete workspace</button></div></> : <div className="workspaceV35Empty workspaceV35Empty--editor"><span>NO ACTIVE ASSIGNMENT</span><strong>Select or create a workspace.</strong></div>}</section>
        </div>
        {active && <><section className="workspaceV35Snapshot"><article><span>DRAFT</span><strong>{wordCount(active.draft).toLocaleString()}</strong><small>saved words</small></article><article><span>TARGET</span><strong>{active.wordTarget?.toLocaleString() ?? "—"}</strong><small>{progress === null ? "not set" : `${progress}% reached`}</small></article><article><span>SOURCE CONTEXT</span><strong>{active.source ? active.source.length.toLocaleString() : "0"}</strong><small>saved characters</small></article><article><span>REFERENCES</span><strong>{referenceCount(active.references)}</strong><small>local entries</small></article><article><span>BRIEF</span><strong>{active.brief ? "Saved" : "—"}</strong><small>{active.brief ? `${active.brief.length.toLocaleString()} chars` : "not captured"}</small></article><article><span>DEADLINE</span><strong>{active.dueDate ? safeDateLabel(active.dueDate) : "—"}</strong><small>planner can reuse this</small></article></section><section className="workspaceV35History"><div className="workspaceV35SectionHead"><div><span>03 · RECENT LOCAL ACTIVITY</span><strong>See when the workspace moved</strong></div><small>{active.history.length} events</small></div>{active.history.length ? <div>{[...active.history].reverse().map((row, index) => <article key={`${row.at}-${index}`}><span>{new Date(row.at).toLocaleString()}</span><strong>{row.action}</strong><small>{row.words.toLocaleString()} words</small></article>)}</div> : <p>No capture/restore history yet.</p>}</section></>}
        {notice && <div className="workspaceV35Notice" role="status">{notice}</div>}
        <p className="workspaceV35Boundary">Workspace persistence is convenience storage only. Evidence checks, AI proposals, readiness scores and institutional-policy judgments are intentionally not persisted; re-run them after restoring a draft so the result reflects the current text.</p>
      </div>
    </aside>
  </div>;
}
