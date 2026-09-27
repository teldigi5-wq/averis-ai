"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./workspace-switcher.module.css";

export default function WorkspaceSwitcher() {
  const pathname = usePathname();
  const multiSource = pathname === "/multi-source" || pathname.endsWith("/multi-source");
  const privacy = pathname === "/privacy" || pathname.endsWith("/privacy");
  const main = !multiSource && !privacy;

  return (
    <nav className={styles.switcher} aria-label="Averis workspace switcher">
      <Link className={main ? styles.active : ""} href="/">
        <span>◎</span> Main workspace
      </Link>
      <Link className={multiSource ? styles.active : ""} href="/multi-source">
        <span>≋</span> Multi-source
      </Link>
      <Link className={privacy ? styles.active : ""} href="/privacy">
        <span>◈</span> Privacy
      </Link>
    </nav>
  );
}
