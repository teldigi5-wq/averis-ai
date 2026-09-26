"use client";

import { usePathname } from "next/navigation";

import styles from "./workspace-switcher.module.css";

export default function WorkspaceSwitcher() {
  const pathname = usePathname();
  const multiSource = pathname.startsWith("/multi-source");

  return (
    <nav className={styles.switcher} aria-label="Averis workspace switcher">
      <a className={!multiSource ? styles.active : ""} href="/">
        <span>◎</span> Main workspace
      </a>
      <a className={multiSource ? styles.active : ""} href="/multi-source">
        <span>≋</span> Multi-source
      </a>
    </nav>
  );
}
