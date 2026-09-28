"use client";

import { useEffect, useState } from "react";
import RubricClaimCoverageV33 from "./RubricClaimCoverageV33";

function compact(value: string | null | undefined) { return (value ?? "").replace(/\s+/g, " ").trim(); }

export default function StudioRubricCoverageLauncherV33() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);

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
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey || event.key.toLowerCase() !== "m") return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!visible) return null;
  return (
    <>
      <button type="button" className="studioV33RubricLauncher" onClick={() => setOpen(true)}>
        <span aria-hidden="true">▦</span>
        <div><strong>Rubric coverage</strong><small>Claims + evidence · Alt + Shift + M</small></div>
      </button>
      <RubricClaimCoverageV33 open={open} onClose={() => setOpen(false)} />
    </>
  );
}
