"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { supabase, supabaseConfigured } from "../lib/supabase";
import styles from "./onboarding-experience-v37.module.css";

const ONBOARDING_KEY = "averis:onboarding:v37";
const OPEN_EVENT = "averis:onboarding-open";

type Step = {
  eyebrow: string;
  title: string;
  description: string;
};

const steps: Step[] = [
  {
    eyebrow: "01 · EVIDENCE FIRST",
    title: "Averis helps you review work. It does not decide authorship or misconduct.",
    description: "Similarity, citation, source and writing signals are evidence for your review. They are not plagiarism verdicts, AI-authorship claims, grades or Turnitin predictions.",
  },
  {
    eyebrow: "02 · ASSIGNMENT WORKSPACE",
    title: "Keep the assignment context together before you start checking it.",
    description: "Save the brief, working draft, source text, references, notes, deadline and word target in the browser-local Assignment Workspace. Restoring a saved draft is always an explicit action.",
  },
  {
    eyebrow: "03 · REVIEW PATH",
    title: "Move from source evidence to human decisions in a predictable order.",
    description: "Find or verify sources, inspect evidence, refine only after the evidence gate, then accept or keep revisions deliberately before running a final check.",
  },
  {
    eyebrow: "04 · AI BOUNDARY",
    title: "Choose the runtime that matches the privacy boundary you want.",
    description: "Private Browser AI stays in the browser, Local Ollama stays on your machine, and Cloud AI is optional through the Averis API. No runtime may auto-accept changes, invent evidence or remove citation/number/DOI safeguards.",
  },
];

function seenOnboarding() {
  try {
    return Boolean(window.localStorage.getItem(ONBOARDING_KEY));
  } catch {
    return false;
  }
}

function rememberOnboarding(value: "completed" | "dismissed") {
  try {
    window.localStorage.setItem(ONBOARDING_KEY, `${value}:${new Date().toISOString()}`);
  } catch {
    // Preference persistence is best effort. Product access never depends on localStorage.
  }
}

function onboardingCanOpen() {
  const root = document.documentElement;
  return root.dataset.averisIntroVisible !== "true"
    && root.getAttribute("data-averis-auth-modal") !== "open"
    && root.dataset.averisOnboarding !== "open";
}

export default function OnboardingExperienceV37() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const autoScheduledRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const show = useCallback((manual: boolean) => {
    setManualOpen(manual);
    setStep(0);
    setOpen(true);
    document.documentElement.dataset.averisOnboarding = "open";
  }, []);

  const scheduleAutoOpen = useCallback((delay = 1200) => {
    if (autoScheduledRef.current || seenOnboarding()) return;
    autoScheduledRef.current = true;

    const attempt = () => {
      if (seenOnboarding()) {
        autoScheduledRef.current = false;
        return;
      }
      if (!onboardingCanOpen()) {
        timerRef.current = window.setTimeout(attempt, 450);
        return;
      }
      show(false);
    };

    timerRef.current = window.setTimeout(attempt, delay);
  }, [show]);

  const close = useCallback((remember: boolean) => {
    if (remember && !manualOpen) rememberOnboarding("dismissed");
    setOpen(false);
    setStep(0);
    delete document.documentElement.dataset.averisOnboarding;
  }, [manualOpen]);

  const finish = useCallback((destination = "/dashboard") => {
    rememberOnboarding("completed");
    setOpen(false);
    setStep(0);
    delete document.documentElement.dataset.averisOnboarding;
    router.push(destination);
  }, [router]);

  useEffect(() => {
    const onManualOpen = () => show(true);
    window.addEventListener(OPEN_EVENT, onManualOpen);
    return () => window.removeEventListener(OPEN_EVENT, onManualOpen);
  }, [show]);

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return;

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active || !data.session?.user || seenOnboarding()) return;
      scheduleAutoOpen(900);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || event !== "SIGNED_IN" || !session?.user || seenOnboarding()) return;
      router.push("/dashboard");
      scheduleAutoOpen(1450);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [router, scheduleAutoOpen]);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => closeRef.current?.focus(), 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [close, open]);

  useEffect(() => () => {
    delete document.documentElement.dataset.averisOnboarding;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  if (!open) return null;

  const current = steps[step];
  const lastStep = step === steps.length - 1;

  return (
    <div className={styles.backdrop} data-averis-onboarding-backdrop="true" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close(true);
    }}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="averis-onboarding-title"
        aria-describedby="averis-onboarding-description"
      >
        <header className={styles.topbar}>
          <div className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true">A</span>
            <span><strong>AVERIS</strong><small>FIRST-RUN GUIDE · V37</small></span>
          </div>
          <button ref={closeRef} className={styles.close} type="button" onClick={() => close(true)} aria-label="Close product guide">×</button>
        </header>

        <div className={styles.progressHeader}>
          <span>PRODUCT ORIENTATION</span>
          <b>{String(step + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}</b>
        </div>
        <div className={styles.progressTrack} role="progressbar" aria-label="Product guide progress" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={step + 1}>
          <i style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
        </div>

        <section className={styles.content}>
          <div className={styles.copy}>
            <span>{current.eyebrow}</span>
            <h2 id="averis-onboarding-title">{current.title}</h2>
            <p id="averis-onboarding-description">{current.description}</p>

            {step === 0 && (
              <div className={styles.boundaryGrid}>
                <article><b>Evidence</b><span>Passages, sources, citations and writing signals remain inspectable.</span></article>
                <article><b>Human decision</b><span>You decide what a signal means and whether a revision should be accepted.</span></article>
                <article><b>No detector games</b><span>Averis does not promise AI-detector evasion, plagiarism bypass or an “undetectable” rewrite.</span></article>
              </div>
            )}

            {step === 1 && (
              <div className={styles.workspaceDiagram} role="group" aria-label="Assignment workspace contents">
                <span>BRIEF</span><span>DRAFT</span><span>SOURCES</span><span>REFERENCES</span><span>DEADLINE</span><span>NOTES</span>
                <strong>Browser-local assignment workspace</strong>
                <small>Dashboard shows durable workflow facts; evidence/readiness is re-run on the current document.</small>
              </div>
            )}

            {step === 2 && (
              <ol className={styles.reviewPath}>
                <li><b>01</b><span><strong>Capture context</strong><small>Brief, draft and source material</small></span></li>
                <li><b>02</b><span><strong>Verify sources</strong><small>Crossref/DOI and citation linkage</small></span></li>
                <li><b>03</b><span><strong>Inspect evidence</strong><small>Similarity and bounded review signals</small></span></li>
                <li><b>04</b><span><strong>Revise deliberately</strong><small>Evidence gate before AI suggestions</small></span></li>
                <li><b>05</b><span><strong>Re-check</strong><small>Run current evidence before submission</small></span></li>
              </ol>
            )}

            {step === 3 && (
              <div className={styles.runtimeGrid}>
                <article><span>PRIVATE BROWSER AI</span><b>In-browser</b><small>Runs client-side when the browser/device supports it.</small></article>
                <article><span>LOCAL OLLAMA</span><b>Your machine</b><small>Server/local runtime with no Cloud AI fallback.</small></article>
                <article><span>CLOUD AI</span><b>Explicit opt-in</b><small>Selected text goes through the Averis API to the configured provider. The provider key stays server-side.</small></article>
              </div>
            )}
          </div>

          <aside className={styles.sideNote}>
            <span>WHAT STAYS TRUE</span>
            <ul>
              <li>No automatic misconduct label</li>
              <li>No fabricated citation/source promise</li>
              <li>No automatic revision acceptance</li>
              <li>No paid fallback requirement</li>
            </ul>
            <p>Your draft remains yours to review and submit.</p>
          </aside>
        </section>

        <footer className={styles.footer}>
          <button className={styles.skip} type="button" onClick={() => close(true)}>Skip guide</button>
          <div className={styles.stepDots} aria-hidden="true">
            {steps.map((_item, index) => <i key={index} data-active={index === step ? "true" : "false"} />)}
          </div>
          <div className={styles.actions}>
            {step > 0 && <button className={styles.secondary} type="button" onClick={() => setStep((value) => Math.max(0, value - 1))}>Back</button>}
            {!lastStep ? (
              <button className={styles.primary} type="button" onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}>Continue</button>
            ) : (
              <button className={styles.primary} type="button" onClick={() => finish("/dashboard")}>Open my dashboard</button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
