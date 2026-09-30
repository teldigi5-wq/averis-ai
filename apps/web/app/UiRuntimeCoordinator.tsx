"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import CinematicIntroGate from "./CinematicIntroGate";
import IntroLayerIsolation from "./IntroLayerIsolation";
import ReviewCenterV18 from "./ReviewCenterV18";

function routeKey(pathname: string) {
  const clean = pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  if (!clean || clean === "/" || clean.endsWith("/averis-ai")) return "home";
  const parts = clean.split("/").filter(Boolean);
  return parts.at(-1) ?? "home";
}

export default function UiRuntimeCoordinator() {
  const pathname = usePathname();
  const route = routeKey(pathname);
  const home = route === "home";
  const previousPathname = useRef(pathname);

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;

    // Next.js preserves scroll in a few client-navigation paths. Averis has
    // full-height route heroes, so carrying the previous route's scroll offset
    // makes the next screen look visually clipped or layered underneath older
    // chrome. Reset both immediately and on the next paint without moving focus.
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    const html = document.documentElement;
    html.dataset.averisRoute = route;
    return () => {
      if (html.dataset.averisRoute === route) delete html.dataset.averisRoute;
    };
  }, [route]);

  if (!home) return null;

  return (
    <>
      <CinematicIntroGate />
      <IntroLayerIsolation />
      <ReviewCenterV18 />
    </>
  );
}
