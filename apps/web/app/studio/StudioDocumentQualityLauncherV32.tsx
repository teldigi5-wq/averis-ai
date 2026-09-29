"use client";

import { useEffect, useState } from "react";

import DocumentQualityCenterV32, { type DocumentQualitySignal } from "./DocumentQualityCenterV32";

function compact(text: string | null | undefined) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

export default function StudioDocumentQualityLauncherV32() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [lastSignal, setLastSignal] = useState<DocumentQualitySignal | null>(null);

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
      if (!event.altKey || !event.shiftKey || event.key.toLowerCase() !== "q") return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const onSignal = (signal: DocumentQualitySignal) => {
    setLastSignal(signal);
    window.dispatchEvent(new CustomEvent("averis:document-quality", { detail: signal }));
  };

  if (!visible) return null;

  return (
    <>
      <button type="button" className="studioV32QualityLauncher" onClick={() => setOpen(true)}>
        <span aria-hidden="true">¶</span>
        <div>
          <strong>Document quality</strong>
          <small>{lastSignal ? `${lastSignal.score}/100 · ${lastSignal.issues} findings` : "Structure audit · Alt + Shift + Q"}</small>
        </div>
      </button>
      <DocumentQualityCenterV32 open={open} onClose={() => setOpen(false)} onSignal={onSignal} />
    </>
  );
}
