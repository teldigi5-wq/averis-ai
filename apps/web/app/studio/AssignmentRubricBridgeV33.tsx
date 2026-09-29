"use client";

import { useEffect } from "react";

function numberFrom(value: string | null | undefined) {
  const match = (value ?? "").match(/\d{1,3}/);
  return match ? Number(match[0]) : 0;
}

export default function AssignmentRubricBridgeV33() {
  useEffect(() => {
    let last = "";
    const publish = () => {
      const rows = Array.from(document.querySelectorAll<HTMLElement>(".assignmentV28RubricList article"));
      if (!rows.length) return;
      const rubric = rows.map((row) => {
        const label = row.querySelector<HTMLElement>("strong")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
        const value = numberFrom(row.querySelector<HTMLElement>("b")?.textContent);
        return { label, weight: value };
      }).filter((item) => item.label);
      const fingerprint = JSON.stringify(rubric);
      if (!rubric.length || fingerprint === last) return;
      last = fingerprint;
      window.dispatchEvent(new CustomEvent("averis:assignment-analysis", { detail: { rubric } }));
    };
    const observer = new MutationObserver(publish);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    publish();
    return () => observer.disconnect();
  }, []);
  return null;
}
