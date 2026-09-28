"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { supabase, supabaseConfigured } from "../lib/supabase";
import styles from "./workspace-switcher.module.css";

type IconName = "workspace" | "sources" | "revision" | "refine" | "privacy";

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
    return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18M8 9v11" /></svg>;
  }
  if (name === "sources") {
    return <svg {...common}><path d="M6 5.5h9a3 3 0 0 1 3 3v10H9a3 3 0 0 0-3 3z" /><path d="M6 5.5a3 3 0 0 0-3 3v10h6M10 10h5M10 14h5" /></svg>;
  }
  if (name === "revision") {
    return <svg {...common}><path d="m12 3 1.55 4.45L18 9l-4.45 1.55L12 15l-1.55-4.45L6 9l4.45-1.55z" /><path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8zM5 15.5l.7 1.8 1.8.7-1.8.7L5 20.5l-.7-1.8-1.8-.7 1.8-.7z" /></svg>;
  }
  if (name === "refine") {
    return <svg {...common}><path d="m4 16-1 5 5-1L20 8l-4-4L4 16Z" /><path d="m13 7 4 4M10 18h10" /></svg>;
  }
  return <svg {...common}><path d="M12 3 5 6v5c0 4.6 2.9 7.4 7 9 4.1-1.6 7-4.4 7-9V6z" /><path d="M9.5 11.5 11 13l3.5-3.5" /></svg>;
}

export default function WorkspaceSwitcher() {
  const pathname = usePathname();
  const [ready, setReady] = useState(!supabaseConfigured);
  const [workspaceOpen, setWorkspaceOpen] = useState(!supabaseConfigured);

  const multiSource = pathname === "/multi-source" || pathname.endsWith("/multi-source");
  const revision = pathname === "/revision" || pathname.endsWith("/revision");
  const refine = pathname === "/refine" || pathname.endsWith("/refine");
  const privacy = pathname === "/privacy" || pathname.endsWith("/privacy");
  const main = !multiSource && !revision && !refine && !privacy;

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setReady(true);
      setWorkspaceOpen(true);
      return;
    }

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setWorkspaceOpen(Boolean(data.session?.user));
      setReady(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setWorkspaceOpen(Boolean(session?.user));
      setReady(true);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    if (ready && workspaceOpen) html.dataset.averisWorkspaceOpen = "true";
    else delete html.dataset.averisWorkspaceOpen;
    return () => {
      delete html.dataset.averisWorkspaceOpen;
    };
  }, [ready, workspaceOpen]);

  useEffect(() => {
    const basePath = document.documentElement.dataset.basePath;
    if (!basePath) return;

    document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]').forEach((anchor) => {
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("//") || href === basePath || href.startsWith(`${basePath}/`)) return;
      anchor.setAttribute("href", href === "/" ? `${basePath}/` : `${basePath}${href}`);
    });
  }, [pathname, ready, workspaceOpen]);

  function reopenReviewCenter() {
    window.dispatchEvent(new Event("averis:review-center"));
  }

  if (!ready || !workspaceOpen) return null;

  return (
    <nav className={styles.switcher} aria-label="Averis workspace modules">
      <span className={styles.railBrand} aria-hidden="true" />
      <span className={styles.railDivider} aria-hidden="true" />
      <Link className={main ? styles.active : ""} href="/" aria-current={main ? "page" : undefined} title="Review Center" onClick={reopenReviewCenter}>
        <WorkspaceIcon name="workspace" />
        <span className={styles.label}>Workspace</span>
      </Link>
      <Link className={multiSource ? styles.active : ""} href="/multi-source" aria-current={multiSource ? "page" : undefined} title="Sources">
        <WorkspaceIcon name="sources" />
        <span className={styles.label}>Sources</span>
      </Link>
      <Link className={revision ? styles.active : ""} href="/revision" aria-current={revision ? "page" : undefined} title="Evidence AI">
        <WorkspaceIcon name="revision" />
        <span className={styles.label}>Evidence AI</span>
      </Link>
      <Link className={refine ? styles.active : ""} href="/refine" aria-current={refine ? "page" : undefined} title="Refine writing">
        <WorkspaceIcon name="refine" />
        <span className={styles.label}>Refine</span>
      </Link>
      <Link className={privacy ? styles.active : ""} href="/privacy" aria-current={privacy ? "page" : undefined} title="Privacy">
        <WorkspaceIcon name="privacy" />
        <span className={styles.label}>Privacy</span>
      </Link>
    </nav>
  );
}
