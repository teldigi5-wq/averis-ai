"use client";

import { useEffect } from "react";

function syncWorkspaceProgressSemantics() {
  document.querySelectorAll<HTMLElement>('[aria-label^="Workspace setup "]').forEach((element) => {
    const label = element.getAttribute("aria-label") ?? "";
    const match = label.match(/Workspace setup\s+(\d{1,3})%/i);
    const value = Math.max(0, Math.min(100, Number(match?.[1] ?? 0)));
    element.setAttribute("role", "progressbar");
    element.setAttribute("aria-valuemin", "0");
    element.setAttribute("aria-valuemax", "100");
    element.setAttribute("aria-valuenow", String(value));
  });
}

export default function DashboardProgressSemanticsV36() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncWorkspaceProgressSemantics);
    };

    syncWorkspaceProgressSemantics();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return null;
}
