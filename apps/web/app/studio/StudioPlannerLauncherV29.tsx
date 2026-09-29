"use client";

import { useEffect, useState } from "react";

import StudentWorkloadPlannerV29 from "./StudentWorkloadPlannerV29";

function compact(text: string | null | undefined) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function wordCount(text: string) {
  const value = compact(text);
  return value ? value.split(" ").length : 0;
}

export default function StudioPlannerLauncherV29() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [draftWords, setDraftWords] = useState(0);

  useEffect(() => {
    let raf = 0;
    const refresh = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const main = document.querySelector<HTMLElement>(".studioV25Scope main");
        const draft = document.querySelector<HTMLTextAreaElement>('textarea[maxlength="12000"]');
        const signedOut = compact(main?.textContent).includes("Sign in to review and accept revision proposals");
        setVisible(Boolean(main && !signedOut));
        setDraftWords(wordCount(draft?.value ?? ""));
      });
    };

    refresh();
    document.addEventListener("input", refresh, true);
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener("input", refresh, true);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey || event.key.toLowerCase() !== "p") return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!visible) return null;

  return (
    <>
      <button type="button" className="studioV29PlannerLauncher" onClick={() => setOpen(true)}>
        <span aria-hidden="true">⌁</span>
        <div><strong>Workload planner</strong><small>{draftWords.toLocaleString()} words · Alt + Shift + P</small></div>
      </button>
      <StudentWorkloadPlannerV29 open={open} onClose={() => setOpen(false)} currentDraftWords={draftWords} />
    </>
  );
}
