"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

import styles from "./workspace-switcher.module.css";

export default function WorkspaceSwitcher() {
  const pathname = usePathname();
  const multiSource = pathname === "/multi-source" || pathname.endsWith("/multi-source");
  const revision = pathname === "/revision" || pathname.endsWith("/revision");
  const privacy = pathname === "/privacy" || pathname.endsWith("/privacy");
  const main = !multiSource && !revision && !privacy;

  useEffect(() => {
    const basePath = document.documentElement.dataset.basePath;
    if (!basePath) return;

    document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]').forEach((anchor) => {
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("//") || href === basePath || href.startsWith(`${basePath}/`)) return;
      anchor.setAttribute("href", href === "/" ? `${basePath}/` : `${basePath}${href}`);
    });
  }, [pathname]);

  return (
    <nav className={styles.switcher} aria-label="Averis workspace switcher">
      <Link className={main ? styles.active : ""} href="/">
        <span>◎</span> Main
      </Link>
      <Link className={multiSource ? styles.active : ""} href="/multi-source">
        <span>≋</span> Multi-source
      </Link>
      <Link className={revision ? styles.active : ""} href="/revision">
        <span>✦</span> Revision AI
      </Link>
      <Link className={privacy ? styles.active : ""} href="/privacy">
        <span>◈</span> Privacy
      </Link>
    </nav>
  );
}
