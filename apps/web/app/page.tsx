"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase, supabaseConfigured } from "../lib/supabase";
import IntegrityReportExport from "./IntegrityReportExport";

type ToolTab = "integrity" | "sources" | "references" | "history";
type EvidenceView = "passages" | "documents";

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
  exclusions_applied: string[];
  min_match_words: number;
  document_words_original: number | null;
  document_words_analyzed: number | null;
  document_words_excluded: number | null;
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

type SourceResult = {
  provider: string;
  external_id: string;
  title: string;
  doi: string | null;
  url: string | null;
  published_year: number | null;
  authors: string[];
  relevance_score: number | null;
  identity: string;
};

type SourceSearchResponse = {
  provider: string;
  query: string;
  results: SourceResult[];
  cost_policy: string;
};

type SourceResolveResponse = {
  result: SourceResult;
};

type ParsedReference = {
  index: number;
  raw: string;
  doi: string | null;
  year: string | null;
  author_key: string | null;
  warnings: string[];
};

type CitationMention = {
  raw: string;
  author_key: string;
  year: string;
  start: number;
};

type ReferenceParseResponse = {
  references: ParsedReference[];
  count: number;
  scope_note: string;
};

type CitationAuditResponse = {
  references: ParsedReference[];
  citations: CitationMention[];
  unmatched_citations: CitationMention[];
  uncited_references: ParsedReference[];
  matched_citation_count: number;
  scope_note: string;
};

type ReferenceVerificationResult = {
  reference: ParsedReference;
  status: string;
  match_method: string | null;
  bibliographic_match_score: number | null;
  source: SourceResult | null;
  issues: string[];
};

type ReferenceVerificationResponse = {
  provider: string;
  checked_count: number;
  results: ReferenceVerificationResult[];
  cost_policy: string;
  scope_note: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const toolCopy: Record<ToolTab, { eyebrow: string; title: string; description: string }> = {
  integrity: {
    eyebrow: "INTEGRITY SCAN",
    title: "Review similarity with evidence, not guesses.",
    description: "Upload your draft, compare it with source text, and inspect the exact passages behind the score.",
  },
  sources: {
    eyebrow: "SOURCE FINDER",
    title: "Find and resolve scholarly sources.",
    description: "Search Crossref metadata or resolve a DOI without spending a scan credit or using a paid API key.",
  },
  references: {
    eyebrow: "REFERENCE AUDIT",
    title: "Check citations before submission.",
    description: "Parse references, compare common author-year citations, and verify bounded bibliographic evidence with Crossref.",
  },
  history: {
    eyebrow: "SCAN HISTORY",
    title: "Keep your review trail under control.",
    description: "See previous scan metadata and remove it whenever you want. Original upload files are not retained in this beta flow.",
  },
};

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function scoreClass(score: number | null | undefined) {
  if (score == null) return "confidence neutral";
  if (score >= 75) return "confidence good";
  if (score >= 50) return "confidence review";
  return "confidence weak";
}

function viewerSentences(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return [];
  return compact
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.split(/\s+/).length >= 3);
}

export default function Home() {
  const [activeTool, setActiveTool] = useState<ToolTab>("integrity");
  const [document, setDocument] = useState<ExtractedDocument | null>(null);
  const [reference, setReference] = useState("");
  const [report, setReport] = useState<SimilarityReport | null>(null);
  const [evidenceView, setEvidenceView] = useState<EvidenceView>("passages");
  const [excludeQuotes, setExcludeQuotes] = useState(false);
  const [excludeBibliography, setExcludeBibliography] = useState(false);
  const [minMatchWords, setMinMatchWords] = useState(3);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [sourceQuery, setSourceQuery] = useState("");
  const [doiQuery, setDoiQuery] = useState("");
  const [sourceResults, setSourceResults] = useState<SourceResult[]>([]);
  const [resolvedSource, setResolvedSource] = useState<SourceResult | null>(null);

  const [referencesText, setReferencesText] = useState("");
  const [parsedReferences, setParsedReferences] = useState<ReferenceParseResponse | null>(null);
  const [citationAudit, setCitationAudit] = useState<CitationAuditResponse | null>(null);
  const [referenceVerification, setReferenceVerification] = useState<ReferenceVerificationResponse | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const busy = busyAction !== null;
  const currentTool = toolCopy[activeTool];
  const scoreTone = useMemo(() => {
    if (!report) return "score score-neutral";
    if (report.similarity_percent >= 50) return "score score-high";
    if (report.similarity_percent >= 20) return "score score-medium";
    return "score score-low";
  }, [report]);
  const documentMatchedSentences = useMemo(
    () => new Set(report?.matched_passages.map((match) => match.document_sentence) ?? []),
    [report],
  );
  const sourceMatchedSentences = useMemo(
    () => new Set(report?.matched_passages.map((match) => match.source_sentence) ?? []),
    [report],
  );

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
        setEvidenceView("passages");
        setActiveTool("integrity");
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

  async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await accessToken();
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(`${API_URL}${path}`, { ...init, headers });
    const payload = (await response.json().catch(() => ({}))) as { detail?: string } & T;
    if (!response.ok) throw new Error(payload.detail ?? `Request failed (${response.status}).`);
    return payload as T;
  }

  function beginAction(action: string) {
    setBusyAction(action);
    setError("");
    setNotice("");
  }

  function endAction() {
    setBusyAction(null);
  }

  function invalidateReport() {
    setReport(null);
    setEvidenceView("passages");
    setError("");
    setNotice("");
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    beginAction("auth");

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
      endAction();
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setNotice("Signed out.");
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReport(null);
    setEvidenceView("passages");

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

    beginAction("upload");
    try {
      const data = new FormData();
      data.append("file", file);
      const payload = await apiRequest<ExtractedDocument>("/api/v1/documents/extract", {
        method: "POST",
        body: data,
      });
      setDocument(payload);
      setNotice("Document extracted in memory. The original upload is not persisted by this beta flow.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      endAction();
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

    beginAction("compare");
    try {
      const payload = await apiRequest<SimilarityReport>("/api/v1/similarity/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_text: document.text,
          source_text: reference,
          source_name: "Manual reference",
          document_name: document.filename,
          exclude_quotes: excludeQuotes,
          exclude_bibliography: excludeBibliography,
          min_match_words: minMatchWords,
        }),
      });
      setReport(payload);
      setEvidenceView("passages");
      if (payload.credits_remaining !== null && profile) {
        setProfile({ ...profile, credits_remaining: payload.credits_remaining });
      }
      if (user) await loadAccount(user.id);
      setNotice("Integrity scan complete. Review the evidence and applied controls rather than treating the percentage as a verdict.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      endAction();
    }
  }

  async function searchSources(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const query = sourceQuery.trim();
    if (query.length < 3) {
      setError("Enter at least 3 characters to search scholarly sources.");
      return;
    }

    beginAction("source-search");
    try {
      const payload = await apiRequest<SourceSearchResponse>(
        `/api/v1/sources/search?q=${encodeURIComponent(query)}&limit=5`,
      );
      setSourceResults(payload.results);
      setNotice(payload.results.length ? `Found ${payload.results.length} Crossref candidates.` : "No Crossref candidates found.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Source search failed.");
    } finally {
      endAction();
    }
  }

  async function resolveDoi(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const doi = doiQuery.trim();
    if (!doi) {
      setError("Enter a DOI to resolve.");
      return;
    }

    beginAction("doi-resolve");
    setResolvedSource(null);
    try {
      const payload = await apiRequest<SourceResolveResponse>(
        `/api/v1/sources/resolve?doi=${encodeURIComponent(doi)}`,
      );
      setResolvedSource(payload.result);
      setNotice("Crossref DOI metadata resolved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "DOI lookup failed.");
    } finally {
      endAction();
    }
  }

  async function parseReferences() {
    if (!referencesText.trim()) {
      setError("Paste a bibliography or reference list first.");
      return;
    }
    beginAction("reference-parse");
    try {
      const payload = await apiRequest<ReferenceParseResponse>("/api/v1/references/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ references_text: referencesText }),
      });
      setParsedReferences(payload);
      setNotice(`Parsed ${payload.count} reference${payload.count === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reference parsing failed.");
    } finally {
      endAction();
    }
  }

  async function auditReferences() {
    if (!document) {
      setError("Upload your submission in Integrity Scan before running citation consistency checks.");
      return;
    }
    if (!referencesText.trim()) {
      setError("Paste a bibliography or reference list first.");
      return;
    }

    beginAction("reference-audit");
    try {
      const payload = await apiRequest<CitationAuditResponse>("/api/v1/references/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_text: document.text, references_text: referencesText }),
      });
      setCitationAudit(payload);
      setParsedReferences({ references: payload.references, count: payload.references.length, scope_note: payload.scope_note });
      setNotice("Citation consistency audit complete for common author-year citations.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Citation audit failed.");
    } finally {
      endAction();
    }
  }

  async function verifyReferences() {
    if (!referencesText.trim()) {
      setError("Paste a bibliography or reference list first.");
      return;
    }

    beginAction("reference-verify");
    try {
      const payload = await apiRequest<ReferenceVerificationResponse>("/api/v1/references/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ references_text: referencesText, limit: 5 }),
      });
      setReferenceVerification(payload);
      setNotice(`Crossref checked ${payload.checked_count} reference${payload.checked_count === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reference verification failed.");
    } finally {
      endAction();
    }
  }

  async function clearHistory() {
    if (!supabase || !user) return;
    beginAction("history-delete");
    try {
      const { error: deleteError } = await supabase.from("scans").delete().eq("user_id", user.id);
      if (deleteError) throw deleteError;
      setScans([]);
      setNotice("Scan history deleted. Used credits are not restored.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete scan history.");
    } finally {
      endAction();
    }
  }

  function renderSourceCard(source: SourceResult, key: string, highlighted = false) {
    return (
      <article className={highlighted ? "sourceCard resolved" : "sourceCard"} key={key}>
        <div className="sourceTopline">
          <span className="providerBadge">{source.provider.toUpperCase()}</span>
          {source.relevance_score !== null && (
            <span className={scoreClass(source.relevance_score)}>{Math.round(source.relevance_score)} relevance</span>
          )}
        </div>
        <h3>{source.title}</h3>
        <p className="sourceMeta">
          {source.authors.length ? source.authors.slice(0, 3).join(", ") : "Author metadata unavailable"}
          {source.published_year ? ` · ${source.published_year}` : ""}
        </p>
        <div className="sourceFacts">
          <span><b>DOI</b>{source.doi ?? "Not supplied"}</span>
          <span><b>Evidence</b>Metadata candidate, not a misconduct verdict</span>
        </div>
        {source.url && (
          <a className="sourceLink" href={source.url} target="_blank" rel="noreferrer">Open source record ↗</a>
        )}
      </article>
    );
  }

  return (
    <main>
      <header className="topbar">
        <button className="brandButton" onClick={() => setActiveTool("integrity")} aria-label="Open Averis integrity scan">
          <span className="brandMark">A</span>
          <span className="brandText"><strong>Averis</strong><small>Academic Integrity Intelligence</small></span>
        </button>
        <div className="topActions">
          {supabaseConfigured && user && (
            <span className="creditPill"><b>{profile?.credits_remaining ?? "…"}</b> scan credits</span>
          )}
          <span className="status"><i /> Evidence-first beta</span>
          {supabaseConfigured && user && <button className="ghostButton" onClick={signOut}>Sign out</button>}
        </div>
      </header>

      <section className="hero">
        <div className="heroCopy">
          <p className="eyebrow">CHECK BEFORE YOU SUBMIT</p>
          <h1>Academic review that shows <span>why.</span></h1>
          <p className="lede">Averis combines evidence-backed similarity review, scholarly source discovery, and citation intelligence in one student workspace.</p>
          <div className="heroProof">
            <span><b>01</b> Exact passage evidence</span>
            <span><b>02</b> Crossref source metadata</span>
            <span><b>03</b> Citation consistency checks</span>
          </div>
        </div>
        <div className="heroOrb" aria-hidden="true"><span>A</span><i /><i /><i /></div>
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
            <h2>Start with 5 evidence-backed scans.</h2>
            <p>Use the same account for similarity review, source discovery, citation checks, and private scan history.</p>
            <div className="trustList">
              <span>✓ No card required</span>
              <span>✓ Original upload not retained by the beta scan flow</span>
              <span>✓ Source and reference tools do not spend scan credits</span>
              <span>✓ Human-review language instead of automated accusations</span>
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
              <button type="submit" disabled={busy}>{busyAction === "auth" ? "Working…" : authMode === "signup" ? "Create free account" : "Sign in"}</button>
            </form>
          </article>
        </section>
      )}

      {(!supabaseConfigured || user) && (
        <section className="productShell">
          <aside className="toolRail">
            <div className="railAccount">
              <span className="railAvatar">{(profile?.display_name || user?.email || "A").slice(0, 1).toUpperCase()}</span>
              <div><small>WORKSPACE</small><strong>{profile?.display_name || user?.email || "Local developer"}</strong></div>
            </div>
            <nav className="toolNav" aria-label="Averis tools">
              <button className={activeTool === "integrity" ? "toolButton active" : "toolButton"} onClick={() => setActiveTool("integrity")}>
                <span className="toolIcon">◎</span><span><b>Integrity Scan</b><small>Similarity + passages</small></span>
              </button>
              <button className={activeTool === "sources" ? "toolButton active" : "toolButton"} onClick={() => setActiveTool("sources")}>
                <span className="toolIcon">⌕</span><span><b>Source Finder</b><small>Crossref + DOI</small></span>
              </button>
              <button className={activeTool === "references" ? "toolButton active" : "toolButton"} onClick={() => setActiveTool("references")}>
                <span className="toolIcon">≡</span><span><b>Reference Audit</b><small>Citations + verification</small></span>
              </button>
              {supabaseConfigured && user && (
                <button className={activeTool === "history" ? "toolButton active" : "toolButton"} onClick={() => setActiveTool("history")}>
                  <span className="toolIcon">↺</span><span><b>History</b><small>Your scan metadata</small></span>
                </button>
              )}
            </nav>
            <div className="railSummary">
              <div><span>PLAN</span><strong>{profile?.plan?.toUpperCase() ?? (supabaseConfigured ? "FREE" : "LOCAL")}</strong></div>
              <div><span>SCANS</span><strong>{supabaseConfigured ? profile?.credits_remaining ?? "…" : "∞"}</strong></div>
              <div><span>UPLOAD</span><strong>{document ? "READY" : "EMPTY"}</strong></div>
            </div>
            <p className="railPrivacy"><i /> Original submission content is processed in memory in the current beta flow.</p>
          </aside>

          <section className="toolCanvas">
            <div className="toolHero">
              <div><p className="eyebrow">{currentTool.eyebrow}</p><h2>{currentTool.title}</h2><p>{currentTool.description}</p></div>
              <span className="costChip">{activeTool === "integrity" ? "1 credit / scan" : "No scan credit"}</span>
            </div>

            {error && <div className="error"><span>!</span>{error}</div>}
            {notice && <div className="notice"><span>✓</span>{notice}</div>}

            {activeTool === "integrity" && (
              <>
                <section className="workspaceGrid">
                  <article className="panel uploadPanel">
                    <div className="panelHead">
                      <div><span className="step">01</span><div><small>SUBMISSION</small><h3>Upload your draft</h3></div></div>
                      <span className="chip">TXT · PDF · DOCX</span>
                    </div>
                    <form onSubmit={upload}>
                      <label className="dropzone">
                        <input name="file" type="file" accept=".txt,.pdf,.docx" />
                        <span className="dropIcon">↑</span>
                        <strong>{document ? "Replace submission" : "Choose your submission"}</strong>
                        <small>Maximum 15 MB · processed in memory</small>
                      </label>
                      <button type="submit" disabled={busy}>{busyAction === "upload" ? "Extracting…" : "Extract document"}</button>
                    </form>
                    {document && (
                      <div className="docCard">
                        <span className="docIcon">DOC</span>
                        <div><strong>{document.filename}</strong><span>{document.words.toLocaleString()} words · {document.characters.toLocaleString()} characters</span></div>
                        <b>READY</b>
                      </div>
                    )}
                  </article>

                  <article className="panel sourceComparePanel">
                    <div className="panelHead">
                      <div><span className="step">02</span><div><small>COMPARISON SOURCE</small><h3>Paste source text</h3></div></div>
                      <span className="chip">MANUAL EVIDENCE</span>
                    </div>
                    <textarea value={reference} onChange={(event) => { setReference(event.target.value); invalidateReport(); }} placeholder="Paste the source text you want to compare with your submission…" />
                    <div className="actionHint"><span>Exact/fuzzy evidence only</span><span>{reference.trim() ? `${reference.trim().split(/\s+/).length} source words` : "Waiting for source"}</span></div>
                    <button className="primary" onClick={compare} disabled={busy || !document || !canScan}>
                      {busyAction === "compare" ? "Analyzing evidence…" : canScan ? "Run integrity analysis · 1 credit" : "No credits remaining"}
                    </button>
                  </article>
                </section>

                <section className="panel evidenceControlsPanel">
                  <div className="panelHead">
                    <div><span className="step">03</span><div><small>ANALYSIS CONTROLS</small><h3>Choose what counts as primary evidence</h3></div></div>
                    <span className="chip">TRANSPARENT FILTERS</span>
                  </div>
                  <div className="controlGrid">
                    <label className="controlCard">
                      <span className="controlTitle"><input type="checkbox" checked={excludeQuotes} onChange={(event) => { setExcludeQuotes(event.target.checked); invalidateReport(); }} /><b>Exclude quotations</b></span>
                      <small>Ignore explicit straight or curly double-quoted spans when primary evidence is calculated.</small>
                    </label>
                    <label className="controlCard">
                      <span className="controlTitle"><input type="checkbox" checked={excludeBibliography} onChange={(event) => { setExcludeBibliography(event.target.checked); invalidateReport(); }} /><b>Exclude bibliography</b></span>
                      <small>Ignore text after a standalone References, Bibliography, Works Cited, or Reference List heading.</small>
                    </label>
                    <label className="controlCard thresholdCard">
                      <span className="controlTitle"><b>Minimum match size</b><strong>{minMatchWords} words</strong></span>
                      <input className="thresholdRange" type="range" min="3" max="50" step="1" value={minMatchWords} onChange={(event) => { setMinMatchWords(Number(event.target.value)); invalidateReport(); }} />
                      <small>Require at least this many words for exact-overlap windows and fuzzy passage evidence.</small>
                    </label>
                  </div>
                  <p className="helperText controlBoundary">These controls filter comparison evidence only. They do not decide whether a quotation is cited correctly, whether a bibliography entry is valid, or whether misconduct occurred.</p>
                  {report && (
                    <div className="analysisTrace">
                      <div><span>ORIGINAL</span><strong>{report.document_words_original ?? "—"}</strong><small>submission words</small></div>
                      <div><span>ANALYZED</span><strong>{report.document_words_analyzed ?? "—"}</strong><small>words compared</small></div>
                      <div><span>EXCLUDED</span><strong>{report.document_words_excluded ?? "—"}</strong><small>words filtered</small></div>
                      <div><span>MINIMUM</span><strong>{report.min_match_words}</strong><small>match words</small></div>
                    </div>
                  )}
                </section>

                <section className="metricGrid">
                  <article className="metricCard primaryMetric"><p>SIMILARITY</p><div className={scoreTone}>{report ? `${report.similarity_percent}%` : "—"}</div><small>{report ? "Evidence-weighted comparison" : "Awaiting analysis"}</small></article>
                  <article className="metricCard"><span>Word-shingle overlap</span><strong>{report ? `${report.shingle_jaccard}%` : "—"}</strong><small>Exact phrase structure</small></article>
                  <article className="metricCard"><span>Passage strength</span><strong>{report ? `${report.sentence_match_score}%` : "—"}</strong><small>Fuzzy sentence evidence</small></article>
                  <article className="metricCard"><span>Evidence matches</span><strong>{report ? report.matched_passages.length : "—"}</strong><small>Reviewable passages</small></article>
                </section>

                <section className="panel evidencePanel">
                  <div className="panelHead evidencePanelHead">
                    <div><span className="step">04</span><div><small>EVIDENCE VIEW</small><h3>{evidenceView === "passages" ? "Matched passages" : "Side-by-side documents"}</h3></div></div>
                    {report && (
                      <div className="evidenceHeadActions">
                        <div className="viewSwitch" role="group" aria-label="Evidence view">
                          <button className={evidenceView === "passages" ? "active" : ""} onClick={() => setEvidenceView("passages")}>Passages</button>
                          <button className={evidenceView === "documents" ? "active" : ""} onClick={() => setEvidenceView("documents")}>Documents</button>
                        </div>
                        <IntegrityReportExport documentName={document?.filename ?? "submission"} report={report} />
                        <span className="chip">{report.source_name}</span>
                      </div>
                    )}
                  </div>
                  {!report ? (
                    <div className="emptyState"><span>◎</span><h4>No evidence yet</h4><p>Upload a draft, choose your analysis controls, and compare it with source text to see matched passages here.</p></div>
                  ) : (
                    <>
                      <div className="appliedControls" aria-label="Applied analysis controls">
                        <span className="controlBadge">Minimum {report.min_match_words} words</span>
                        {report.exclusions_applied.length === 0 ? (
                          <span className="controlBadge neutralBadge">No text exclusions matched</span>
                        ) : report.exclusions_applied.map((exclusion) => (
                          <span className="controlBadge activeBadge" key={exclusion}>{statusLabel(exclusion)} excluded</span>
                        ))}
                      </div>
                      <p className="scopeNote">{report.evidence_note}</p>
                      {report.matched_passages.length === 0 ? (
                        <p className="empty">No strong sentence-level matches found after the selected controls.</p>
                      ) : evidenceView === "passages" ? (
                        report.matched_passages.map((match, index) => (
                          <div className="match" key={`${match.document_sentence}-${index}`}>
                            <div className="matchScore">{Math.round(match.score)}<small>%</small></div>
                            <div><small>SUBMISSION</small><p>{match.document_sentence}</p><small>SOURCE</small><p>{match.source_sentence}</p></div>
                          </div>
                        ))
                      ) : (
                        <>
                          <p className="viewerLegend"><span className="legendSwatch" />Highlighted sentences are the sentence-level passage evidence returned by this scan. Unhighlighted text is context only.</p>
                          <div className="documentViewer">
                            <article className="documentPane">
                              <div className="documentPaneHead"><span>SUBMISSION</span><strong>{document?.filename ?? "Submission"}</strong><small>{report.document_words_analyzed ?? "—"} analyzed words</small></div>
                              <div className="documentText">
                                {viewerSentences(document?.text ?? "").map((sentence, index) => {
                                  const matched = documentMatchedSentences.has(sentence);
                                  return <p className={matched ? "viewerSentence matched" : "viewerSentence"} key={`doc-${index}-${sentence.slice(0, 20)}`}>{matched ? <mark>{sentence}</mark> : sentence}</p>;
                                })}
                              </div>
                            </article>
                            <article className="documentPane">
                              <div className="documentPaneHead"><span>SOURCE</span><strong>{report.source_name}</strong><small>{reference.trim() ? `${reference.trim().split(/\s+/).length} source words` : "Source text"}</small></div>
                              <div className="documentText">
                                {viewerSentences(reference).map((sentence, index) => {
                                  const matched = sourceMatchedSentences.has(sentence);
                                  return <p className={matched ? "viewerSentence matched" : "viewerSentence"} key={`source-${index}-${sentence.slice(0, 20)}`}>{matched ? <mark>{sentence}</mark> : sentence}</p>;
                                })}
                              </div>
                            </article>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </section>
              </>
            )}

            {activeTool === "sources" && (
              <>
                <section className="workspaceGrid">
                  <article className="panel">
                    <div className="panelHead"><div><span className="step">01</span><div><small>SCHOLARLY SEARCH</small><h3>Search Crossref</h3></div></div><span className="chip freeChip">PUBLIC · NO KEY</span></div>
                    <form className="inlineForm" onSubmit={searchSources}>
                      <input value={sourceQuery} onChange={(event) => setSourceQuery(event.target.value)} placeholder="Article title, author, or citation details" />
                      <button type="submit" disabled={busy}>{busyAction === "source-search" ? "Searching…" : "Find sources"}</button>
                    </form>
                    <p className="helperText">Averis sends only the search phrase you explicitly enter. Results are discovery evidence, not similarity evidence.</p>
                  </article>
                  <article className="panel">
                    <div className="panelHead"><div><span className="step">02</span><div><small>DOI RESOLVER</small><h3>Verify a DOI record</h3></div></div><span className="chip">CROSSREF</span></div>
                    <form className="inlineForm" onSubmit={resolveDoi}>
                      <input value={doiQuery} onChange={(event) => setDoiQuery(event.target.value)} placeholder="10.xxxx/your-doi" />
                      <button type="submit" disabled={busy}>{busyAction === "doi-resolve" ? "Resolving…" : "Resolve DOI"}</button>
                    </form>
                    <p className="helperText">A resolved DOI confirms Crossref metadata exists. It does not prove how a source was used in your paper.</p>
                  </article>
                </section>

                {resolvedSource && (
                  <section className="panel sourceSection">
                    <div className="sectionTitle"><div><p className="eyebrow">RESOLVED DOI</p><h3>Authoritative metadata candidate</h3></div><span className="evidenceTag">External evidence</span></div>
                    {renderSourceCard(resolvedSource, `resolved-${resolvedSource.identity}`, true)}
                  </section>
                )}

                <section className="panel sourceSection">
                  <div className="sectionTitle"><div><p className="eyebrow">SEARCH RESULTS</p><h3>Scholarly candidates</h3></div><span className="resultCount">{sourceResults.length} found</span></div>
                  {sourceResults.length === 0 ? (
                    <div className="emptyState"><span>⌕</span><h4>No source results yet</h4><p>Search by title, author, DOI fragments, or citation text to find Crossref records.</p></div>
                  ) : (
                    <div className="sourceList">{sourceResults.map((source) => renderSourceCard(source, source.identity))}</div>
                  )}
                </section>
              </>
            )}

            {activeTool === "references" && (
              <>
                <section className="panel referenceWorkbench">
                  <div className="panelHead"><div><span className="step">01</span><div><small>BIBLIOGRAPHY</small><h3>Paste your reference list</h3></div></div><span className="chip">UP TO 25K CHARS</span></div>
                  <textarea className="referenceTextarea" value={referencesText} onChange={(event) => {
                    setReferencesText(event.target.value);
                    setParsedReferences(null);
                    setCitationAudit(null);
                    setReferenceVerification(null);
                  }} placeholder="Paste one reference per line or your formatted bibliography here…" />
                  <div className="referenceActions">
                    <button onClick={parseReferences} disabled={busy || !referencesText.trim()}>{busyAction === "reference-parse" ? "Parsing…" : "Parse references"}</button>
                    <button className="secondaryButton" onClick={auditReferences} disabled={busy || !referencesText.trim() || !document}>{busyAction === "reference-audit" ? "Auditing…" : document ? "Audit in-text citations" : "Upload draft to audit citations"}</button>
                    <button className="secondaryButton" onClick={verifyReferences} disabled={busy || !referencesText.trim()}>{busyAction === "reference-verify" ? "Verifying…" : "Verify 5 with Crossref"}</button>
                  </div>
                  <div className="actionHint"><span>Local parse/audit = no external call</span><span>Crossref verify = bounded external metadata lookup</span></div>
                </section>

                <section className="referenceSummaryGrid">
                  <article className="summaryCard"><span>Parsed references</span><strong>{parsedReferences?.count ?? "—"}</strong></article>
                  <article className="summaryCard"><span>Matched citations</span><strong>{citationAudit?.matched_citation_count ?? "—"}</strong></article>
                  <article className="summaryCard"><span>Unmatched citations</span><strong>{citationAudit?.unmatched_citations.length ?? "—"}</strong></article>
                  <article className="summaryCard"><span>Crossref checked</span><strong>{referenceVerification?.checked_count ?? "—"}</strong></article>
                </section>

                {citationAudit && (
                  <section className="panel auditPanel">
                    <div className="sectionTitle"><div><p className="eyebrow">CITATION CONSISTENCY</p><h3>Author-year review</h3></div><span className="evidenceTag">Local analysis</span></div>
                    <p className="scopeNote">{citationAudit.scope_note}</p>
                    <div className="auditColumns">
                      <div><h4>Unmatched in-text citations</h4>{citationAudit.unmatched_citations.length === 0 ? <p className="empty">No unmatched author-year citations detected.</p> : citationAudit.unmatched_citations.map((citation) => <div className="finding" key={`${citation.start}-${citation.raw}`}><span className="findingDot review" /><div><strong>{citation.raw}</strong><small>No matching parsed bibliography entry was detected.</small></div></div>)}</div>
                      <div><h4>Bibliography entries not cited</h4>{citationAudit.uncited_references.length === 0 ? <p className="empty">No uncited parsed references detected.</p> : citationAudit.uncited_references.map((item) => <div className="finding" key={`uncited-${item.index}`}><span className="findingDot neutral" /><div><strong>Reference {item.index}</strong><small>{item.raw}</small></div></div>)}</div>
                    </div>
                  </section>
                )}

                {referenceVerification && (
                  <section className="panel verificationPanel">
                    <div className="sectionTitle"><div><p className="eyebrow">CROSSREF VERIFICATION</p><h3>External bibliographic evidence</h3></div><span className="evidenceTag">{referenceVerification.cost_policy}</span></div>
                    <p className="scopeNote">{referenceVerification.scope_note}</p>
                    <div className="verificationList">
                      {referenceVerification.results.map((result) => (
                        <article className="verificationRow" key={`verify-${result.reference.index}`}>
                          <div className="verificationStatus"><span className={`statusDot ${result.status}`} /><strong>{statusLabel(result.status)}</strong><small>{result.match_method ? `via ${statusLabel(result.match_method)}` : "No external match method"}</small></div>
                          <div className="verificationBody">
                            <p>{result.reference.raw}</p>
                            {result.source && <div className="candidateLine"><span>Candidate</span><strong>{result.source.title}</strong>{result.source.doi && <small>{result.source.doi}</small>}</div>}
                            {result.issues.length > 0 && <div className="issueList">{result.issues.map((issue) => <span key={issue}>{issue}</span>)}</div>}
                          </div>
                          <div className={scoreClass(result.bibliographic_match_score)}>{result.bibliographic_match_score == null ? "—" : `${Math.round(result.bibliographic_match_score)}%`}</div>
                        </article>
                      ))}
                    </div>
                  </section>
                )}

                <section className="panel parsedPanel">
                  <div className="sectionTitle"><div><p className="eyebrow">PARSED REFERENCES</p><h3>Detected structure</h3></div><span className="resultCount">{parsedReferences?.count ?? 0} parsed</span></div>
                  {!parsedReferences ? (
                    <div className="emptyState"><span>≡</span><h4>No references parsed yet</h4><p>Paste your bibliography and run Parse references to inspect detected DOI, year, author hints, and warnings.</p></div>
                  ) : (
                    <>
                      <p className="scopeNote">{parsedReferences.scope_note}</p>
                      <div className="parsedList">{parsedReferences.references.map((item) => (
                        <div className="parsedRow" key={`ref-${item.index}`}>
                          <span className="refNumber">{String(item.index).padStart(2, "0")}</span>
                          <div><p>{item.raw}</p><div className="referenceMeta"><span>AUTHOR <b>{item.author_key ?? "—"}</b></span><span>YEAR <b>{item.year ?? "—"}</b></span><span>DOI <b>{item.doi ?? "—"}</b></span></div>{item.warnings.length > 0 && <div className="issueList">{item.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>}</div>
                        </div>
                      ))}</div>
                    </>
                  )}
                </section>
              </>
            )}

            {activeTool === "history" && supabaseConfigured && user && (
              <section className="panel historyPanel">
                <div className="panelHead">
                  <div><span className="step">01</span><div><small>YOUR ACCOUNT</small><h3>Scan history</h3></div></div>
                  <button className="dangerButton" disabled={busy || scans.length === 0} onClick={clearHistory}>{busyAction === "history-delete" ? "Deleting…" : "Delete history"}</button>
                </div>
                {scans.length === 0 ? (
                  <div className="emptyState"><span>↺</span><h4>No saved scan metadata</h4><p>Your completed similarity scans will appear here after you use a scan credit.</p></div>
                ) : (
                  <div className="historyList">
                    {scans.map((scan) => (
                      <div className="historyRow" key={scan.id}>
                        <div><strong>{scan.document_name}</strong><span>{new Date(scan.created_at).toLocaleString()}</span></div>
                        <div><span>Source</span><strong>{scan.source_name}</strong></div>
                        <div><span>Similarity</span><strong>{scan.similarity_percent ?? 0}%</strong></div>
                        <div><span>Credits</span><strong>-{scan.credits_used}</strong></div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="scopeNote">Averis stores scan metadata for your private history. The current beta scan flow does not upload the original file to Supabase Storage.</p>
              </section>
            )}
          </section>
        </section>
      )}

      <footer><strong>Averis</strong><span>Independent academic similarity, source, and citation review.</span><small>Evidence supports human review. Averis does not make automatic misconduct verdicts.</small></footer>
    </main>
  );
}
