"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { supabase, supabaseConfigured } from "../../lib/supabase";
import styles from "./student-dashboard-v36.module.css";

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

type ActivityRow = HistoryRow & { workspaceId: string; title: string };

const STORAGE_KEY = "averis:assignment-workspaces:v35";
const ACTIVE_KEY = "averis:assignment-workspace-active:v35";
const HANDOFF_KEY = "averis:dashboard-workspace-handoff:v36";

function compact(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function wordCount(value: string) {
  const text = compact(value);
  return text ? text.split(" ").length : 0;
}

function referenceCount(value: string) {
  const text = value.replace(/\r/g, "").trim();
  if (!text) return 0;
  const blocks = text.split(/\n\s*\n+/).filter((item) => compact(item));
  if (blocks.length > 1) return blocks.length;
  const lines = text.split("\n").filter((item) => compact(item).length >= 10);
  return lines.length || 1;
}

function readWorkspaces(): AssignmentWorkspace[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 8).map((item): AssignmentWorkspace | null => {
      if (!item || typeof item !== "object") return null;
      const id = typeof item.id === "string" ? item.id : "";
      if (!id) return null;
      return {
        id,
        title: String(item.title ?? "Untitled assignment").slice(0, 120),
        module: String(item.module ?? "").slice(0, 100),
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(item.dueDate ?? "")) ? String(item.dueDate) : "",
        wordTarget: Number.isFinite(Number(item.wordTarget)) && Number(item.wordTarget) >= 100 ? Math.round(Number(item.wordTarget)) : null,
        brief: String(item.brief ?? "").slice(0, 16000),
        draft: String(item.draft ?? "").slice(0, 12000),
        source: String(item.source ?? "").slice(0, 40000),
        references: String(item.references ?? "").slice(0, 30000),
        notes: String(item.notes ?? "").slice(0, 5000),
        autosave: item.autosave !== false,
        createdAt: String(item.createdAt ?? ""),
        updatedAt: String(item.updatedAt ?? item.createdAt ?? ""),
        history: Array.isArray(item.history)
          ? item.history.slice(-8).map((row: Partial<HistoryRow>) => ({
              at: String(row.at ?? ""),
              action: String(row.action ?? "Saved").slice(0, 80),
              words: Number(row.words ?? 0) || 0,
            }))
          : [],
      };
    }).filter((item): item is AssignmentWorkspace => Boolean(item));
  } catch {
    return [];
  }
}

function localStartOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function dueDateValue(value: string) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(value: string) {
  const due = dueDateValue(value);
  if (!due) return null;
  const delta = due.getTime() - localStartOfToday().getTime();
  return Math.round(delta / 86_400_000);
}

function dueLabel(value: string) {
  const days = daysUntil(value);
  if (days === null) return "No deadline";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `${days} days left`;
}

function formatDate(value: string) {
  const date = dueDateValue(value);
  if (!date) return "No deadline";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function relativeActivity(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 2) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function workspaceSetup(workspace: AssignmentWorkspace) {
  const checks = [
    Boolean(compact(workspace.brief)),
    wordCount(workspace.draft) >= 50,
    Boolean(workspace.wordTarget),
    Boolean(workspace.dueDate),
    referenceCount(workspace.references) > 0,
    Boolean(compact(workspace.module)),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function draftProgress(workspace: AssignmentWorkspace) {
  if (!workspace.wordTarget) return null;
  return Math.min(100, Math.round((wordCount(workspace.draft) / workspace.wordTarget) * 100));
}

function nextAction(workspace: AssignmentWorkspace) {
  const words = wordCount(workspace.draft);
  const refs = referenceCount(workspace.references);
  if (!compact(workspace.brief)) return "Add assignment brief";
  if (words < 50) return "Start the draft";
  if (workspace.wordTarget && words < Math.max(100, Math.round(workspace.wordTarget * 0.65))) return "Continue drafting";
  if (refs === 0) return "Connect references";
  return "Re-run evidence & readiness";
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function StudentDashboardV36() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [signedIn, setSignedIn] = useState(!supabaseConfigured);
  const [displayName, setDisplayName] = useState("");
  const [workspaces, setWorkspaces] = useState<AssignmentWorkspace[]>([]);
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setAuthReady(true);
      setSignedIn(true);
      return;
    }

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const user = data.session?.user ?? null;
      setSignedIn(Boolean(user));
      setDisplayName(String(user?.user_metadata?.display_name ?? user?.user_metadata?.name ?? ""));
      setAuthReady(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setSignedIn(Boolean(session?.user));
      setDisplayName(String(session?.user?.user_metadata?.display_name ?? session?.user?.user_metadata?.name ?? ""));
      setAuthReady(true);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !signedIn) return;
    const refresh = () => {
      const items = readWorkspaces();
      setWorkspaces(items);
      const remembered = localStorage.getItem(ACTIVE_KEY) ?? "";
      setActiveId(items.some((item) => item.id === remembered) ? remembered : items[0]?.id ?? "");
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [authReady, signedIn]);

  const sorted = useMemo(() => [...workspaces].sort((left, right) => {
    const leftDays = daysUntil(left.dueDate);
    const rightDays = daysUntil(right.dueDate);
    const leftRank = leftDays === null ? Number.MAX_SAFE_INTEGER : leftDays < 0 ? 10_000 + Math.abs(leftDays) : leftDays;
    const rightRank = rightDays === null ? Number.MAX_SAFE_INTEGER : rightDays < 0 ? 10_000 + Math.abs(rightDays) : rightDays;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  }), [workspaces]);

  const activeWorkspace = useMemo(() => workspaces.find((workspace) => workspace.id === activeId) ?? null, [activeId, workspaces]);
  const focusWorkspace = sorted.find((workspace) => {
    const days = daysUntil(workspace.dueDate);
    return days === null || days >= 0;
  }) ?? sorted[0] ?? null;

  const dueSoon = workspaces.filter((workspace) => {
    const days = daysUntil(workspace.dueDate);
    return days !== null && days >= 0 && days <= 7;
  }).length;
  const overdue = workspaces.filter((workspace) => {
    const days = daysUntil(workspace.dueDate);
    return days !== null && days < 0;
  }).length;
  const totalWords = workspaces.reduce((sum, workspace) => sum + wordCount(workspace.draft), 0);
  const totalReferences = workspaces.reduce((sum, workspace) => sum + referenceCount(workspace.references), 0);

  const activity = useMemo<ActivityRow[]>(() => workspaces
    .flatMap((workspace) => workspace.history.map((row) => ({ ...row, workspaceId: workspace.id, title: workspace.title })))
    .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
    .slice(0, 7), [workspaces]);

  const sevenDayCaptures = useMemo(() => {
    const threshold = Date.now() - 7 * 86_400_000;
    return workspaces.flatMap((workspace) => workspace.history).filter((row) => {
      const time = new Date(row.at).getTime();
      return Number.isFinite(time) && time >= threshold;
    }).length;
  }, [workspaces]);

  function continueWorkspace(workspace: AssignmentWorkspace) {
    localStorage.setItem(ACTIVE_KEY, workspace.id);
    sessionStorage.setItem(HANDOFF_KEY, workspace.id);
    setActiveId(workspace.id);
    router.push("/studio");
  }

  function openNewWorkspace() {
    sessionStorage.setItem(HANDOFF_KEY, "new");
    router.push("/studio");
  }

  if (!authReady) {
    return (
      <main className={styles.shell}>
        <section className={styles.loading} aria-live="polite">
          <span>AVERIS · STUDENT DASHBOARD V36</span>
          <strong>Preparing your private workspace overview…</strong>
        </section>
      </main>
    );
  }

  if (!signedIn) {
    return (
      <main className={styles.shell}>
        <section className={styles.signedOut}>
          <span>AVERIS · STUDENT DASHBOARD V36</span>
          <h1>Your assignment overview stays behind your Averis session.</h1>
          <p>Login before Averis reads assignment workspace data from this browser profile. This helps avoid exposing locally saved academic work on a shared device.</p>
          <div>
            <button type="button">Login</button>
            <Link href="/">Back to Review Center</Link>
          </div>
        </section>
      </main>
    );
  }

  const name = compact(displayName).split(" ")[0] || "student";

  return (
    <main className={styles.shell}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span>AVERIS · STUDENT DASHBOARD V36</span>
          <h1>{greeting()}, {name}.</h1>
          <p>See what needs attention across your assignments without turning old checks into fresh claims. Drafts, deadlines and local workspace facts stay visible; evidence and readiness are re-run when you need them.</p>
          <div className={styles.heroActions}>
            {focusWorkspace ? (
              <button type="button" onClick={() => continueWorkspace(focusWorkspace)}>Continue priority assignment</button>
            ) : (
              <button type="button" onClick={openNewWorkspace}>Create first assignment workspace</button>
            )}
            <Link href="/studio">Open Revision Studio</Link>
          </div>
        </div>

        <div className={styles.focusCard}>
          <span>TODAY&apos;S FOCUS</span>
          {focusWorkspace ? (
            <>
              <strong>{focusWorkspace.title}</strong>
              <p>{focusWorkspace.module || "Module not set"} · {dueLabel(focusWorkspace.dueDate)}</p>
              <div className={styles.focusMeta}>
                <div><b>{wordCount(focusWorkspace.draft).toLocaleString()}</b><small>draft words</small></div>
                <div><b>{referenceCount(focusWorkspace.references)}</b><small>references</small></div>
                <div><b>{workspaceSetup(focusWorkspace)}%</b><small>workspace setup</small></div>
              </div>
              <button type="button" onClick={() => continueWorkspace(focusWorkspace)}>{nextAction(focusWorkspace)}</button>
            </>
          ) : (
            <>
              <strong>No assignment workspace yet</strong>
              <p>Create one in Studio to keep the brief, draft, deadline and references together in this browser.</p>
              <button type="button" onClick={openNewWorkspace}>Start workspace</button>
            </>
          )}
        </div>
      </section>

      <section className={styles.privacyStrip} aria-label="Dashboard privacy boundary">
        <div><span aria-hidden="true">◆</span><strong>Local-first overview</strong></div>
        <p>Assignment workspace content is read from this browser profile. v36 adds no new cloud storage, no Groq call and no persisted evidence score.</p>
        <Link href="/privacy">Privacy controls</Link>
      </section>

      <section className={styles.metrics} aria-label="Assignment overview metrics">
        <article><span>ASSIGNMENTS</span><strong>{workspaces.length}</strong><small>{workspaces.length === 1 ? "local workspace" : "local workspaces"}</small></article>
        <article data-tone={dueSoon > 0 ? "attention" : "calm"}><span>DUE IN 7 DAYS</span><strong>{dueSoon}</strong><small>{overdue ? `${overdue} overdue also needs review` : "upcoming deadlines"}</small></article>
        <article><span>DRAFT WORDS</span><strong>{totalWords.toLocaleString()}</strong><small>across saved assignments</small></article>
        <article><span>REFERENCES</span><strong>{totalReferences}</strong><small>saved bibliography entries</small></article>
        <article><span>7-DAY MOMENTUM</span><strong>{sevenDayCaptures}</strong><small>local workspace events</small></article>
      </section>

      <div className={styles.dashboardGrid}>
        <section className={styles.assignmentsPanel}>
          <div className={styles.sectionHead}>
            <div><span>ASSIGNMENT RADAR</span><h2>Know where to return next.</h2></div>
            <button type="button" onClick={openNewWorkspace}>+ New workspace</button>
          </div>

          {sorted.length ? (
            <div className={styles.assignmentList}>
              {sorted.map((workspace) => {
                const words = wordCount(workspace.draft);
                const refs = referenceCount(workspace.references);
                const setup = workspaceSetup(workspace);
                const progress = draftProgress(workspace);
                const due = daysUntil(workspace.dueDate);
                const isActive = workspace.id === activeWorkspace?.id;
                return (
                  <article key={workspace.id} className={styles.assignmentCard} data-active={isActive ? "true" : "false"}>
                    <div className={styles.assignmentTop}>
                      <div>
                        <span>{workspace.module || "MODULE NOT SET"}</span>
                        <strong>{workspace.title}</strong>
                      </div>
                      <b data-state={due !== null && due < 0 ? "overdue" : due !== null && due <= 7 ? "soon" : "normal"}>{dueLabel(workspace.dueDate)}</b>
                    </div>
                    <div className={styles.assignmentStats}>
                      <span><b>{words.toLocaleString()}</b><small>words</small></span>
                      <span><b>{refs}</b><small>references</small></span>
                      <span><b>{setup}%</b><small>setup</small></span>
                      <span><b>{progress === null ? "—" : `${progress}%`}</b><small>word target</small></span>
                    </div>
                    <div className={styles.assignmentProgress} aria-label={`Workspace setup ${setup}%`}><i style={{ width: `${setup}%` }} /></div>
                    <div className={styles.assignmentBottom}>
                      <div><span>NEXT</span><strong>{nextAction(workspace)}</strong><small>{workspace.dueDate ? formatDate(workspace.dueDate) : "Add a deadline to improve planning"}</small></div>
                      <button type="button" onClick={() => continueWorkspace(workspace)}>Continue in Studio</button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <span>NO LOCAL ASSIGNMENTS YET</span>
              <strong>Start with the assignment brief.</strong>
              <p>Revision Studio can keep a brief, draft, source context, bibliography, deadline and notes together as one local assignment workspace.</p>
              <button type="button" onClick={openNewWorkspace}>Create assignment workspace</button>
            </div>
          )}
        </section>

        <aside className={styles.sideColumn}>
          <section className={styles.quickPanel}>
            <div className={styles.sectionHead}><div><span>QUICK START</span><h2>Jump to the right tool.</h2></div></div>
            <div className={styles.quickGrid}>
              <Link href="/studio"><b>Revision Studio</b><span>Draft → evidence → proposal → source review</span><i>01</i></Link>
              <Link href="/multi-source"><b>Source Finder</b><span>Search scholarly metadata and resolve DOI records</span><i>02</i></Link>
              <Link href="/revision"><b>Evidence AI</b><span>Review source evidence without misconduct labels</span><i>03</i></Link>
              <Link href="/"><b>Review Center</b><span>Similarity evidence, references and scan history</span><i>04</i></Link>
            </div>
          </section>

          <section className={styles.boundaryPanel}>
            <span>ACADEMIC BOUNDARY</span>
            <strong>No grade or Turnitin prediction.</strong>
            <p>The dashboard prioritizes student-owned workflow facts. It does not predict grades, misconduct, AI-detector outcomes or whether a submission will “pass” Turnitin.</p>
          </section>
        </aside>
      </div>

      <div className={styles.lowerGrid}>
        <section className={styles.timelinePanel}>
          <div className={styles.sectionHead}><div><span>DEADLINE VIEW</span><h2>Upcoming workload.</h2></div></div>
          {sorted.some((workspace) => workspace.dueDate) ? (
            <div className={styles.timeline}>
              {sorted.filter((workspace) => workspace.dueDate).slice(0, 6).map((workspace) => {
                const due = daysUntil(workspace.dueDate);
                return (
                  <button type="button" key={workspace.id} onClick={() => continueWorkspace(workspace)}>
                    <span data-state={due !== null && due < 0 ? "overdue" : due !== null && due <= 7 ? "soon" : "normal"} />
                    <div><strong>{workspace.title}</strong><small>{workspace.module || "Module not set"}</small></div>
                    <b>{dueLabel(workspace.dueDate)}</b>
                  </button>
                );
              })}
            </div>
          ) : <p className={styles.panelEmpty}>Add deadlines inside Assignment Workspace to build this timeline.</p>}
        </section>

        <section className={styles.activityPanel}>
          <div className={styles.sectionHead}><div><span>RECENT LOCAL ACTIVITY</span><h2>Pick up where you stopped.</h2></div></div>
          {activity.length ? (
            <div className={styles.activityList}>
              {activity.map((row, index) => (
                <button type="button" key={`${row.workspaceId}-${row.at}-${index}`} onClick={() => {
                  const workspace = workspaces.find((item) => item.id === row.workspaceId);
                  if (workspace) continueWorkspace(workspace);
                }}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{row.action}</strong><small>{row.title} · {row.words.toLocaleString()} words</small></div>
                  <b>{relativeActivity(row.at)}</b>
                </button>
              ))}
            </div>
          ) : <p className={styles.panelEmpty}>Workspace capture and restore events will appear here.</p>}
        </section>
      </div>

      <footer className={styles.footer}>
        <span>AVERIS STUDENT DASHBOARD · V36</span>
        <p>Local assignment facts are useful for continuity; evidence, citation quality and submission readiness still need fresh review against the current document.</p>
        <Link href="/studio">Open Studio →</Link>
      </footer>
    </main>
  );
}
