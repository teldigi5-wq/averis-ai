"use client";

import { useEffect } from "react";

export default function IntroLayerIsolation() {
  useEffect(() => {
    const root = document.documentElement;

    const sync = () => {
      const visible = Boolean(document.querySelector('[aria-label="Averis product introduction"]'));
      root.toggleAttribute("data-averis-intro-visible", visible);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      root.removeAttribute("data-averis-intro-visible");
    };
  }, []);

  return null;
}
