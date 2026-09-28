"use client";

import { useEffect } from "react";

function updateCommandActionLabel() {
  const button = document.querySelector<HTMLButtonElement>(".studioV27Command__primary");
  if (!button) return;
  const visible = (button.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!visible) return;
  button.setAttribute("aria-label", `Studio next action: ${visible}`);
}

export default function StudioCommandAccessibilityV29() {
  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(updateCommandActionLabel);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return null;
}
