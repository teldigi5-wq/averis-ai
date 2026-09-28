"use client";

import { useEffect, useState } from "react";
import AssignmentWorkspaceV35 from "./AssignmentWorkspaceV35";

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
    window.addEventListener("averis:workspace-open", onOpen as EventListener);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("averis:workspace-open", onOpen as EventListener);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return <AssignmentWorkspaceV35 open={open} onClose={() => setOpen(false)} />;
}
