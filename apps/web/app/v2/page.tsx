import Link from "next/link";

import styles from "./averis2.module.css";

const metrics = [
  { value: "4", label: "scan credits", tone: "accent" },
  { value: "1", label: "reviews this week", tone: "default" },
  { value: "12", label: "sources reviewed", tone: "default" },
  { value: "94%", label: "citation clarity", tone: "success" },
] as const;

const recentReviews = [
  { document: "Research Paper.pdf", similarity: "18%", evidence: "7 passages", updated: "Today" },
  { document: "AI Ethics.docx", similarity: "9%", evidence: "3 passages", updated: "Yesterday" },
  { document: "Methods.txt", similarity: "0%", evidence: "No matches", updated: "Sep 24" },
];

export default function Averis2DashboardPage() {
  return (
    <>
      <div className={styles.previewNotice} role="note">
        <span className={styles.statusDot} />
        Averis 2.0 shell preview · presentation data only · production beta behavior is unchanged
      </div>

      <header className={styles.pageHeader}>
        <div className={styles.pageHeading}>
          <span className={styles.eyebrow}>Workspace</span>
          <h1 className={styles.pageTitle}>Good afternoon</h1>
          <p className={styles.pageDescription}>Here is what needs your attention today.</p>
        </div>
        <Link className={styles.primaryButton} href="/v2/new-review">
          New review
        </Link>
      </header>

      <section className={styles.metricGrid} aria-label="Workspace summary">
        {metrics.map((metric) => {
          const toneClass =
            metric.tone === "accent"
              ? styles.metricValueAccent
              : metric.tone === "success"
                ? styles.metricValueSuccess
                : "";

          return (
            <article className={styles.metricCard} key={metric.label}>
              <strong className={`${styles.metricValue} ${toneClass}`}>{metric.value}</strong>
              <span className={styles.metricLabel}>{metric.label}</span>
            </article>
          );
        })}
      </section>

      <section className={styles.dashboardGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Recent reviews</h2>
            <p>Your latest evidence-backed reviews</p>
          </div>

          <table className={styles.reviewTable}>
            <thead>
              <tr>
                <th>Document</th>
                <th>Similarity</th>
                <th>Evidence</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {recentReviews.map((review) => (
                <tr key={review.document}>
                  <td>
                    <span className={styles.documentName}>{review.document}</span>
                  </td>
                  <td>{review.similarity}</td>
                  <td>{review.evidence}</td>
                  <td>{review.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <aside className={styles.privacyCard} aria-label="Privacy summary">
          <div className={styles.privacyHeader}>
            <h2>Privacy</h2>
            <p>Current beta boundary</p>
          </div>
          <p className={styles.privacyCopy}>Original uploads are processed in memory and are not retained as original upload objects.</p>
          <span className={styles.statusPill}>
            <span className={styles.statusDot} />
            Retention: off
          </span>
        </aside>
      </section>
    </>
  );
}
