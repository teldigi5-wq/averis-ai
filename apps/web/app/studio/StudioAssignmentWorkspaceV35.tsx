"use client";

import { useEffect, useState } from "react";
import AssignmentWorkspaceV35 from "./AssignmentWorkspaceV35";

const ACTIVE_KEY = "averis:assignment-workspace-active:v35";
const HANDOFF_KEY = "averis:dashboard-workspace-handoff:v36";

export default function StudioAssignmentWorkspaceV35() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey || event.key.toLowerCase() !== "w") return;
      const main = document.querySelector<HTMLElement>(".studioV25Scope main");
      if (!main || (main.textContent ?? "").includes("Sign in to review and accept revision proposals")) return;
      event.preventDefault();
      setOpen((current) => !current);
    };

    const handoff = sessionStorage.getItem(HANDOFF_KEY);
    if (handoff) {
      const attemptOpen = () => {
        const main = document.querySelector<HTMLElement>(".studioV25Scope main");
        if (!main || (main.textContent ?? "").includes("Sign in to review and accept revision proposals")) return false;
        if (handoff !== "new") localStorage.setItem(ACTIVE_KEY, handoff);
        sessionStorage.removeItem(HANDOFF_KEY);
        setOpen(true);
        return true;
      };

      if (!attemptOpen()) {
        const timers = [250, 700, 1400].map((delay) => window.setTimeout(attemptOpen, delay));
        window.addEventListener("pagehide", () => timers.forEach((timer) => window.clearTimeout(timer)), { once: true });
      }
    }

    window.addEventListener("averis:workspace-open", onOpen as EventListener);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("averis:workspace-open", onOpen as EventListener);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return <AssignmentWorkspaceV35 open={open} onClose={() => setOpen(false)} />;
}
