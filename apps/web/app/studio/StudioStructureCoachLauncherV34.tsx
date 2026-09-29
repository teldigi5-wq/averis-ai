"use client";

import { useEffect, useState } from "react";
import AcademicStructureCoachV34 from "./AcademicStructureCoachV34";

function compact(value: string | null | undefined) { return (value ?? "").replace(/\s+/g, " ").trim(); }

export default function StudioStructureCoachLauncherV34() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [expectedSections, setExpectedSections] = useState<string[]>([]);

  useEffect(() => {
    let raf = 0;
    const refresh = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const main = document.querySelector<HTMLElement>(".studioV25Scope main");
        const signedOut = compact(main?.textContent).includes("Sign in to review and accept revision proposals");
        setVisible(Boolean(main && !signedOut));
      });
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { window.cancelAnimationFrame(raf); observer.disconnect(); };
  }, []);

  useEffect(() => {
    const onTargets = (event: Event) => {
      const detail = (event as CustomEvent<{ sections?: string[] }>).detail;
      if (Array.isArray(detail?.sections) && detail.sections.length) setExpectedSections(detail.sections.slice(0, 16));
    };
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey || event.key.toLowerCase() !== "t") return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    window.addEventListener("averis:assignment-structure-targets", onTargets as EventListener);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("averis:assignment-structure-targets", onTargets as EventListener);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!visible) return null;
  return <>
    <button type="button" className="studioV34StructureLauncher" onClick={() => setOpen(true)}>
      <span aria-hidden="true">↳</span>
      <div><strong>Structure coach</strong><small>Flow + sections · Alt + Shift + T</small></div>
    </button>
    <AcademicStructureCoachV34 open={open} onClose={() => setOpen(false)} expectedSections={expectedSections}/>
  </>;
}
