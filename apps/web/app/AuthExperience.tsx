"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { supabase, supabaseConfigured } from "../lib/supabase";

type AuthPhase = "idle" | "submitting" | "notice" | "error" | "success";
type AuthMode = "signin" | "signup";

function activeMode(panel: HTMLElement): AuthMode {
  const activeTab = panel.querySelector<HTMLElement>(".authTab.active");
  return activeTab?.textContent?.toLowerCase().includes("create") ? "signup" : "signin";
}

export default function AuthExperience() {
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [phase, setPhase] = useState<AuthPhase>("idle");
  const [message, setMessage] = useState("");
  const attemptRef = useRef(false);
  const modeRef = useRef<AuthMode>("signin");

  useEffect(() => {
    if (typeof document === "undefined") return;

    const resolvePanel = () => {
      setPanel(document.querySelector<HTMLElement>(".authPanel"));
    };

    resolvePanel();
    const observer = new MutationObserver(resolvePanel);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!panel || !supabaseConfigured || !supabase) return;

    const form = panel.querySelector<HTMLFormElement>(".authForm");
    const submitButton = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!form || !submitButton) return;

    let sawWorkingState = false;

    const clearFeedback = () => {
      setPhase((current) => {
        if (current !== "error" && current !== "notice") return current;
        setMessage("");
        return "idle";
      });
    };

    const onSubmit = () => {
      modeRef.current = activeMode(panel);
      attemptRef.current = true;
      sawWorkingState = false;
      panel.dataset.authState = "submitting";
      setPhase("submitting");
      setMessage(modeRef.current === "signup" ? "Creating your secure Averis account…" : "Verifying your account…");
    };

    const finishObserver = new MutationObserver(async () => {
      const working = submitButton.disabled && /working/i.test(submitButton.textContent ?? "");
      if (working) {
        sawWorkingState = true;
        return;
      }

      if (!attemptRef.current || !sawWorkingState) return;

      const { data } = await supabase.auth.getSession();
      if (data.session?.user) return;

      attemptRef.current = false;
      delete panel.dataset.authState;

      if (modeRef.current === "signup" && activeMode(panel) === "signin") {
        setPhase("notice");
        setMessage("Account created. Check your email to confirm it, then sign in.");
        return;
      }

      setPhase("error");
      setMessage(
        modeRef.current === "signup"
          ? "Account creation could not be completed. Check the form details and try again."
          : "Sign-in could not be completed. Check your email and password, then try again.",
      );
    });

    form.addEventListener("submit", onSubmit, true);
    form.addEventListener("input", clearFeedback, true);
    finishObserver.observe(submitButton, { attributes: true, childList: true, characterData: true, subtree: true });

    return () => {
      form.removeEventListener("submit", onSubmit, true);
      form.removeEventListener("input", clearFeedback, true);
      finishObserver.disconnect();
      delete panel.dataset.authState;
    };
  }, [panel]);

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return;

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" || !attemptRef.current) return;
      attemptRef.current = false;
      setPhase("success");
      setMessage("Welcome back. Opening your Averis workspace…");
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (phase !== "success") return;
    const timer = window.setTimeout(() => {
      setPhase("idle");
      setMessage("");
    }, 1150);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (!panel) return;
    if (phase === "error") panel.dataset.authState = "error";
    else if (phase === "submitting") panel.dataset.authState = "submitting";
    else if (phase === "notice") panel.dataset.authState = "notice";
    else delete panel.dataset.authState;
  }, [panel, phase]);

  return (
    <>
      {panel && phase !== "idle" && phase !== "success" && createPortal(
        <div
          className={`authFeedback authFeedback-${phase}`}
          role={phase === "error" ? "alert" : "status"}
          aria-live={phase === "error" ? "assertive" : "polite"}
        >
          <span className="authFeedbackIcon" aria-hidden="true">
            {phase === "submitting" ? <i className="authSpinner" /> : phase === "error" ? "!" : "✓"}
          </span>
          <span>
            <strong>{phase === "error" ? "Check your details" : phase === "notice" ? "Almost there" : "Secure sign-in"}</strong>
            <small>{message}</small>
          </span>
        </div>,
        panel,
      )}

      {phase === "success" && (
        <div className="authSuccessTransition" role="status" aria-live="polite">
          <div className="authSuccessCard">
            <span className="authSuccessMark" aria-hidden="true">✓</span>
            <p>AUTHENTICATED</p>
            <h2>Welcome to Averis.</h2>
            <span>{message}</span>
          </div>
        </div>
      )}
    </>
  );
}
