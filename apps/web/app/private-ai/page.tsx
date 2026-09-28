"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase, supabaseConfigured } from "../../lib/supabase";
import {
  BROWSER_AI_MAX_CHARS,
  BROWSER_AI_MODEL,
  browserAiCapability,
  generatePrivateCoach,
  generatePrivateRevision,
  type BrowserAiProgress,
} from "../studio/browser-ai";
import styles from "./private-ai.module.css";

type Mode = "coach" | "revise";

const AUTHOR_YEAR = /\([^()]{0,90}\b(?:19|20)\d{2}[a-z]?[^()]{0,45}\)/gi;
const NUMERIC_CITATION = /\[(?:\d{1,4}\s*(?:[-–,;]\s*\d{1,4}\s*)*)\]/g;
const NUMBER = /(?<!\w)\d+(?:\.\d+)?%?(?!\w)/g;
const DOI = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi;

function uniqueMatches(text: string, pattern: RegExp) {
  return [...new Set((text.match(pattern) ?? []).map((item) => item.trim()))];
}

function preservationAudit(original: string, suggestion: string) {
  const citationsBefore = [...uniqueMatches(original, AUTHOR_YEAR), ...uniqueMatches(original, NUMERIC_CITATION)];
  const citationsAfter = [...uniqueMatches(suggestion, AUTHOR_YEAR), ...uniqueMatches(suggestion, NUMERIC_CITATION)];
  const numbersBefore = uniqueMatches(original, NUMBER);
  const numbersAfter = uniqueMatches(suggestion, NUMBER);
  const doisBefore = uniqueMatches(original, DOI);
  const doisAfter = uniqueMatches(suggestion, DOI);
  return {
    missingCitations: citationsBefore.filter((item) => !citationsAfter.includes(item)),
    missingNumbers: numbersBefore.filter((item) => !numbersAfter.includes(item)),
    missingDois: doisBefore.filter((item) => !doisAfter.includes(item)),
  };
}

export default function PrivateAiPage() {
  const [ready, setReady] = useState(!supabaseConfigured);
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<Mode>("coach");
  const [draft, setDraft] = useState("");
  const [focus, setFocus] = useState("Improve clarity, academic tone, and the order of my ideas without changing my meaning.");
  const [strength, setStrength] = useState<"light" | "balanced">("balanced");
  const [progress, setProgress] = useState<BrowserAiProgress>({ status: "idle", label: "Model not loaded", percent: null });
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [capability, setCapability] = useState<{ supported: boolean; reason: string | null }>({ supported: false, reason: "Checking WebGPU support…" });

  useEffect(() => {
    setCapability(browserAiCapability());
    if (!supabaseConfigured || !supabase) {
      setReady(true);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setReady(true);
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const audit = useMemo(() => preservationAudit(draft, output), [draft, output]);
  const safeRevision = mode !== "revise" || (
    audit.missingCitations.length === 0 && audit.missingNumbers.length === 0 && audit.missingDois.length === 0
  );
  const canRun = capability.supported && draft.trim().length >= 50 && draft.length <= BROWSER_AI_MAX_CHARS && progress.status !== "loading" && progress.status !== "generating";

  function resetResult() {
    setOutput("");
    setError("");
    setCopied(false);
  }

  async function runAi() {
    if (!canRun) return;
    setError("");
    setOutput("");
    setCopied(false);
    try {
      const result = mode === "coach"
        ? await generatePrivateCoach({ text: draft, focus, onProgress: setProgress })
        : await generatePrivateRevision({ text: draft, goal: focus, strength, onProgress: setProgress });
      setOutput(result);
    } catch (err) {
      setProgress({ status: "idle", label: "Private AI stopped", percent: null });
      setError(err instanceof Error ? err.message : "Private AI could not complete this request.");
    }
  }

  async function copyOutput() {
    if (!output || (mode === "revise" && !safeRevision)) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (!ready) {
    return <main className={styles.page}><section className={styles.loadingCard}>Checking your Averis session…</section></main>;
  }

  if (supabaseConfigured && !user) {
    return (
      <main className={styles.page}>
        <section className={styles.locked}>
          <span className={styles.brand} aria-hidden="true" />
          <p className={styles.eyebrow}>AVERIS PRIVATE AI</p>
          <h1>Sign in before opening the private AI workspace.</h1>
          <p>The model runs on the device, but the workspace remains attached to your authenticated Averis session.</p>
          <Link href="/">Return to Averis and sign in</Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>PRIVATE AI · V20</p>
          <h1>Academic AI that runs in your browser.</h1>
          <p className={styles.lede}>Averis can now load a small open model on your device for writing coaching and bounded revision proposals. There is no paid inference API and no automatic detector-evasion objective.</p>
        </div>
        <aside className={styles.privacyCard}>
          <span>ON-DEVICE INFERENCE</span>
          <strong>{capability.supported ? "WebGPU ready" : "WebGPU unavailable"}</strong>
          <small>{capability.supported ? "The model files are downloaded to the browser; generation runs locally on this device." : capability.reason}</small>
        </aside>
      </section>

      <section className={styles.boundaryStrip} aria-label="Private AI boundaries">
        <div><span>01</span><b>No paid inference</b><small>browser-side open model</small></div>
        <div><span>02</span><b>No auto-verdict</b><small>human review remains required</small></div>
        <div><span>03</span><b>No score gaming</b><small>not a detector-evasion tool</small></div>
        <div><span>04</span><b>Protected tokens</b><small>citation, DOI, and number checks</small></div>
      </section>

      {error && <div className={styles.error} role="alert"><b>!</b><span>{error}</span></div>}

      <section className={styles.workspace}>
        <div className={styles.editorCard}>
          <div className={styles.cardHead}>
            <div><p className={styles.eyebrow}>YOUR DRAFT</p><h2>Keep the request focused and reviewable</h2></div>
            <span>{draft.length.toLocaleString()} / {BROWSER_AI_MAX_CHARS.toLocaleString()}</span>
          </div>
          <textarea
            value={draft}
            maxLength={BROWSER_AI_MAX_CHARS}
            onChange={(event) => { setDraft(event.target.value); resetResult(); }}
            placeholder="Paste a section of your own draft here…"
          />
          <div className={styles.editorMeta}>
            <span>{draft.trim() ? draft.trim().split(/\s+/).length : 0} words</span>
            <span>Use the existing Revision Studio for longer sections or source-evidence re-checking.</span>
          </div>
        </div>

        <aside className={styles.controlCard}>
          <div className={styles.cardHead}>
            <div><p className={styles.eyebrow}>AI TASK</p><h2>Choose what the local model should do</h2></div>
          </div>
          <div className={styles.modeSwitch} role="group" aria-label="Private AI task">
            <button type="button" className={mode === "coach" ? styles.active : ""} onClick={() => { setMode("coach"); resetResult(); }} aria-pressed={mode === "coach"}>
              <b>Coach</b><small>Actionable guidance without rewriting the whole draft</small>
            </button>
            <button type="button" className={mode === "revise" ? styles.active : ""} onClick={() => { setMode("revise"); resetResult(); }} aria-pressed={mode === "revise"}>
              <b>Revise</b><small>Generate a bounded proposal for manual review</small>
            </button>
          </div>
          <label className={styles.focusField}>
            <span>{mode === "coach" ? "COACHING FOCUS" : "REVISION GOAL"}</span>
            <textarea value={focus} maxLength={500} onChange={(event) => { setFocus(event.target.value); resetResult(); }} />
          </label>
          {mode === "revise" && (
            <div className={styles.strengthRow}>
              <span>EDIT STRENGTH</span>
              <div>
                <button type="button" className={strength === "light" ? styles.selected : ""} onClick={() => setStrength("light")} aria-pressed={strength === "light"}>Light</button>
                <button type="button" className={strength === "balanced" ? styles.selected : ""} onClick={() => setStrength("balanced")} aria-pressed={strength === "balanced"}>Balanced</button>
              </div>
            </div>
          )}
        </aside>

        <section className={styles.runtimeCard}>
          <div>
            <p className={styles.eyebrow}>PRIVATE MODEL RUNTIME</p>
            <h2>{progress.label}</h2>
            <p>Model: <code>{BROWSER_AI_MODEL}</code></p>
            <small>The first run downloads model files from Hugging Face and can take longer. Averis does not send your draft to a paid inference API in this mode.</small>
          </div>
          <div className={styles.runtimeAction}>
            {progress.status === "loading" && <div className={styles.progressTrack} aria-label="Model loading progress"><span style={{ width: `${progress.percent ?? 10}%` }} /></div>}
            <button type="button" onClick={runAi} disabled={!canRun}>
              {progress.status === "loading" ? "Loading model…" : progress.status === "generating" ? "Generating on device…" : mode === "coach" ? "Run private AI coach" : "Generate private revision"}
            </button>
          </div>
        </section>
      </section>

      {output && (
        <section className={styles.resultCard}>
          <div className={styles.resultHead}>
            <div><p className={styles.eyebrow}>{mode === "coach" ? "PRIVATE COACHING" : "REVISION PROPOSAL"}</p><h2>{mode === "coach" ? "Use the guidance as a checklist." : "Review this proposal before using any wording."}</h2></div>
            <span className={mode === "coach" || safeRevision ? styles.goodChip : styles.warnChip}>{mode === "coach" ? "GUIDANCE ONLY" : safeRevision ? "PROTECTED TOKENS PRESERVED" : "PRESERVATION HOLD"}</span>
          </div>
          {mode === "revise" && !safeRevision && (
            <div className={styles.hold} role="alert">
              <b>Do not copy this proposal yet.</b>
              <span>The local model removed protected content from the original draft.</span>
              {audit.missingCitations.length > 0 && <small>Missing citation: {audit.missingCitations.join(" · ")}</small>}
              {audit.missingDois.length > 0 && <small>Missing DOI: {audit.missingDois.join(" · ")}</small>}
              {audit.missingNumbers.length > 0 && <small>Missing number: {audit.missingNumbers.join(" · ")}</small>}
            </div>
          )}
          <pre>{output}</pre>
          <div className={styles.resultActions}>
            <button type="button" onClick={copyOutput} disabled={mode === "revise" && !safeRevision}>{copied ? "Copied" : mode === "coach" ? "Copy guidance" : "Copy preservation-safe proposal"}</button>
            <Link href="/studio/">Open Revision Studio</Link>
            <Link href="/revision/">Check source & citation evidence</Link>
          </div>
          <p className={styles.caution}>On-device generation is still model output, not proof that wording is factually correct, original, properly cited, or compliant with your institution. Review every claim and attribution yourself.</p>
        </section>
      )}

      <footer className={styles.footer}>
        <span>AVERIS PRIVATE AI</span>
        <p>Open-model browser inference · human-controlled use · no automatic misconduct or authorship verdicts.</p>
        <Link href="/privacy/">Privacy controls</Link>
      </footer>
    </main>
  );
}
