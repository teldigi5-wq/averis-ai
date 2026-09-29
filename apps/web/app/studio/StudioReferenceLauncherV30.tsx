"use client";

import { useEffect, useState } from "react";

import CitationReferenceAssistantV30 from "./CitationReferenceAssistantV30";

function compact(text: string | null | undefined) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

export default function StudioReferenceLauncherV30() {
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
    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey || event.key.toLowerCase() !== "r") return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!visible) return null;

  return (
    <>
      <button type="button" className="studioV30ReferenceLauncher" onClick={() => setOpen(true)}>
        <span aria-hidden="true">§</span>
        <div><strong>References</strong><small>Citation audit · Alt + Shift + R</small></div>
      </button>
      <CitationReferenceAssistantV30 open={open} onClose={() => setOpen(false)} />
    </>
  );
}
