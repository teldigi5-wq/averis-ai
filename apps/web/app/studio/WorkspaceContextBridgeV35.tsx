"use client";

import { useEffect, useRef } from "react";

function setNativeInput(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

export default function WorkspaceContextBridgeV35() {
  const pendingBrief = useRef("");
  const pendingReferences = useRef("");
  const pendingDeadline = useRef("");
  const lastBrief = useRef("");
  const lastReferences = useRef("");
  const lastDeadline = useRef("");

  useEffect(() => {
    let raf = 0;
    const sync = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const briefField = document.querySelector<HTMLTextAreaElement>(".assignmentV28Drawer textarea");
        if (briefField) {
          if (pendingBrief.current && briefField.value !== pendingBrief.current) {
            setNativeInput(briefField, pendingBrief.current);
            pendingBrief.current = "";
          }
          if (briefField.value !== lastBrief.current) {
            lastBrief.current = briefField.value;
            window.dispatchEvent(new CustomEvent("averis:assignment-brief-state", { detail: { brief: briefField.value } }));
          }
        }

        const citationFields = document.querySelectorAll<HTMLTextAreaElement>(".citationV30Drawer textarea");
        const bibliography = citationFields[1] ?? null;
        if (bibliography) {
          if (pendingReferences.current && bibliography.value !== pendingReferences.current) {
            setNativeInput(bibliography, pendingReferences.current);
            pendingReferences.current = "";
          }
          if (bibliography.value !== lastReferences.current) {
            lastReferences.current = bibliography.value;
            window.dispatchEvent(new CustomEvent("averis:references-state", { detail: { references: bibliography.value } }));
          }
        }

        const deadline = document.querySelector<HTMLInputElement>('.plannerV29Drawer input[type="date"]');
        if (deadline) {
          if (pendingDeadline.current && deadline.value !== pendingDeadline.current) {
            setNativeInput(deadline, pendingDeadline.current);
            pendingDeadline.current = "";
          }
          if (deadline.value !== lastDeadline.current) {
            lastDeadline.current = deadline.value;
            window.dispatchEvent(new CustomEvent("averis:planner-deadline-state", { detail: { dueDate: deadline.value } }));
          }
        }
      });
    };

    const onBrief = (event: Event) => {
      pendingBrief.current = String((event as CustomEvent<{ brief?: string }>).detail?.brief ?? "").slice(0, 16000);
      sync();
    };
    const onReferences = (event: Event) => {
      pendingReferences.current = String((event as CustomEvent<{ references?: string }>).detail?.references ?? "").slice(0, 30000);
      sync();
    };
    const onDeadline = (event: Event) => {
      const value = String((event as CustomEvent<{ dueDate?: string }>).detail?.dueDate ?? "");
      pendingDeadline.current = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
      sync();
    };

    window.addEventListener("averis:workspace-brief", onBrief as EventListener);
    window.addEventListener("averis:workspace-references", onReferences as EventListener);
    window.addEventListener("averis:workspace-deadline", onDeadline as EventListener);
    document.addEventListener("input", sync, true);
    document.addEventListener("change", sync, true);
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();

    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("input", sync, true);
      document.removeEventListener("change", sync, true);
      window.removeEventListener("averis:workspace-brief", onBrief as EventListener);
      window.removeEventListener("averis:workspace-references", onReferences as EventListener);
      window.removeEventListener("averis:workspace-deadline", onDeadline as EventListener);
    };
  }, []);

  return null;
}
