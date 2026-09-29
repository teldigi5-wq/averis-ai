"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "averis:assignment-workspaces:v35";
const ACTIVE_KEY = "averis:assignment-workspace-active:v35";

function compact(value: string | null | undefined) { return (value ?? "").replace(/\s+/g, " ").trim(); }
function readActive() {
  try {
    const rows = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(rows)) return null;
    const activeId = localStorage.getItem(ACTIVE_KEY) ?? "";
    return rows.find((row) => row?.id === activeId) ?? rows[0] ?? null;
  } catch { return null; }
}

export default function StudioWorkspaceLauncherV35() {
  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState("Create local assignment workspace");
  const [meta, setMeta] = useState("Brief · draft · sources · references · deadline");

  useEffect(() => {
    let raf = 0;
    const refresh = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const main = document.querySelector<HTMLElement>(".studioV25Scope main");
        setVisible(Boolean(main && !compact(main.textContent).includes("Sign in to review and accept revision proposals")));
        const active = readActive();
        if (active) {
          setLabel(compact(active.title) || "Untitled assignment");
          const module = compact(active.module);
          const words = compact(active.draft).split(" ").filter(Boolean).length;
          setMeta(`${module ? `${module} · ` : ""}${words.toLocaleString()} saved words · local browser workspace`);
        } else {
          setLabel("Create local assignment workspace");
          setMeta("Brief · draft · sources · references · deadline");
        }
      });
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("storage", refresh);
    window.addEventListener("averis:workspace-restored", refresh as EventListener);
    document.addEventListener("input", refresh, true);
    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("storage", refresh);
      window.removeEventListener("averis:workspace-restored", refresh as EventListener);
      document.removeEventListener("input", refresh, true);
    };
  }, []);

  if (!visible) return null;
  return <button type="button" className="studioV35WorkspaceLauncher" onClick={() => window.dispatchEvent(new Event("averis:workspace-open"))} aria-label={`Open Assignment Workspace: ${label}`}>
    <span aria-hidden="true">▣</span>
    <div><small>ASSIGNMENT WORKSPACE · ALT + SHIFT + W</small><strong>{label}</strong><p>{meta}</p></div>
    <b>Open workspace</b>
  </button>;
}
