"use client";

import { useEffect } from "react";

function compact(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function readSections() {
  const drawer = document.querySelector<HTMLElement>(".assignmentV28Drawer");
  if (!drawer) return [] as string[];
  const values = Array.from(drawer.querySelectorAll<HTMLElement>("strong"))
    .map((node) => compact(node.textContent))
    .filter((value) => /^include\s+/i.test(value))
    .map((value) => value.replace(/^include\s+/i, "").trim())
    .filter(Boolean);
  return [...new Set(values)].slice(0, 16);
}

export default function AssignmentStructureBridgeV34() {
  useEffect(() => {
    let previous = "";
    let raf = 0;
    const publish = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const sections = readSections();
        const key = sections.join("|").toLowerCase();
        if (!sections.length || key === previous) return;
        previous = key;
        window.dispatchEvent(new CustomEvent("averis:assignment-structure-targets", { detail: { sections } }));
      });
    };
    publish();
    const observer = new MutationObserver(publish);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);
  return null;
}
