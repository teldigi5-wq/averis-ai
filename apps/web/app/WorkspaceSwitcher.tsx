"use client";

import { usePathname } from "next/navigation";

import styles from "./workspace-switcher.module.css";

export default function WorkspaceSwitcher() {
  const pathname = usePathname();
  const multiSource = pathname.startsWith("/multi-source");
  const privacy = pathname.startsWith("/privacy");
  const main = !multiSource && !privacy;

  return (
    <nav className={styles.switcher} aria-label="Averis workspace switcher">
      <a className={main ? styles.active : ""} href="/">
        <span>◎</span> Main workspace
      </a>
      <a className={multiSource ? styles.active : ""} href="/multi-source">
        <span>≋</span> Multi-source
      </a>
      <a className={privacy ? styles.active : ""} href="/privacy">
        <span>◈</span> Privacy
      </a>
    </nav>
  );
}
