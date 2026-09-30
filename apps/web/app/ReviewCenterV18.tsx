"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase, supabaseConfigured } from "../lib/supabase";

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

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function similarityTone(value: number | null) {
  if (value == null) return "neutral";
  if (value >= 50) return "high";
  if (value >= 20) return "review";
  return "low";
}

function planLabel(value: string | undefined) {
  if (value === "student") return "Student Plus";
  if (value === "pro") return "Student Pro";
  if (value === "free") return "Free";
  return value ? value.replace(/_/g, " ") : "Averis";
}

export default function ReviewCenterV18() {
  const pathname = usePathname();
  const [ready, setReady] = useState(!supabaseConfigured);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const qaEnabled = process.env.NEXT_PUBLIC_CINEMATIC_QA === "true";
  const onRoot = pathname === "/" || pathname.endsWith("/averis-ai") || pathname.endsWith("/averis-ai/");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qaReviewCenter = qaEnabled && params.get("review-center") === "1" && onRoot;
    if (qaReviewCenter) {
      setUser({ id: "qa-local", email: "local@averis.dev" } as User);
      setProfile({ display_name: "Local developer", plan: "local", credits_remaining: 5, monthly_credit_allowance: 5 });
      setScans([]);
      setReady(true);
      setVisible(true);
      return;
    }

    if (!supabaseConfigured || !supabase) {
      setReady(true);
      setVisible(false);
      return;
    }

    let active = true;

    async function loadFor(nextUser: User | null) {
      if (!active) return;
      setUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        setScans([]);
        setVisible(false);
        setReady(true);
        return;
      }

      setLoading(true);
      const [{ data: profileData }, { data: scanData }] = await Promise.all([
        supabase!
          .from("profiles")
          .select("display_name, plan, credits_remaining, monthly_credit_allowance")
          .eq("user_id", nextUser.id)
          .single(),
        supabase!
          .from("scans")
          .select("id, document_name, source_name, similarity_percent, credits_used, created_at")
          .eq("user_id", nextUser.id)
          .order("created_at", { ascending: false })
          .limit(6),
      ]);

      if (!active) return;
      setProfile((profileData as Profile | null) ?? null);
      setScans((scanData as Scan[] | null) ?? []);
      setLoading(false);
      setReady(true);
      setVisible(onRoot);
    }

    void supabase.auth.getSession().then(({ data }) => loadFor(data.session?.user ?? null));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadFor(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [onRoot, qaEnabled]);

  useEffect(() => {
    if (!onRoot) setVisible(false);
  }, [onRoot]);

  useEffect(() => {
    function reopenReviewCenter() {
      if (!onRoot || !user) return;
      setVisible(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    window.addEventListener("averis:review-center", reopenReviewCenter);
    return () => window.removeEventListener("averis:review-center", reopenReviewCenter);
  }, [onRoot, user]);

  useEffect(() => {
    const html = document.documentElement;
    const shouldOpen = onRoot && ready && visible && Boolean(user);
    if (shouldOpen) html.dataset.averisReviewCenter = "true";
    else delete html.dataset.averisReviewCenter;
    return () => {
      delete html.dataset.averisReviewCenter;
    };
  }, [onRoot, ready, user, visible]);

  const recent = scans[0] ?? null;
  const recentRecords = scans.length;
  const credits = profile?.credits_remaining ?? null;
  const allowance = profile?.monthly_credit_allowance ?? null;
  const averageSimilarity = useMemo(() => {
    const values = scans
      .map((scan) => scan.similarity_percent)
      .filter((value): value is number => typeof value === "number");
    if (!values.length) return null;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }, [scans]);

  function openIntegrityWorkspace() {
    setVisible(false);
    delete document.documentElement.dataset.averisReviewCenter;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!onRoot || !ready || !visible || !user) return null;

  const name = profile?.display_name?.trim() || user.email?.split("@")[0] || "Reviewer";
  const currentPlan = planLabel(profile?.plan);
  const paidPlan = profile?.plan === "student" || profile?.plan === "pro";

  return (
    <section className="reviewCenterV18" aria-label="Averis Review Center">
      <header className="reviewCommandBar">
        <div className="reviewBrand" role="img" aria-label="Averis"><span /></div>
        <div className="reviewCommandMeta">
          <span>REVIEW CENTER</span>
          <strong>Academic integrity workspace</strong>
        </div>
        <div className="reviewCommandActions">
          <span className="reviewStatus"><i /> Evidence-first</span>
          <button type="button" onClick={openIntegrityWorkspace}>Open Integrity Scan</button>
        </div>
      </header>

      <div className="reviewCenterShell">
        <section className="reviewHero">
          <div>
            <p className="reviewEyebrow">WORKSPACE OVERVIEW</p>
            <h1>Good to see you, {name}.</h1>
            <p>Continue from real review history, start a new evidence scan, or move directly into source, citation, and writing-quality tools.</p>
          </div>
          <div className="reviewHeroActions">
            <button className="reviewPrimary" type="button" onClick={openIntegrityWorkspace}>New integrity review <span>→</span></button>
            <Link className="reviewSecondary" href="/private-ai/">Open Private AI</Link>
          </div>
        </section>

        <section className="reviewMetrics" aria-label="Account review summary">
          <article>
            <span>SCAN CREDITS</span>
            <strong>{credits ?? "—"}</strong>
            <small>{allowance != null ? `of ${allowance} current allowance` : "Account allowance"}</small>
          </article>
          <article>
            <span>RECENT RECORDS</span>
            <strong>{recentRecords}</strong>
            <small>Loaded from your latest scan metadata</small>
          </article>
          <article>
            <span>RECENT AVG. SIMILARITY</span>
            <strong>{averageSimilarity == null ? "—" : `${averageSimilarity}%`}</strong>
            <small>Context signal, never a misconduct verdict</small>
          </article>
          <article>
            <span>WORKSPACE MODE</span>
            <strong>{profile?.plan?.toUpperCase() ?? "BETA"}</strong>
            <small>Evidence-first review boundary</small>
          </article>
        </section>

        <section className="reviewValuePanel" aria-label="Current plan value">
          <div className="reviewValueLead">
            <span className="reviewPlanChip">{currentPlan}</span>
            <p className="reviewEyebrow">YOUR PLAN VALUE</p>
            <h2>One workspace for the full review loop.</h2>
            <p>
              Averis keeps integrity review, source evidence, citation checks, revision tools and private AI in one academic workflow instead of splitting them across disconnected add-ons.
            </p>
            <Link href="/pricing/">View plan details <span>→</span></Link>
          </div>
          <div className="reviewValueGrid">
            <article>
              <span>MONTHLY CAPACITY</span>
              <strong>{allowance == null ? "—" : `${allowance} scans`}</strong>
              <small>Server review capacity shown from your real account profile.</small>
            </article>
            <article>
              <span>INTEGRATED WORKFLOWS</span>
              <strong>6 review tools</strong>
              <small>Integrity, sources, evidence AI, refine, studio and private AI.</small>
            </article>
            <article>
              <span>PRIVATE AI OPTIONS</span>
              <strong>Browser + local</strong>
              <small>Keep supported writing workflows on-device or on your own local runtime.</small>
            </article>
            <article>
              <span>{paidPlan ? "PAID TOOLSET" : "CORE TOOLSET"}</span>
              <strong>{paidPlan ? "Source + citation" : "Evidence-first"}</strong>
              <small>{paidPlan ? "Your paid plan includes the Source & Citation AI workbench." : "Core review and local/private workflows remain available without a paid plan."}</small>
            </article>
          </div>
        </section>

        <section className="reviewGrid">
          <article className="reviewPanel reviewContinue">
            <div className="reviewPanelHead">
              <div><p className="reviewEyebrow">CONTINUE REVIEWING</p><h2>{recent ? recent.document_name : "Start your first review"}</h2></div>
              <span>{loading ? "SYNCING" : recent ? "RECENT" : "READY"}</span>
            </div>
            {recent ? (
              <>
                <div className="reviewRecentMeta">
                  <span><b>Source</b>{recent.source_name || "Source metadata unavailable"}</span>
                  <span><b>Similarity</b><em data-tone={similarityTone(recent.similarity_percent)}>{recent.similarity_percent == null ? "—" : `${Math.round(recent.similarity_percent)}%`}</em></span>
                  <span><b>Reviewed</b>{formatWhen(recent.created_at)}</span>
                </div>
                <p className="reviewBoundaryNote">This history card preserves scan metadata only. It does not reconstruct the original submission file.</p>
                <div className="reviewInlineActions">
                  <button type="button" onClick={openIntegrityWorkspace}>Start a fresh scan</button>
                  <button type="button" className="quiet" onClick={openIntegrityWorkspace}>Open workspace</button>
                </div>
              </>
            ) : (
              <div className="reviewEmptyState">
                <span>01</span>
                <div><strong>No scan history yet</strong><p>Upload a draft, compare it against source evidence, and Averis will keep only the scan metadata allowed by the current beta flow.</p></div>
                <button type="button" onClick={openIntegrityWorkspace}>Begin review</button>
              </div>
            )}
          </article>

          <article className="reviewPanel reviewIntegrityPulse">
            <div className="reviewPanelHead">
              <div><p className="reviewEyebrow">INTEGRITY BOUNDARY</p><h2>Evidence before conclusions.</h2></div>
              <span>ACTIVE</span>
            </div>
            <div className="reviewPulseGraph" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
            <div className="reviewBoundaryList">
              <span><i /> Similarity is presented as review evidence.</span>
              <span><i /> Citation and source checks remain independently inspectable.</span>
              <span><i /> AI-assisted revision does not issue misconduct verdicts.</span>
            </div>
          </article>
        </section>

        <section className="reviewToolSection">
          <div className="reviewSectionTitle">
            <div><p className="reviewEyebrow">QUICK LAUNCH</p><h2>Move directly to the evidence you need.</h2></div>
            <p>Each module keeps its own review boundary instead of collapsing everything into one opaque score.</p>
          </div>
          <div className="reviewToolGrid">
            <button type="button" onClick={openIntegrityWorkspace}>
              <span className="reviewToolNumber">01</span><b>Integrity Scan</b><small>Exact/fuzzy passage evidence, exclusions, and source comparison.</small><em>Open workspace →</em>
            </button>
            <Link href="/multi-source/">
              <span className="reviewToolNumber">02</span><b>Source Intelligence</b><small>Compare multiple sources and inspect source-level contribution.</small><em>Open sources →</em>
            </Link>
            <Link href="/revision/">
              <span className="reviewToolNumber">03</span><b>Evidence AI</b><small>Quotation, citation, bibliography, DOI, and human-review evidence.</small><em>Open evidence AI →</em>
            </Link>
            <Link href="/refine/">
              <span className="reviewToolNumber">04</span><b>Writing Refinement</b><small>Preflight first, then bounded local-Ollama revision proposals.</small><em>Open refinement →</em>
            </Link>
            <Link href="/studio/">
              <span className="reviewToolNumber">05</span><b>Revision Studio</b><small>Accept or keep proposed sentence changes, protect citations and numbers, then re-check evidence.</small><em>Open studio →</em>
            </Link>
            <Link href="/private-ai/">
              <span className="reviewToolNumber">06</span><b>Private AI</b><small>Run a small open writing model on-device with WebGPU and no paid inference API.</small><em>Open private AI →</em>
            </Link>
          </div>
        </section>

        <section className="reviewHistoryPanel">
          <div className="reviewSectionTitle compact">
            <div><p className="reviewEyebrow">RECENT REVIEW ACTIVITY</p><h2>Your latest scan metadata.</h2></div>
            <button type="button" onClick={openIntegrityWorkspace}>Open workspace</button>
          </div>
          <div className="reviewHistoryTable" role="table" aria-label="Recent Averis scans">
            <div className="reviewHistoryRow reviewHistoryHeader" role="row">
              <span role="columnheader">Document</span><span role="columnheader">Source</span><span role="columnheader">Similarity</span><span role="columnheader">Reviewed</span>
            </div>
            {scans.length ? scans.slice(0, 5).map((scan) => (
              <div className="reviewHistoryRow" role="row" key={scan.id}>
                <span role="cell"><b>{scan.document_name}</b><small>{scan.credits_used} credit{scan.credits_used === 1 ? "" : "s"} used</small></span>
                <span role="cell">{scan.source_name || "—"}</span>
                <span role="cell"><em data-tone={similarityTone(scan.similarity_percent)}>{scan.similarity_percent == null ? "—" : `${Math.round(scan.similarity_percent)}%`}</em></span>
                <span role="cell">{formatWhen(scan.created_at)}</span>
              </div>
            )) : (
              <div className="reviewHistoryEmpty">No scan metadata to show yet.</div>
            )}
          </div>
        </section>

        <footer className="reviewCenterFooter">
          <span className="reviewFooterBrand" aria-hidden="true" />
          <p>Averis supports human review. Similarity, citation, source, and AI evidence are not automatic misconduct verdicts.</p>
          <Link href="/privacy/">Privacy controls</Link>
        </footer>
      </div>
    </section>
  );
}
