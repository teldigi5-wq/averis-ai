"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { supabase, supabaseConfigured } from "../lib/supabase";
import styles from "./workspace-switcher.module.css";

type IconName = "dashboard" | "workspace" | "sources" | "revision" | "refine" | "privateAi" | "pricing" | "privacy";

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

  if (name === "dashboard") return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></svg>;
  if (name === "workspace") return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18M8 9v11" /></svg>;
  if (name === "sources") return <svg {...common}><path d="M6 5.5h9a3 3 0 0 1 3 3v10H9a3 3 0 0 0-3 3z" /><path d="M6 5.5a3 3 0 0 0-3 3v10h6M10 10h5M10 14h5" /></svg>;
  if (name === "revision") return <svg {...common}><path d="m12 3 1.55 4.45L18 9l-4.45 1.55L12 15l-1.55-4.45L6 9l4.45-1.55z" /><path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8 2.2-2.2-.8 2.2-.8zM5 15.5l.7 1.8 1.8.7-1.8.7L5 20.5l-.7-1.8-1.8-.7 1.8-.7z" /></svg>;
  if (name === "refine") return <svg {...common}><path d="m4 16-1 5 5-1L20 8l-4-4L4 16Z" /><path d="m13 7 4 4M10 18h10" /></svg>;
  if (name === "privateAi") return <svg {...common}><rect x="5" y="5" width="14" height="14" rx="3" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /><path d="m12 8 .9 2.1L15 11l-2.1.9L12 14l-.9-2.1L9 11l2.1-.9z" /></svg>;
  if (name === "pricing") return <svg {...common}><path d="M4 7.5 10.5 3H19a2 2 0 0 1 2 2v8.5L14.5 20 4 9.5Z" /><circle cx="16.5" cy="7.5" r="1.2" /><path d="M8 11h5M10.5 8.5v5" /></svg>;
  return <svg {...common}><path d="M12 3 5 6v5c0 4.6 2.9 7.4 7 9 4.1-1.6 7-4.4 7-9V6z" /><path d="M9.5 11.5 11 13l3.5-3.5" /></svg>;
}

function routeLeaf(pathname: string) {
  const clean = pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  const parts = clean.split("/").filter(Boolean);
  return parts.at(-1) ?? "";
}

export default function WorkspaceSwitcher() {
  const pathname = usePathname();
  const [ready, setReady] = useState(!supabaseConfigured);
  const [workspaceOpen, setWorkspaceOpen] = useState(!supabaseConfigured);

  const leaf = routeLeaf(pathname);
  const dashboard = leaf === "dashboard";
  const multiSource = leaf === "multi-source";
  const revision = leaf === "revision";
  const studio = leaf === "studio";
  const refinePage = leaf === "refine";
  const refine = refinePage || studio;
  const privateAi = leaf === "private-ai";
  const pricing = leaf === "pricing";
  const privacy = leaf === "privacy";
  const main = !dashboard && !multiSource && !revision && !refine && !privateAi && !pricing && !privacy;

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
    return () => { delete html.dataset.averisWorkspaceOpen; };
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

  function reopenReviewCenter() { window.dispatchEvent(new Event("averis:review-center")); }
  function openProductGuide() { window.dispatchEvent(new Event("averis:onboarding-open")); }

  if (!ready || !workspaceOpen) return null;

  return (
    <nav className={styles.switcher} aria-label="Averis workspace modules" data-active-module={studio ? "studio" : leaf || "workspace"}>
      <span className={styles.railBrand} aria-hidden="true" />
      <span className={styles.railDivider} aria-hidden="true" />
      <Link className={dashboard ? styles.active : ""} href="/dashboard" aria-current={dashboard ? "page" : undefined} title="Student Dashboard"><WorkspaceIcon name="dashboard" /><span className={styles.label}>Home</span></Link>
      <Link className={main ? styles.active : ""} href="/" aria-current={main ? "page" : undefined} title="Review Center" onClick={reopenReviewCenter}><WorkspaceIcon name="workspace" /><span className={styles.label}>Workspace</span></Link>
      <Link className={multiSource ? styles.active : ""} href="/multi-source" aria-current={multiSource ? "page" : undefined} title="Sources"><WorkspaceIcon name="sources" /><span className={styles.label}>Sources</span></Link>
      <Link className={revision ? styles.active : ""} href="/revision" aria-current={revision ? "page" : undefined} title="Evidence AI"><WorkspaceIcon name="revision" /><span className={styles.label}>Evidence AI</span></Link>
      <Link className={refine ? styles.active : ""} href={studio ? "/studio" : "/refine"} aria-current={refine ? "page" : undefined} title={studio ? "Revision Studio" : "Refine writing"}><WorkspaceIcon name="refine" /><span className={styles.label}>{studio ? "Studio" : "Refine"}</span></Link>
      <Link className={privateAi ? styles.active : ""} href="/private-ai" aria-current={privateAi ? "page" : undefined} title="Private AI"><WorkspaceIcon name="privateAi" /><span className={styles.label}>Private AI</span></Link>
      <Link className={pricing ? styles.active : ""} href="/pricing" aria-current={pricing ? "page" : undefined} title="Student pricing"><WorkspaceIcon name="pricing" /><span className={styles.label}>Pricing</span></Link>
      <Link className={privacy ? styles.active : ""} href="/privacy" aria-current={privacy ? "page" : undefined} title="Privacy"><WorkspaceIcon name="privacy" /><span className={styles.label}>Privacy</span></Link>
      <span className={styles.railSpacer} aria-hidden="true" />
      <button className={styles.guideButton} type="button" onClick={openProductGuide} aria-label="Open Averis product guide" title="Product guide">?</button>
    </nav>
  );
}
