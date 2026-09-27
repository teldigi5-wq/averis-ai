"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

import styles from "./workspace-switcher.module.css";

type IconName = "workspace" | "sources" | "revision" | "privacy";

function WorkspaceIcon({ name }: { name: IconName }) {
  const common = {
    className: styles.icon,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "workspace") {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="M3 9h18M8 9v11" />
      </svg>
    );
  }

  if (name === "sources") {
    return (
      <svg {...common}>
        <path d="M6 5.5h9a3 3 0 0 1 3 3v10H9a3 3 0 0 0-3 3z" />
        <path d="M6 5.5a3 3 0 0 0-3 3v10h6M10 10h5M10 14h5" />
      </svg>
    );
  }

  if (name === "revision") {
    return (
      <svg {...common}>
        <path d="m12 3 1.55 4.45L18 9l-4.45 1.55L12 15l-1.55-4.45L6 9l4.45-1.55z" />
        <path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8zM5 15.5l.7 1.8 1.8.7-1.8.7L5 20.5l-.7-1.8-1.8-.7 1.8-.7z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M12 3 5 6v5c0 4.6 2.9 7.4 7 9 4.1-1.6 7-4.4 7-9V6z" />
      <path d="M9.5 11.5 11 13l3.5-3.5" />
    </svg>
  );
}

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
      <Link className={main ? styles.active : ""} href="/" aria-current={main ? "page" : undefined}>
        <WorkspaceIcon name="workspace" />
        <span className={styles.label}>Main workspace</span>
      </Link>
      <Link className={multiSource ? styles.active : ""} href="/multi-source" aria-current={multiSource ? "page" : undefined}>
        <WorkspaceIcon name="sources" />
        <span className={styles.label}>Multi-source</span>
      </Link>
      <Link className={revision ? styles.active : ""} href="/revision" aria-current={revision ? "page" : undefined}>
        <WorkspaceIcon name="revision" />
        <span className={styles.label}>Revision AI</span>
      </Link>
      <Link className={privacy ? styles.active : ""} href="/privacy" aria-current={privacy ? "page" : undefined}>
        <WorkspaceIcon name="privacy" />
        <span className={styles.label}>Privacy</span>
      </Link>
    </nav>
  );
}
