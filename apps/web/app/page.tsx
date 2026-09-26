"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase, supabaseConfigured } from "../lib/supabase";

type ExtractedDocument = {
  filename: string;
  media_type: string | null;
  characters: number;
  words: number;
  text: string;
};

type PassageMatch = {
  document_sentence: string;
  source_sentence: string;
  score: number;
};

type SimilarityReport = {
  source_name: string;
  similarity_percent: number;
  shingle_jaccard: number;
  sentence_match_score: number;
  matched_passages: PassageMatch[];
  evidence_note: string;
  scan_id: string | null;
  credits_remaining: number | null;
};

type Profile = {
  display_name: string | null;
  plan: string;
  credits_remaining: number;
  monthly_credit_allowance: number;
};

type Scan = {
  id: string;
  document_name: string;
  source_name: string;
  similarity_percent: number | null;
  credits_used: number;
  created_at: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function Home() {
  const [document, setDocument] = useState<ExtractedDocument | null>(null);
  const [reference, setReference] = useState("");
  const [report, setReport] = useState<SimilarityReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const scoreTone = useMemo(() => {
    if (!report) return "score score-neutral";
    if (report.similarity_percent >= 50) return "score score-high";
    if (report.similarity_percent >= 20) return "score score-medium";
    return "score score-low";
  }, [report]);

  const canScan = !supabaseConfigured || Boolean(user && (profile?.credits_remaining ?? 0) > 0);

  useEffect(() => {
    if (!supabase) return;

    let active = true;

    async function bootstrap() {
      const { data } = await supabase!.auth.getSession();
      if (!active) return;
      const nextUser = data.session?.user ?? null;
      setUser(nextUser);
      if (nextUser) await loadAccount(nextUser.id);
    }

    void bootstrap();
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) {
        void loadAccount(nextUser.id);
      } else {
        setProfile(null);
        setScans([]);
        setDocument(null);
        setReport(null);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function loadAccount(userId: string) {
    if (!supabase) return;

    const [{ data: profileData, error: profileError }, { data: scanData, error: scanError }] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, plan, credits_remaining, monthly_credit_allowance")
        .eq("user_id", userId)
        .single(),
      supabase
        .from("scans")
        .select("id, document_name, source_name, similarity_percent, credits_used, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (!profileError && profileData) setProfile(profileData as Profile);
    if (!scanError && scanData) setScans(scanData as Scan[]);
  }

  async function accessToken() {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      if (authMode === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName.trim() || undefined } },
        });
        if (authError) throw authError;
        if (!data.session) {
          setNotice("Account created. Check your email to confirm your Averis account, then sign in.");
          setAuthMode("signin");
        } else {
          setNotice("Welcome to the Averis free beta. Your account includes 5 scan credits.");
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        setNotice("Signed in successfully.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setNotice("Signed out.");
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setReport(null);

    if (supabaseConfigured && !user) {
      setError("Sign in before uploading a submission.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Choose a TXT, PDF or DOCX file first.");
      return;
    }

    setBusy(true);
    try {
      const token = await accessToken();
      const data = new FormData();
      data.append("file", file);
      const response = await fetch(`${API_URL}/api/v1/documents/extract`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: data,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail ?? "Upload failed");
      setDocument(payload);
      setNotice("Document extracted in memory. Averis does not persist the original upload in this beta flow.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function compare() {
    if (!document || !reference.trim()) {
      setError("Upload a document and paste reference text to compare.");
      return;
    }
    if (!canScan) {
      setError("No free scan credits remain on this account.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const token = await accessToken();
      const response = await fetch(`${API_URL}/api/v1/similarity/compare`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          document_text: document.text,
          source_text: reference,
          source_name: "Manual reference",
          document_name: document.filename,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail ?? "Similarity analysis failed");
      setReport(payload);
      if (payload.credits_remaining !== null && profile) {
        setProfile({ ...profile, credits_remaining: payload.credits_remaining });
      }
      if (user) await loadAccount(user.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  async function clearHistory() {
    if (!supabase || !user) return;
    setBusy(true);
    setError("");
    try {
      const { error: deleteError } = await supabase.from("scans").delete().eq("user_id", user.id);
      if (deleteError) throw deleteError;
      setScans([]);
      setNotice("Scan history deleted. Used credits are not restored.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete scan history.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <div className="brandMark">A</div>
        <div className="brandText">
          <strong>Averis</strong>
          <span>Academic Integrity Intelligence</span>
        </div>
        <div className="topActions">
          {supabaseConfigured && user && (
            <span className="creditPill"><b>{profile?.credits_remaining ?? "…"}</b> free credits</span>
          )}
          <div className="status"><i /> Zero-cost beta</div>
          {supabaseConfigured && user && <button className="ghostButton" onClick={signOut}>Sign out</button>}
        </div>
      </header>

      <section className="hero">
        <p className="eyebrow">CHECK BEFORE YOU SUBMIT</p>
        <h1>Understand similarity.<br /><span>Verify the evidence.</span></h1>
        <p className="lede">Averis helps students review similarity and source evidence before submission. The beta is designed to run on free infrastructure without pretending AI can prove misconduct.</p>
      </section>

      {!supabaseConfigured && (
        <section className="devBanner">
          <div><strong>Developer mode</strong><span>Supabase is not configured, so authentication and credits are bypassed locally.</span></div>
          <code>SAAS_MODE=false</code>
        </section>
      )}

      {supabaseConfigured && !user && (
        <section className="accountGrid">
          <article className="panel accountIntro">
            <p className="eyebrow">AVERIS FREE BETA</p>
            <h2>Start with 5 free scans.</h2>
            <p>Accounts protect usage limits and keep each student's scan history private with database row-level security.</p>
            <div className="trustList">
              <span>✓ No card required</span>
              <span>✓ Original upload not stored by this beta flow</span>
              <span>✓ Delete your scan history</span>
            </div>
          </article>
          <article className="panel authPanel">
            <div className="authTabs">
              <button className={authMode === "signin" ? "authTab active" : "authTab"} onClick={() => setAuthMode("signin")}>Sign in</button>
              <button className={authMode === "signup" ? "authTab active" : "authTab"} onClick={() => setAuthMode("signup")}>Create account</button>
            </div>
            <form onSubmit={submitAuth} className="authForm">
              {authMode === "signup" && (
                <label><span>Name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" /></label>
              )}
              <label><span>Email</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
              <label><span>Password</span><input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>
              <button type="submit" disabled={busy}>{busy ? "Working…" : authMode === "signup" ? "Create free account" : "Sign in"}</button>
            </form>
          </article>
        </section>
      )}

      {(!supabaseConfigured || user) && (
        <>
          {supabaseConfigured && user && (
            <section className="accountStrip">
              <div><span>ACCOUNT</span><strong>{profile?.display_name || user.email}</strong></div>
              <div><span>PLAN</span><strong>{profile?.plan?.toUpperCase() ?? "FREE"}</strong></div>
              <div><span>AVAILABLE SCANS</span><strong>{profile?.credits_remaining ?? "…"}</strong></div>
              <div><span>PRIVACY</span><strong>Original not retained</strong></div>
            </section>
          )}

          <section className="workspace">
            <article className="panel uploadPanel">
              <div className="panelHead">
                <div><span className="step">01</span><h2>Upload submission</h2></div>
                <span className="chip">TXT · PDF · DOCX</span>
              </div>
              <form onSubmit={upload}>
                <label className="dropzone">
                  <input name="file" type="file" accept=".txt,.pdf,.docx" />
                  <span className="dropIcon">↑</span>
                  <strong>Choose your submission</strong>
                  <small>Maximum 15 MB · processed in memory</small>
                </label>
                <button type="submit" disabled={busy}>{busy ? "Processing…" : "Extract document"}</button>
              </form>
              {document && (
                <div className="docCard">
                  <div><span className="docIcon">DOC</span></div>
                  <div><strong>{document.filename}</strong><span>{document.words.toLocaleString()} words · {document.characters.toLocaleString()} characters</span></div>
                  <b>Ready</b>
                </div>
              )}
            </article>

            <article className="panel">
              <div className="panelHead">
                <div><span className="step">02</span><h2>Reference source</h2></div>
                <span className="chip">BETA CORPUS</span>
              </div>
              <textarea value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Paste source/reference text here. Automatic scholarly and web source discovery arrives in later milestones." />
              <button className="primary" onClick={compare} disabled={busy || !document || !canScan}>{busy ? "Analyzing…" : canScan ? "Run integrity analysis · 1 credit" : "No credits remaining"}</button>
            </article>
          </section>
        </>
      )}

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {(!supabaseConfigured || user) && (
        <section className="results">
          <article className="panel scorePanel">
            <p>SIMILARITY</p>
            <div className={scoreTone}>{report ? `${report.similarity_percent}%` : "—"}</div>
            <small>{report ? "Evidence-weighted score" : "Awaiting analysis"}</small>
          </article>
          <article className="panel metric"><span>Word-shingle overlap</span><strong>{report ? `${report.shingle_jaccard}%` : "—"}</strong></article>
          <article className="panel metric"><span>Matched-passage strength</span><strong>{report ? `${report.sentence_match_score}%` : "—"}</strong></article>
          <article className="panel metric"><span>Evidence matches</span><strong>{report ? report.matched_passages.length : "—"}</strong></article>
        </section>
      )}

      {report && (
        <section className="panel evidence">
          <div className="panelHead"><div><span className="step">03</span><h2>Evidence</h2></div></div>
          <p className="note">{report.evidence_note}</p>
          {report.matched_passages.length === 0 ? <p className="empty">No strong sentence-level matches found.</p> : report.matched_passages.map((match, index) => (
            <div className="match" key={`${match.document_sentence}-${index}`}>
              <div className="matchScore">{Math.round(match.score)}%</div>
              <div><small>SUBMISSION</small><p>{match.document_sentence}</p><small>SOURCE</small><p>{match.source_sentence}</p></div>
            </div>
          ))}
        </section>
      )}

      {supabaseConfigured && user && (
        <section className="panel historyPanel">
          <div className="panelHead">
            <div><span className="step">04</span><h2>Your scan history</h2></div>
            <button className="dangerButton" disabled={busy || scans.length === 0} onClick={clearHistory}>Delete history</button>
          </div>
          {scans.length === 0 ? (
            <p className="empty">No saved scan metadata yet.</p>
          ) : (
            <div className="historyList">
              {scans.map((scan) => (
                <div className="historyRow" key={scan.id}>
                  <div><strong>{scan.document_name}</strong><span>{new Date(scan.created_at).toLocaleString()}</span></div>
                  <div><span>Similarity</span><strong>{scan.similarity_percent ?? 0}%</strong></div>
                  <div><span>Credits</span><strong>-{scan.credits_used}</strong></div>
                </div>
              ))}
            </div>
          )}
          <p className="privacyNote">Averis stores scan metadata for your history. The current beta analysis flow does not upload the original file to Supabase Storage.</p>
        </section>
      )}

      <footer>Averis · Zero-Cost SaaS Foundation · Similarity is evidence for human review, not an automatic misconduct verdict.</footer>
    </main>
  );
}
