"use client";

import { useEffect } from "react";
import type { StructureReadinessSignal } from "./SubmissionReadinessCenterV31";

function numberFrom(value: string | null | undefined) {
  const match = (value ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function readSignal(): StructureReadinessSignal | null {
  const drawer = document.querySelector<HTMLElement>(".structureV34Drawer");
  const hero = drawer?.querySelector<HTMLElement>(".structureV34Hero");
  if (!drawer || !hero) return null;
  const score = numberFrom(hero.querySelector<HTMLElement>(":scope > div:first-child strong")?.textContent);
  const metrics = hero.querySelectorAll<HTMLElement>(".structureV34Metrics article strong");
  if (score === null || metrics.length < 4) return null;
  return {
    seen: true,
    score,
    sections: numberFrom(metrics[0]?.textContent) ?? 0,
    paragraphs: numberFrom(metrics[1]?.textContent) ?? 0,
    transitionGaps: numberFrom(metrics[2]?.textContent) ?? 0,
    missingExpected: numberFrom(metrics[3]?.textContent) ?? 0,
    highAttention: drawer.querySelectorAll('.structureV34FindingGrid article[data-severity="high"]').length,
  };
}

export default function StructureReadinessBridgeV34() {
  useEffect(() => {
    let raf = 0;
    let previous = "";
    const publish = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const signal = readSignal();
        if (!signal) return;
        const key = JSON.stringify(signal);
        if (key === previous) return;
        previous = key;
        window.dispatchEvent(new CustomEvent("averis:structure-coach", { detail: signal }));
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
