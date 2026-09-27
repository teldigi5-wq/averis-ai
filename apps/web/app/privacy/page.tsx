"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase, supabaseConfigured } from "../../lib/supabase";
import styles from "./privacy.module.css";

const DELETE_PHRASE = "DELETE MY ACCOUNT";

type ExportPayload = {
  schema_version: string;
  generated_at: string;
  identity: {
    user_id: string;
    email: string | null;
    created_at: string;
  };
  profile: Record<string, unknown> | null;
  scans: Record<string, unknown>[];
  submission_fingerprints: Record<string, unknown>[];
  api_rate_limits: Record<string, unknown>[];
  storage_note: string;
};

export default function PrivacyPage() {
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUser(data.session?.user ?? null);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function exportData() {
    if (!supabase || !user) return;
    setBusy("export");
    setError("");
    setNotice("");

    try {
      const { data, error: rpcError } = await supabase.rpc("export_my_account_data");
      if (rpcError) throw rpcError;
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("Averis returned an invalid account-export payload.");
      }

      const payload = data as unknown as ExportPayload;
      const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `averis-account-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice("Your account export was generated locally in this browser.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export your Averis account data.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount() {
    if (!supabase || !user) return;
    if (confirmation !== DELETE_PHRASE) {
      setError(`Type ${DELETE_PHRASE} exactly to confirm permanent deletion.`);
      return;
    }

    setBusy("delete");
    setError("");
    setNotice("");

    try {
      const { error: rpcError } = await supabase.rpc("delete_my_account", {
        p_confirmation: confirmation,
      });
      if (rpcError) throw rpcError;

      await supabase.auth.signOut();
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete your Averis account.");
      setBusy(null);
    }
  }

  if (!supabaseConfigured) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <p className={styles.eyebrow}>PRIVACY CONTROLS</p>
          <h1>Account privacy controls require Supabase SaaS mode.</h1>
          <p>Local developer mode does not create a persistent student account to export or delete.</p>
          <a className={styles.linkButton} href="/">Return to Averis</a>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <span className={styles.brandMark}>A</span>
          <p className={styles.eyebrow}>AVERIS PRIVACY</p>
          <h1>Sign in to manage your account data.</h1>
          <p>Exports and deletion are scoped to the currently authenticated Averis account.</p>
          <a className={styles.linkButton} href="/">Return to Averis and sign in</a>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>ACCOUNT PRIVACY</p>
          <h1>Your Averis data should remain under your control.</h1>
          <p className={styles.lede}>Export the account data Averis stores about you, or permanently delete your account and user-owned records.</p>
        </div>
        <div className={styles.identityCard}>
          <span>SIGNED IN AS</span>
          <strong>{user.email ?? "Email unavailable"}</strong>
          <small>{user.id}</small>
        </div>
      </section>

      {(error || notice) && (
        <section className={error ? styles.messageError : styles.messageNotice} role="status">
          {error || notice}
        </section>
      )}

      <section className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.cardHead}>
            <span>01</span>
            <div><small>PORTABILITY</small><h2>Export my data</h2></div>
          </div>
          <p>Download a JSON snapshot containing your account identity fields, profile, scan metadata, derived submission fingerprints, and recent API rate-limit counters.</p>
          <ul>
            <li>Original uploaded assignment files are not included because the beta does not retain them.</li>
            <li>Password hashes, provider secrets, and shared scholarly source catalog records are not exported.</li>
            <li>The export file is created locally in your browser.</li>
          </ul>
          <button type="button" onClick={exportData} disabled={busy !== null}>
            {busy === "export" ? "Preparing export…" : "Download my Averis data"}
          </button>
        </article>

        <article className={`${styles.card} ${styles.dangerCard}`}>
          <div className={styles.cardHead}>
            <span>02</span>
            <div><small>PERMANENT DELETION</small><h2>Delete my account</h2></div>
          </div>
          <p>Deletion removes your authentication identity. Database foreign-key cascades then remove your profile, scans, derived submission fingerprints, and per-user rate-limit counters.</p>
          <div className={styles.warningBox}>
            <strong>This cannot be undone.</strong>
            <span>Used credits, scan history, and the deleted identity cannot be restored. Export your data first if you want a copy.</span>
          </div>
          <label className={styles.confirmLabel}>
            <span>Type <b>{DELETE_PHRASE}</b> to confirm</span>
            <input
              value={confirmation}
              onChange={(event) => {
                setConfirmation(event.target.value);
                setError("");
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder={DELETE_PHRASE}
            />
          </label>
          <button
            type="button"
            className={styles.deleteButton}
            onClick={deleteAccount}
            disabled={busy !== null || confirmation !== DELETE_PHRASE}
          >
            {busy === "delete" ? "Deleting account…" : "Permanently delete account"}
          </button>
        </article>
      </section>

      <section className={styles.scopeCard}>
        <p className={styles.eyebrow}>DATA BOUNDARY</p>
        <h2>What account deletion does — and does not — remove.</h2>
        <div className={styles.scopeGrid}>
          <div><b>Removed</b><span>Auth identity, profile, private scan metadata, derived submission fingerprints, user rate-limit counters.</span></div>
          <div><b>Not user-owned</b><span>Shared Crossref/OpenAlex-normalized scholarly metadata and public source-catalog records.</span></div>
          <div><b>Never retained</b><span>Original uploaded TXT/PDF/DOCX assignment files in the current beta flow.</span></div>
        </div>
      </section>
    </main>
  );
}
