"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import {
  BROWSER_AI_MAX_CHARS,
  BROWSER_AI_MODEL,
  browserAiCapability,
  generatePrivateRevision,
  type BrowserAiProgress,
} from "./browser-ai";
import styles from "./studio-runtime-v21.module.css";

type Runtime = "ollama" | "browser" | "cloud";

type RefinePayload = {
  text?: string;
  requested_goal?: string;
  strength?: "light" | "balanced";
  runtime?: "ollama" | "cloud";
};

const AUTHOR_YEAR = /\([^()]{0,90}\b(?:19|20)\d{2}[a-z]?[^()]{0,45}\)/gi;
const NUMERIC_CITATION = /\[(?:\d{1,4}\s*(?:[-–,;]\s*\d{1,4}\s*)*)\]/g;
const NUMBER = /(?<!\w)\d+(?:\.\d+)?%?(?!\w)/g;
const DOI = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi;

function uniqueMatches(text: string, pattern: RegExp) {
  return [...new Set((text.match(pattern) ?? []).map((item) => item.trim()))];
}

function preservation(original: string, suggestion: string) {
  const citationsBefore = [...uniqueMatches(original, AUTHOR_YEAR), ...uniqueMatches(original, NUMERIC_CITATION)];
  const citationsAfter = [...uniqueMatches(suggestion, AUTHOR_YEAR), ...uniqueMatches(suggestion, NUMERIC_CITATION)];
  const numbersBefore = uniqueMatches(original, NUMBER);
  const numbersAfter = uniqueMatches(suggestion, NUMBER);
  const doisBefore = uniqueMatches(original, DOI);
  const doisAfter = uniqueMatches(suggestion, DOI);
  const missingCitations = citationsBefore.filter((item) => !citationsAfter.includes(item));
  const missingNumbers = numbersBefore.filter((item) => !numbersAfter.includes(item));
  const missingDois = doisBefore.filter((item) => !doisAfter.some((candidate) => candidate.toLowerCase() === item.toLowerCase()));
  const originalLength = Math.max(1, original.length);

  return {
    citations_before: citationsBefore,
    citations_after: citationsAfter,
    missing_citations: missingCitations,
    numbers_before: numbersBefore,
    numbers_after: numbersAfter,
    missing_numbers: missingNumbers,
    dois_before: doisBefore,
    dois_after: doisAfter,
    missing_dois: missingDois,
    length_change_percent: Math.round((((suggestion.length - original.length) / originalLength) * 100) * 100) / 100,
    acceptance_eligible: missingCitations.length === 0 && missingNumbers.length === 0 && missingDois.length === 0,
  };
}

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default function StudioAiRuntimeBridge({ children }: { children: ReactNode }) {
  const [runtime, setRuntime] = useState<Runtime>("ollama");
  const runtimeRef = useRef<Runtime>("ollama");
  const [capability, setCapability] = useState<{ supported: boolean; reason: string | null } | null>(null);
  const [progress, setProgress] = useState<BrowserAiProgress>({
    status: "idle",
    label: "Private model not loaded",
    percent: null,
  });

  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

  useEffect(() => {
    setCapability(browserAiCapability());
  }, []);

  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const isRevisionRefine = url.includes("/api/v1/ai/revision/refine");
      if (!isRevisionRefine) {
        return nativeFetch(input, init);
      }

      let payload: RefinePayload = {};
      try {
        if (typeof init?.body === "string") payload = JSON.parse(init.body) as RefinePayload;
      } catch {
        return jsonResponse({ detail: "Revision Studio could not read the revision request." }, 400);
      }

      if (runtimeRef.current === "cloud") {
        return nativeFetch(input, {
          ...init,
          body: JSON.stringify({ ...payload, runtime: "cloud" }),
        });
      }

      if (runtimeRef.current !== "browser") {
        return nativeFetch(input, init);
      }

      if (!capability?.supported) {
        return jsonResponse({ detail: capability?.reason ?? "Private Browser AI requires WebGPU on this device." }, 503);
      }

      const text = payload.text?.trim() ?? "";
      if (text.length < 50) {
        return jsonResponse({ detail: "Paste at least 50 characters before using Private Browser AI." }, 400);
      }
      if (text.length > BROWSER_AI_MAX_CHARS) {
        return jsonResponse({
          detail: `Private Browser AI supports up to ${BROWSER_AI_MAX_CHARS.toLocaleString()} characters per pass. Use Local Ollama or Cloud AI for longer sections.`,
        }, 400);
      }

      try {
        const suggestion = await generatePrivateRevision({
          text,
          goal: payload.requested_goal?.trim() || "Improve clarity while preserving meaning, citations, quotations, numbers, and factual claims.",
          strength: payload.strength === "light" ? "light" : "balanced",
          onProgress: setProgress,
        });
        const protectedTokens = preservation(text, suggestion);
        return jsonResponse({
          generation_eligible: true,
          runtime_available: true,
          runtime: null,
          boundary: "private_browser_ai_evidence_first_revision",
          blocked_reason: null,
          original_text: text,
          suggested_text: suggestion,
          preservation: protectedTokens,
          source_evidence_before: null,
          source_evidence_after: null,
          caution: "This proposal was generated on-device. Review every sentence and re-run evidence before using accepted wording. Source similarity is not an optimization target.",
          evidence_version: "private-browser-ai-v22",
        });
      } catch (error) {
        setProgress({ status: "idle", label: "Private Browser AI stopped", percent: null });
        return jsonResponse({
          detail: error instanceof Error ? error.message : "Private Browser AI could not complete this revision request.",
        }, 503);
      }
    }) as typeof window.fetch;

    return () => {
      window.fetch = nativeFetch;
    };
  }, [capability]);

  const browserReady = capability?.supported === true;
  const busy = progress.status === "loading" || progress.status === "generating";
  const runtimeLabel = runtime === "browser" ? "ON DEVICE" : runtime === "cloud" ? "SERVER API" : "LOCAL BACKEND";
  const statusTitle =
    runtime === "browser"
      ? progress.label
      : runtime === "cloud"
        ? "Cloud provider path selected"
        : "Ollama proposal path selected";
  const statusDetail =
    runtime === "browser"
      ? `${BROWSER_AI_MODEL} · max ${BROWSER_AI_MAX_CHARS.toLocaleString()} characters per pass`
      : runtime === "cloud"
        ? "Opt-in only · API key stays server-side · no automatic paid/local fallback"
        : "No paid inference fallback. Existing preservation and sentence-review gates stay active.";

  return (
    <div className={styles.shell} data-studio-runtime={runtime}>
      <section className={styles.runtimeBar} aria-label="Revision Studio AI runtime">
        <div className={styles.runtimeTitle}>
          <span className={styles.pulse} aria-hidden="true" />
          <div>
            <small>AI RUNTIME · V22</small>
            <strong>Choose where the revision proposal runs.</strong>
          </div>
        </div>

        <div className={styles.runtimeChoices} role="group" aria-label="Revision proposal runtime">
          <button
            type="button"
            className={runtime === "ollama" ? styles.active : ""}
            onClick={() => setRuntime("ollama")}
            aria-pressed={runtime === "ollama"}
          >
            <b>Local Ollama</b>
            <small>Existing backend-connected local runtime</small>
          </button>
          <button
            type="button"
            className={runtime === "browser" ? styles.active : ""}
            onClick={() => browserReady && setRuntime("browser")}
            aria-pressed={runtime === "browser"}
            disabled={capability !== null && !browserReady}
          >
            <b>Private Browser AI</b>
            <small>{browserReady ? "WebGPU · on-device generation" : capability?.reason ?? "Checking WebGPU…"}</small>
          </button>
          <button
            type="button"
            className={runtime === "cloud" ? styles.active : ""}
            onClick={() => setRuntime("cloud")}
            aria-pressed={runtime === "cloud"}
          >
            <b>Cloud AI</b>
            <small>Server-side API · deployment must explicitly enable it</small>
          </button>
        </div>

        <div className={styles.runtimeStatus} data-busy={busy ? "true" : "false"}>
          <span>{runtimeLabel}</span>
          <strong>{statusTitle}</strong>
          <small>{statusDetail}</small>
          {runtime === "browser" && progress.status === "loading" && (
            <div className={styles.progress} aria-label="Private AI model loading progress">
              <span style={{ width: `${progress.percent ?? 8}%` }} />
            </div>
          )}
        </div>
      </section>

      <p className={styles.runtimeBoundary}>
        All three runtimes feed the same human-controlled Revision Studio. Nothing is auto-accepted, detector-evasion goals remain outside the product boundary, and citation/DOI/number loss is still blocked before adoption. Cloud AI is never an automatic fallback.
      </p>

      {children}
    </div>
  );
}
