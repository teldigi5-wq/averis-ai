"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useAveris2Account } from "./Averis2AccountProvider";
import styles from "./averis2.module.css";

type IconName = "overview" | "review" | "documents" | "sources" | "citations" | "history" | "settings" | "help";
type NavItem = { label: string; href: string; icon: IconName };

const desktopNavigation: NavItem[] = [
  { label: "Overview", href: "/v2", icon: "overview" },
  { label: "New Review", href: "/v2/new-review", icon: "review" },
  { label: "Documents", href: "/v2/documents", icon: "documents" },
  { label: "Sources", href: "/v2/sources", icon: "sources" },
  { label: "Citations", href: "/v2/citations", icon: "citations" },
  { label: "History", href: "/v2/history", icon: "history" },
];
const utilityNavigation: NavItem[] = [
  { label: "Settings", href: "/v2/settings", icon: "settings" },
  { label: "Help", href: "/v2/help", icon: "help" },
];
const mobileNavigation: Array<NavItem & { mobileLabel: string }> = [
  { label: "Overview", mobileLabel: "Home", href: "/v2", icon: "overview" },
  { label: "History", mobileLabel: "Reviews", href: "/v2/history", icon: "history" },
  { label: "Sources", mobileLabel: "Sources", href: "/v2/sources", icon: "sources" },
  { label: "Citations", mobileLabel: "Citations", href: "/v2/citations", icon: "citations" },
  { label: "Settings", mobileLabel: "Profile", href: "/v2/settings", icon: "settings" },
];

function ProductIcon({ name }: { name: IconName }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "overview": return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
    case "review": return <svg {...common}><path d="M12 3v18M3 12h18"/></svg>;
    case "documents": return <svg {...common}><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5M10 12h5M10 16h5"/></svg>;
    case "sources": return <svg {...common}><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>;
    case "citations": return <svg {...common}><path d="M6 5h12M6 10h12M6 15h8M6 20h5"/><path d="m17 16 1.5 1.5L21 15"/></svg>;
    case "history": return <svg {...common}><path d="M4 4v5h5"/><path d="M5.5 8.5A8 8 0 1 1 4 13"/><path d="M12 7v5l3 2"/></svg>;
    case "settings": return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>;
    case "help": return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.3 2.2c-.9.4-1.1.9-1.1 1.8M12 17h.01"/></svg>;
  }
}

function BrandMark() { return <span className={styles.brandMark} aria-hidden="true">A</span>; }
function isActivePath(pathname: string, href: string) {
  if (href === "/v2") return pathname === "/v2" || pathname.endsWith("/v2") || pathname.endsWith("/v2/");
  return pathname === href || pathname.endsWith(href) || pathname.endsWith(`${href}/`);
}
function NavigationLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActivePath(pathname, item.href);
  return <Link className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`} href={item.href} aria-current={active ? "page" : undefined}><span className={styles.navIcon}><ProductIcon name={item.icon}/></span><span>{item.label}</span></Link>;
}
function initials(displayName: string | null | undefined, email: string | null | undefined) {
  return (displayName?.trim() || email?.trim() || "A").slice(0, 1).toUpperCase();
}

export default function Averis2Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { configured, loading, user, profile, signOut } = useAveris2Account();
  const metadataName = typeof user?.user_metadata?.display_name === "string" ? user.user_metadata.display_name.trim() : "";
  const displayName = profile?.display_name?.trim() || metadataName || null;
  const accountLabel = displayName || user?.email || "Student workspace";
  const credits = profile?.credits_remaining;

  useEffect(() => {
    document.body.dataset.averis2 = "true";
    return () => { delete document.body.dataset.averis2; };
  }, []);

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/v2" aria-label="Averis 2.0 overview"><BrandMark/><span className={styles.brandText}><strong>Averis</strong><small>Academic Integrity Intelligence</small></span></Link>
        <div className={styles.topbarTools}>
          <label className={styles.searchBox}><span className={styles.srOnly}>Search workspace</span><ProductIcon name="sources"/><input type="search" placeholder="Search workspace" disabled aria-label="Search workspace — coming in a later Averis 2.0 slice"/></label>
          {loading ? <span className={styles.creditStatus}>Loading account…</span> : user && profile ? <span className={styles.creditStatus}><span className={styles.statusDot}/>{credits} scan {credits === 1 ? "credit" : "credits"}</span> : <span className={styles.creditStatus}>Signed out</span>}
          {user ? <button className={styles.avatar} type="button" aria-label="Sign out of Averis" title="Sign out" onClick={() => void signOut()}>{initials(displayName, user.email)}</button> : <Link className={styles.secondaryButton} href="/">Sign in</Link>}
        </div>
      </header>
      <div className={styles.workspace}>
        <aside className={styles.sidebar}>
          <div className={styles.workspaceIdentity}><span>Workspace</span><strong>{loading ? "Loading account…" : accountLabel}</strong></div>
          <nav className={styles.desktopNav} aria-label="Averis 2.0 primary navigation">{desktopNavigation.map((item) => <NavigationLink key={item.href} item={item} pathname={pathname}/>)}</nav>
          <div className={styles.sidebarDivider}/>
          <nav className={styles.desktopNav} aria-label="Averis 2.0 utility navigation">{utilityNavigation.map((item) => <NavigationLink key={item.href} item={item} pathname={pathname}/>)}</nav>
          <div className={styles.sidebarTrust}><span className={styles.statusDot}/><span>{configured ? "Evidence-first beta" : "Local preview mode"}</span></div>
        </aside>
        <main className={styles.main}>{children}</main>
      </div>
      <nav className={styles.mobileNav} aria-label="Averis 2.0 mobile navigation">{mobileNavigation.map((item) => { const active = isActivePath(pathname, item.href); return <Link key={item.href} className={`${styles.mobileNavLink} ${active ? styles.mobileNavLinkActive : ""}`} href={item.href} aria-current={active ? "page" : undefined}><ProductIcon name={item.icon}/><span>{item.mobileLabel}</span></Link>; })}</nav>
    </div>
  );
}
