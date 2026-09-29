"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { supabase, supabaseConfigured } from "../../lib/supabase";
import styles from "./recovery.module.css";

type RecoveryStage = "request" | "checking" | "sent" | "reset" | "success" | "invalid";

const MIN_PASSWORD_LENGTH = 12;

function passwordChecks(password: string) {
  return {
    length: password.length >= MIN_PASSWORD_LENGTH,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
}

function allChecksPass(checks: ReturnType<typeof passwordChecks>) {
  return Object.values(checks).every(Boolean);
}

export default function PasswordRecoveryPage() {
  const [stage, setStage] = useState<RecoveryStage>("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const checks = useMemo(() => passwordChecks(password), [password]);
  const passwordsMatch = Boolean(password) && password === confirmPassword;

  useEffect(() => {
    const client = supabase;
    if (!supabaseConfigured || !client) return;

    const recoveryIntent = new URLSearchParams(window.location.search).get("flow") === "recovery";
    if (!recoveryIntent) return;

    let active = true;
    setStage("checking");
    setError("");

    const promoteIfSessionExists = async () => {
      const { data } = await client.auth.getSession();
      if (!active) return false;
      if (data.session?.user) {
        setStage("reset");
        return true;
      }
      return false;
    };

    void promoteIfSessionExists();

    const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
      if (!active || !session?.user) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        setStage("reset");
      }
    });

    const timeout = window.setTimeout(() => {
      void promoteIfSessionExists().then((ready) => {
        if (!active || ready) return;
        setStage("invalid");
        setError("This recovery link is invalid or has expired. Request a new password-reset email.");
      });
    }, 4500);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function requestRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = supabase;
    if (!supabaseConfigured || !client) {
      setError("Password recovery is unavailable because authentication is not configured in this build.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const redirectUrl = new URL(window.location.href);
      redirectUrl.search = "?flow=recovery";
      redirectUrl.hash = "";

      const { error: recoveryError } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUrl.toString(),
      });

      if (recoveryError) throw recoveryError;

      setStage("sent");
      setMessage("If an Averis account exists for that email, a password-reset link has been sent. Check your inbox and spam folder.");
    } catch {
      setError("The recovery email could not be sent right now. Wait a moment and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = supabase;
    if (!supabaseConfigured || !client) return;

    if (!allChecksPass(checks)) {
      setError("Use at least 12 characters with lowercase, uppercase, a number, and a symbol.");
      return;
    }
    if (!passwordsMatch) {
      setError("The two passwords do not match.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const { error: updateError } = await client.auth.updateUser({ password });
      if (updateError) throw updateError;

      const { error: signOutError } = await client.auth.signOut({ scope: "global" });
      setStage("success");
      setPassword("");
      setConfirmPassword("");
      setMessage(
        signOutError
          ? "Your password was changed. Sign in again with the new password; if another session remains active, sign it out from account security."
          : "Your password was changed and existing refresh sessions were signed out. You can now sign in with the new password.",
      );
    } catch {
      setError("The password could not be updated. The recovery link may have expired; request a new one and try again.");
    } finally {
      setBusy(false);
    }
  }

  const showRequest = stage === "request" || stage === "sent" || stage === "invalid";

  return (
    <main className={styles.page}>
      <section className={styles.shell} aria-labelledby="recovery-title">
        <a className={styles.brand} href="../" aria-label="Return to Averis home">
          <span className={styles.mark}>A</span>
          <span><strong>Averis</strong><small>Account recovery</small></span>
        </a>

        <div className={styles.card}>
          <p className={styles.eyebrow}>SECURE ACCOUNT RECOVERY</p>
          <h1 id="recovery-title">
            {stage === "reset" ? "Choose a new password" : stage === "success" ? "Password updated" : "Reset your password"}
          </h1>
          <p className={styles.lede}>
            {stage === "reset"
              ? "Your recovery link is valid. Choose a strong password for your Averis account."
              : stage === "success"
                ? "Your account recovery is complete."
                : "Enter the email address used for your Averis account. We will send a secure recovery link if the account exists."}
          </p>

          {stage === "checking" && (
            <div className={styles.status} role="status" aria-live="polite">
              <span className={styles.spinner} aria-hidden="true" />
              <span><strong>Checking recovery link</strong><small>Please wait while Averis verifies the recovery session.</small></span>
            </div>
          )}

          {error && <div className={styles.error} role="alert">{error}</div>}
          {message && <div className={styles.notice} role="status" aria-live="polite">{message}</div>}

          {showRequest && (
            <form className={styles.form} onSubmit={requestRecovery}>
              <label>
                <span>Email address</span>
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <button type="submit" disabled={busy || !supabaseConfigured}>
                {busy ? "Sending secure link…" : "Send password-reset link"}
              </button>
              {!supabaseConfigured && <small className={styles.helper}>Authentication is not configured in this local build.</small>}
            </form>
          )}

          {stage === "reset" && (
            <form className={styles.form} onSubmit={updatePassword}>
              <label>
                <span>New password</span>
                <input
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 12 characters"
                />
              </label>
              <label>
                <span>Confirm new password</span>
                <input
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter your new password"
                />
              </label>

              <div className={styles.policy} aria-label="Password requirements">
                <span data-ok={checks.length}>12+ characters</span>
                <span data-ok={checks.lowercase}>Lowercase</span>
                <span data-ok={checks.uppercase}>Uppercase</span>
                <span data-ok={checks.number}>Number</span>
                <span data-ok={checks.symbol}>Symbol</span>
                <span data-ok={passwordsMatch}>Passwords match</span>
              </div>

              <button type="submit" disabled={busy || !allChecksPass(checks) || !passwordsMatch}>
                {busy ? "Updating password…" : "Update password securely"}
              </button>
            </form>
          )}

          {stage === "success" && (
            <a className={styles.primaryLink} href="../">Return to login</a>
          )}

          {stage !== "success" && (
            <a className={styles.backLink} href="../">← Back to login</a>
          )}
        </div>

        <p className={styles.securityNote}>Averis never asks you to send your password by email or chat.</p>
      </section>
    </main>
  );
}
