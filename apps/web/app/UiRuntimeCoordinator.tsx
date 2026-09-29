"use client";

import { useEffect } from "react";
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
