import Link from "next/link";
import { notFound } from "next/navigation";

import styles from "../averis2.module.css";

const sections = {
  documents: {
    eyebrow: "Documents",
    title: "Your review workspace",
    description: "Document organization is represented here as a shell route only. Original upload retention behavior has not changed.",
    steps: ["See review metadata", "Open evidence-backed results", "Filter by review state", "Keep original upload retention off"],
  },
  sources: {
    eyebrow: "Source intelligence",
    title: "Search and review scholarly sources",
    description: "The visual shell is ready for Crossref-backed source discovery without changing the existing source APIs.",
    steps: ["Search scholarly metadata", "Inspect source provenance", "Compare evidence", "Add a source to the review context"],
  },
  citations: {
    eyebrow: "Citation intelligence",
    title: "Citation health",
    description: "The future screen will surface missing, unmatched, and inconsistent citations as review items—not misconduct verdicts.",
    steps: ["Detect citation patterns", "Match references", "Surface inconsistencies", "Review each issue in context"],
  },
  history: {
    eyebrow: "History",
    title: "Review history",
    description: "History remains private to the signed-in workspace. Deleting history should remove supported scan metadata without refunding spent credits.",
    steps: ["Filter review metadata", "Open a previous result", "Delete a selected history entry", "Preserve the existing no-refund credit boundary"],
  },
  settings: {
    eyebrow: "Settings",
    title: "Workspace settings",
    description: "This route will hold presentation and review defaults while account privacy actions remain explicitly separated and protected.",
    steps: ["Set review defaults", "Manage presentation preferences", "Inspect account state", "Keep privacy controls explicit"],
  },
  help: {
    eyebrow: "Help",
    title: "Understand what Averis reports mean",
    description: "Help content will explain similarity, evidence, citations, credits, and privacy without overstating what the system can conclude.",
    steps: ["Understand similarity", "Review matched passages", "Understand citation flags", "Review privacy and retention boundaries"],
  },
} as const;

type SectionKey = keyof typeof sections;

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(sections).map((section) => ({ section }));
}

export default async function Averis2SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!(section in sections)) notFound();

  const config = sections[section as SectionKey];

  return (
    <>
      <div className={styles.previewNotice} role="note"><span className={styles.statusDot}/>Averis 2.0 route scaffold · no production behavior changed</div>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeading}>
          <span className={styles.eyebrow}>{config.eyebrow}</span>
          <h1 className={styles.pageTitle}>{config.title}</h1>
          <p className={styles.pageDescription}>{config.description}</p>
        </div>
        <Link className={styles.secondaryButton} href="/v2">Back to overview</Link>
      </header>
      <section className={styles.placeholderGrid}>
        <article className={`${styles.placeholderCard} ${styles.placeholderCardStrong}`}>
          <h2>Implementation boundary</h2>
          <p>This route remains presentation scaffolding while certified product logic is moved behind the Averis 2.0 shell in narrow, separately certified slices.</p>
          <ol className={styles.placeholderSteps}>{config.steps.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span><div>{step}</div></li>)}</ol>
        </article>
        <aside className={styles.placeholderCard}>
          <h2>Safety boundary</h2>
          <p>The following remain unchanged in this route scaffold.</p>
          <div className={styles.placeholderMeta}>
            <div><strong>Authentication</strong><span>Existing Supabase sign-in behavior is not replaced.</span></div>
            <div><strong>Credits & scoring</strong><span>No scan-credit or evidence calculation logic changes.</span></div>
            <div><strong>Privacy & retention</strong><span>Original-upload retention stays off; no schema changes.</span></div>
            <div><strong>Hosting</strong><span>Azure API and GitHub Pages production paths are unchanged.</span></div>
          </div>
        </aside>
      </section>
    </>
  );
}
