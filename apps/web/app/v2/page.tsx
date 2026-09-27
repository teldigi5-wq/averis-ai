"use client";

import Link from "next/link";
import { useMemo } from "react";

import { useAveris2Account } from "./Averis2AccountProvider";
import styles from "./averis2.module.css";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function similarityLabel(value: number | null) {
  return value == null ? "—" : `${Math.round(value * 100) / 100}%`;
}

export default function Averis2DashboardPage() {
  const { configured, loading, user, profile, scans } = useAveris2Account();

  const recentScans = scans.slice(0, 5);
  const reviewCountLast7Days = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return scans.filter((scan) => new Date(scan.created_at).getTime() >= cutoff).length;
  }, [scans]);
  const sourceCount = useMemo(() => new Set(scans.map((scan) => scan.source_name).filter(Boolean)).size, [scans]);
  const displayName = profile?.display_name?.trim() || (typeof user?.user_metadata?.display_name === "string" ? user.user_metadata.display_name.trim() : "");

  if (loading) {
    return (
      <section className={styles.placeholderCard} aria-live="polite">
        <h2>Loading your private workspace…</h2>
        <p>Averis is restoring your existing Supabase session and owner-scoped account data.</p>
      </section>
    );
  }

  if (configured && !user) {
    return (
      <>
        <header className={styles.pageHeader}>
          <div className={styles.pageHeading}>
            <span className={styles.eyebrow}>Private workspace</span>
            <h1 className={styles.pageTitle}>Sign in to open Averis 2.0</h1>
            <p className={styles.pageDescription}>This preview reuses the existing certified Supabase session and does not introduce a second authentication system.</p>
          </div>
          <Link className={styles.primaryButton} href="/">Sign in on Averis</Link>
        </header>
        <section className={styles.placeholderGrid}>
          <article className={`${styles.placeholderCard} ${styles.placeholderCardStrong}`}>
            <h2>Same account. New interface.</h2>
            <p>Sign in through the current beta, then return to this route. Your session, profile, credits, and private scan metadata will appear here through the existing owner-scoped Supabase policies.</p>
            <ol className={styles.placeholderSteps}>
              <li><span>01</span><div>Sign in with your existing Averis account.</div></li>
              <li><span>02</span><div>Open the Averis 2.0 preview again.</div></li>
              <li><span>03</span><div>Review your real credit balance and scan metadata.</div></li>
            </ol>
          </article>
          <aside className={styles.placeholderCard}>
            <h2>Privacy boundary</h2>
            <p>No new storage path, service-role credential, or authentication semantics were added for this preview.</p>
          </aside>
        </section>
      </>
    );
  }

  const metrics = [
    { value: profile ? String(profile.credits_remaining) : "∞", label: "scan credits", tone: "accent" },
    { value: String(reviewCountLast7Days), label: "reviews this week", tone: "default" },
    { value: String(sourceCount), label: "sources in history", tone: "default" },
    { value: "—", label: "citation clarity", tone: "default" },
  ] as const;

  return (
    <>
      <div className={styles.previewNotice} role="note"><span className={styles.statusDot}/>Averis 2.0 account-state preview · reads existing owner-scoped beta data only</div>

      <header className={styles.pageHeader}>
        <div className={styles.pageHeading}>
          <span className={styles.eyebrow}>Workspace</span>
          <h1 className={styles.pageTitle}>{displayName ? `Good afternoon, ${displayName.split(/\s+/)[0]}` : "Your workspace"}</h1>
          <p className={styles.pageDescription}>Your real credit balance and recent private scan metadata, presented in the Averis 2.0 shell.</p>
        </div>
        <Link className={styles.primaryButton} href="/v2/new-review">New review</Link>
      </header>

      <section className={styles.metricGrid} aria-label="Workspace summary">
        {metrics.map((metric) => {
          const toneClass = metric.tone === "accent" ? styles.metricValueAccent : "";
          return <article className={styles.metricCard} key={metric.label}><strong className={`${styles.metricValue} ${toneClass}`}>{metric.value}</strong><span className={styles.metricLabel}>{metric.label}</span></article>;
        })}
      </section>

      <section className={styles.dashboardGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}><h2>Recent reviews</h2><p>Private scan metadata from your existing Averis account</p></div>
          {recentScans.length ? (
            <table className={styles.reviewTable}>
              <thead><tr><th>Document</th><th>Similarity</th><th>Source</th><th>Updated</th></tr></thead>
              <tbody>{recentScans.map((scan) => <tr key={scan.id}><td><span className={styles.documentName}>{scan.document_name}</span></td><td>{similarityLabel(scan.similarity_percent)}</td><td>{scan.source_name || "—"}</td><td>{formatDate(scan.created_at)}</td></tr>)}</tbody>
            </table>
          ) : (
            <div className={styles.placeholderMeta}><div><strong>No review history yet</strong><span>Run an integrity review in the certified beta or wire New Review in the next Averis 2.0 slice.</span></div></div>
          )}
        </article>

        <aside className={styles.privacyCard} aria-label="Privacy summary">
          <div className={styles.privacyHeader}><h2>Privacy</h2><p>Certified beta boundary</p></div>
          <p className={styles.privacyCopy}>Original uploads are processed in memory and are not retained as original upload objects.</p>
          <span className={styles.statusPill}><span className={styles.statusDot}/>Retention: off</span>
        </aside>
      </section>
    </>
  );
}
