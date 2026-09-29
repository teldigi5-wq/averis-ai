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

function isHomePath() {
  const path = window.location.pathname.replace(/\/+$/, "");
  return path === "" || path === "/" || path.endsWith("/averis-ai");
}

function normalizeLoginLabels(root: ParentNode = document) {
  root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    if (button.textContent?.trim().toLowerCase() === "sign in") {
      button.textContent = "Login";
    }
  });
}

export default function AuthExperience() {
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [panelMode, setPanelMode] = useState<AuthMode>("signin");
  const [phase, setPhase] = useState<AuthPhase>("idle");
  const [message, setMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const attemptRef = useRef(false);
  const modeRef = useRef<AuthMode>("signin");

  const closeModal = () => {
    document.documentElement.removeAttribute("data-averis-auth-modal");
    setModalOpen(false);
  };

  const openModal = (mode: AuthMode) => {
    document.documentElement.setAttribute("data-averis-auth-modal", "open");
    setModalOpen(true);
    setPanelMode(mode);

    window.setTimeout(() => {
      const authPanel = document.querySelector<HTMLElement>(".authPanel");
      const tabs = authPanel?.querySelectorAll<HTMLButtonElement>(".authTab");
      const desired = mode === "signup" ? tabs?.[1] : tabs?.[0];
      desired?.click();
      normalizeLoginLabels(authPanel ?? document);
      authPanel?.querySelector<HTMLInputElement>('input[type="email"]')?.focus();
    }, 0);
  };

  useEffect(() => {
    const root = document.documentElement;
    const client = supabase;

    const applySession = (signedIn: boolean) => {
      root.removeAttribute("data-averis-auth-bootstrap");
      root.setAttribute("data-averis-auth-view", signedIn ? "workspace" : supabaseConfigured ? "public" : "local");

      if (!signedIn && supabaseConfigured && isHomePath()) {
        root.setAttribute("data-averis-home-public", "true");
      } else {
        root.removeAttribute("data-averis-home-public");
      }

      if (signedIn) closeModal();
    };

    if (!supabaseConfigured || !client) {
      applySession(false);
      return;
    }

    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (active) applySession(Boolean(data.session?.user));
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      if (active) applySession(Boolean(session?.user));
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
      root.removeAttribute("data-averis-auth-modal");
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const resolvePanel = () => {
      const nextPanel = document.querySelector<HTMLElement>(".authPanel");
      setPanel(nextPanel);
      if (nextPanel) setPanelMode(activeMode(nextPanel));
      normalizeLoginLabels(document);
    };

    resolvePanel();
    const observer = new MutationObserver(resolvePanel);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      if (target.classList.contains("accountGrid")) {
        closeModal();
        return;
      }

      const interactive = target.closest<HTMLElement>("button, a");
      if (!interactive || interactive.closest(".authPanel")) return;

      const label = interactive.textContent?.trim().toLowerCase() ?? "";
      if (label === "login") {
        openModal("signin");
      } else if (label.startsWith("start free") || label === "open averis") {
        openModal("signup");
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && document.documentElement.getAttribute("data-averis-auth-modal") === "open") {
        closeModal();
      }
    };

    document.addEventListener("click", onDocumentClick, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onDocumentClick, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!panel || !supabaseConfigured || !client) return;

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
      setPanelMode(modeRef.current);
      attemptRef.current = true;
      sawWorkingState = false;
      panel.dataset.authState = "submitting";
      setPhase("submitting");
      setMessage(modeRef.current === "signup" ? "Creating your secure Averis account…" : "Verifying your account…");
    };

    const finishObserver = new MutationObserver(async () => {
      normalizeLoginLabels(panel);
      const working = submitButton.disabled && /working/i.test(submitButton.textContent ?? "");
      if (working) {
        sawWorkingState = true;
        return;
      }

      if (!attemptRef.current || !sawWorkingState) return;

      const { data } = await client.auth.getSession();
      if (data.session?.user) return;

      attemptRef.current = false;
      delete panel.dataset.authState;

      if (modeRef.current === "signup" && activeMode(panel) === "signin") {
        setPanelMode("signin");
        setPhase("notice");
        setMessage("Account created. Check your email to confirm it, then login.");
        return;
      }

      setPhase("error");
      setMessage(
        modeRef.current === "signup"
          ? "Account creation could not be completed. Check the form details and try again."
          : "Login could not be completed. Check your email and password, then try again.",
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
    const client = supabase;
    if (!supabaseConfigured || !client) return;

    const { data } = client.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" || !attemptRef.current) return;
      attemptRef.current = false;
      closeModal();
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

  const authForm = panel?.querySelector<HTMLFormElement>(".authForm") ?? null;

  return (
    <>
      {panel && modalOpen && createPortal(
        <button type="button" className="authModalClose" aria-label="Close login" onClick={closeModal}>×</button>,
        panel,
      )}

      {authForm && panelMode === "signin" && createPortal(
        <a
          data-averis-recovery-link="true"
          href="./recover/"
          onClick={closeModal}
          style={{
            minHeight: "44px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: "2px",
            color: "#b8c4d7",
            fontSize: "0.88rem",
            fontWeight: 650,
            textDecoration: "none",
          }}
        >
          Forgot password?
        </a>,
        authForm,
      )}

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
            <strong>{phase === "error" ? "Check your details" : phase === "notice" ? "Almost there" : "Secure login"}</strong>
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
