"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";

import { supabase, supabaseConfigured } from "../../lib/supabase";
import styles from "./pricing.module.css";
import premiumStyles from "./pricing-premium-v48.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Currency = "USD" | "LKR";
type Cadence = "monthly" | "yearly";
type PlanId = "free" | "student" | "pro";
type SessionState = "checking" | "signed-out" | "signed-in";

type BillingStatus = {
  billing_enabled: boolean;
  plan: PlanId;
  subscription_status: string;
  cadence: Cadence | null;
  renews_at: string | null;
  ends_at: string | null;
  can_use_cloud_ai: boolean;
  monthly_credit_allowance: number;
};

const plans = [
  {
    id: "free" as const,
    name: "Free",
    kicker: "Core review tools for everyday coursework",
    monthly: { USD: 0, LKR: 0 },
    yearly: { USD: 0, LKR: 0 },
    credits: 5,
    value: "No payment required",
    features: [
      "5 server scans each month",
      "Private Browser AI and Local Ollama support",
      "Assignment planning and progress tools",
      "Reference, document and rubric checks",
      "Local Assignment Workspace",
    ],
  },
  {
    id: "student" as const,
    name: "Student Plus",
    kicker: "More scans and optional Cloud AI for regular assignment work",
    monthly: { USD: 4.99, LKR: 1490 },
    yearly: { USD: 49, LKR: 14900 },
    credits: 50,
    value: "10× Free scan capacity",
    featured: true,
    features: [
      "50 server scans each billing month",
      "Optional Cloud AI revision when the provider quota is available",
      "Everything in Free",
      "Source & Citation AI Workbench",
      "Secure subscription portal",
    ],
  },
  {
    id: "pro" as const,
    name: "Student Pro",
    kicker: "Higher limits for projects, dissertations and busy semesters",
    monthly: { USD: 8.99, LKR: 2690 },
    yearly: { USD: 89, LKR: 26900 },
    credits: 200,
    value: "40× Free scan capacity",
    features: [
      "200 server scans each billing month",
      "Optional Cloud AI revision when the provider quota is available",
      "Everything in Student Plus",
      "Built for high-volume project and thesis review",
      "Secure subscription portal",
    ],
  },
];

const comparisonRows = [
  ["Server scan credits / month", "5", "50", "200"],
  ["Private Browser AI + Local Ollama", "Included", "Included", "Included"],
  ["Assignment planning + progress", "Included", "Included", "Included"],
  ["Reference, document + rubric checks", "Included", "Included", "Included"],
  ["Local Assignment Workspace", "Included", "Included", "Included"],
  ["Source & Citation AI Workbench", "—", "Included", "Included"],
  ["Optional Cloud AI revision", "—", "Included*", "Included*"],
  ["Secure subscription portal", "—", "Included", "Included"],
] as const;

function money(currency: Currency, value: number) {
  if (currency === "LKR") return value === 0 ? "Rs. 0" : `Rs. ${value.toLocaleString("en-LK")}`;
  return value === 0 ? "$0" : `$${value.toFixed(value % 1 ? 2 : 0)}`;
}

export default function PricingPage() {
  const [currency, setCurrency] = useState<Currency>("LKR");
  const [cadence, setCadence] = useState<Cadence>("monthly");
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [statusChecked, setStatusChecked] = useState(false);
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [message, setMessage] = useState("");

  const billingNote = useMemo(
    () => cadence === "yearly"
      ? "Yearly plans cost less than paying monthly for 12 months."
      : "Paid plans can be managed or cancelled from the billing portal.",
    [cadence],
  );

  const billingReady = sessionState === "signed-in" && statusChecked && status?.billing_enabled === true;
  const signedOut = sessionState === "signed-out" && statusChecked;
  const billingUnavailable = sessionState === "signed-in" && statusChecked && !billingReady;

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setSessionState("signed-out");
      setStatusChecked(true);
      return;
    }

    let active = true;

    async function syncBilling(session: Session | null) {
      if (!active) return;
      const token = session?.access_token;

      if (!token) {
        setSessionState("signed-out");
        setStatus(null);
        setStatusChecked(true);
        return;
      }

      setSessionState("signed-in");
      setStatusChecked(false);

      try {
        const response = await fetch(`${API_URL}/api/v1/billing/status`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!active) return;
        if (!response.ok) {
          setStatus(null);
          return;
        }
        setStatus(await response.json());
        setMessage("");
      } catch {
        if (active) setStatus(null);
      } finally {
        if (active) setStatusChecked(true);
      }
    }

    void supabase.auth.getSession().then(({ data }) => syncBilling(data.session));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncBilling(session);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function sessionToken() {
    if (!supabaseConfigured || !supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  function requestSignIn() {
    setMessage("Sign in to securely link the subscription to your Averis account.");
    window.dispatchEvent(new Event("averis:auth-open"));
  }

  async function checkout(plan: "student" | "pro") {
    setMessage("");
    const token = await sessionToken();

    if (!token) {
      requestSignIn();
      return;
    }

    if (!billingReady) {
      setMessage("Averis could not verify billing readiness. Checkout stays disabled until the server confirms it is available.");
      return;
    }

    setLoadingPlan(plan);
    try {
      const response = await fetch(`${API_URL}/api/v1/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan, cadence }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.detail || "Checkout is unavailable right now.");
      if (typeof body.checkout_url !== "string" || !body.checkout_url.startsWith("https://")) {
        throw new Error("The payment provider returned an invalid checkout link.");
      }
      window.location.assign(body.checkout_url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout is unavailable right now.");
    } finally {
      setLoadingPlan(null);
    }
  }

  async function openPortal() {
    const token = await sessionToken();
    if (!token) {
      requestSignIn();
      return;
    }

    setLoadingPlan(status?.plan ?? "free");
    try {
      const response = await fetch(`${API_URL}/api/v1/billing/portal`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.detail || "Billing portal is unavailable.");
      if (typeof body.portal_url !== "string" || !body.portal_url.startsWith("https://")) {
        throw new Error("The payment provider returned an invalid billing portal link.");
      }
      window.location.assign(body.portal_url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Billing portal is unavailable.");
    } finally {
      setLoadingPlan(null);
    }
  }

  function paidCtaLabel(plan: (typeof plans)[number]) {
    if (loadingPlan === plan.id) return "Opening secure checkout…";
    if (!statusChecked || sessionState === "checking") return "Checking subscription…";
    if (signedOut) return `Sign in to choose ${plan.name}`;
    if (billingReady) return `Choose ${plan.name}`;
    return "Subscriptions unavailable";
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <span className={styles.eyebrow}>AVERIS STUDENT PLANS</span>
        <h1>Simple plans for your study workload.</h1>
        <p>
          Start free and upgrade only when you need more server scans or optional Cloud AI revision.
          Card details stay with the payment provider, never inside Averis.
        </p>
        <div className={styles.toggles}>
          <div className={styles.segment} aria-label="Billing currency display">
            {(["LKR", "USD"] as Currency[]).map((item) => (
              <button key={item} type="button" className={currency === item ? styles.selected : ""} onClick={() => setCurrency(item)}>{item}</button>
            ))}
          </div>
          <div className={styles.segment} aria-label="Billing cadence">
            {(["monthly", "yearly"] as Cadence[]).map((item) => (
              <button key={item} type="button" className={cadence === item ? styles.selected : ""} onClick={() => setCadence(item)}>{item === "monthly" ? "Monthly" : "Yearly"}</button>
            ))}
          </div>
        </div>
        <p className={styles.microcopy}>{billingNote} LKR is a display reference; secure checkout shows the authoritative charged amount before payment.</p>
      </section>

      {status && (
        <section className={styles.accountBar} aria-label="Current subscription">
          <div><span>Current plan</span><strong>{status.plan === "student" ? "Student Plus" : status.plan === "pro" ? "Student Pro" : "Free"}</strong></div>
          <div><span>Status</span><strong>{status.subscription_status.replace(/_/g, " ")}</strong></div>
          <div><span>Monthly scans</span><strong>{status.monthly_credit_allowance}</strong></div>
          {status.plan !== "free" && <button type="button" onClick={openPortal}>Manage subscription</button>}
        </section>
      )}

      {signedOut && (
        <section className={styles.sessionHint} aria-label="Sign in for subscriptions">
          <div><strong>Ready to upgrade?</strong><span>Sign in first so checkout can securely link the plan to your account.</span></div>
          <button type="button" onClick={requestSignIn}>Sign in</button>
        </section>
      )}

      {billingUnavailable && (
        <div className={styles.notice} role="status">
          Billing could not be verified for this signed-in session. Paid checkout remains disabled until the API confirms readiness.
        </div>
      )}

      {message && <div className={styles.notice} role="status" aria-live="polite">{message}</div>}

      <section className={premiumStyles.valueBand} aria-label="What Averis plans include">
        <div className={premiumStyles.valueIntro}>
          <span>MORE INCLUDED, FEWER ADD-ONS</span>
          <h2>One academic review workspace.</h2>
          <p>Choose capacity for your workload. The core Averis workflow stays connected instead of charging separately for every review tool.</p>
        </div>
        <div className={premiumStyles.valueGrid}>
          <article><strong>Integrity workspace</strong><span>Similarity evidence, exclusions and reviewable passage context.</span></article>
          <article><strong>Private + local AI</strong><span>Browser AI and local Ollama workflows remain part of the product.</span></article>
          <article><strong>Source & citation tools</strong><span>Paid plans include the Source & Citation AI workbench.</span></article>
          <article><strong>Optional Cloud AI</strong><span>Paid plans can use bounded Cloud AI revision when provider quota is available.</span></article>
        </div>
      </section>

      <section className={styles.grid} aria-label="Student subscription plans">
        {plans.map((plan) => {
          const amount = plan[cadence][currency];
          const current = status?.plan === plan.id;
          const disabled = plan.id !== "free" && (loadingPlan !== null || !statusChecked || (sessionState === "signed-in" && !billingReady));
          return (
            <article key={plan.id} className={`${styles.card} ${plan.featured ? styles.featured : ""}`}>
              {plan.featured && <span className={styles.badge}>Best for most students</span>}
              <header>
                <span className={styles.planName}>{plan.name}</span>
                <p>{plan.kicker}</p>
              </header>
              <div className={styles.price}>
                <strong>{money(currency, amount)}</strong>
                {amount > 0 && <span>/{cadence === "monthly" ? "month" : "year"}</span>}
              </div>
              <div className={premiumStyles.capacityBadge}>{plan.value}</div>
              <div className={styles.creditLine}>{plan.credits} server scan credits / month</div>
              <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
              {plan.id === "free" ? (
                <a className={styles.secondaryAction} href="../dashboard/">Continue free</a>
              ) : current ? (
                <button className={styles.primaryAction} type="button" onClick={openPortal}>Manage current plan</button>
              ) : (
                <button className={styles.primaryAction} type="button" disabled={disabled} onClick={() => checkout(plan.id)}>
                  {paidCtaLabel(plan)}
                </button>
              )}
            </article>
          );
        })}
      </section>

      <section className={premiumStyles.comparison} aria-label="Plan feature comparison">
        <div className={premiumStyles.comparisonHead}>
          <div>
            <span>VALUE, LINE BY LINE</span>
            <h2>Compare what you actually get.</h2>
          </div>
          <p>Free keeps the local/private study workflow useful. Paid plans add much more server capacity plus the paid workbench and optional Cloud AI path.</p>
        </div>
        <div className={premiumStyles.comparisonScroller}>
          <table>
            <thead>
              <tr>
                <th scope="col">Capability</th>
                <th scope="col">Free</th>
                <th scope="col">Student Plus</th>
                <th scope="col">Student Pro</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map(([label, free, student, pro]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{free}</td>
                  <td data-highlight="true">{student}</td>
                  <td>{pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={premiumStyles.comparisonNote}>* Optional Cloud AI is available only when the configured provider quota is available. Averis never silently falls back to it.</p>
      </section>

      <section className={styles.securityStrip} aria-label="Subscription protections">
        <div><strong>Secure checkout</strong><span>Card details stay with the payment provider, not Averis.</span></div>
        <div><strong>Verified billing</strong><span>Plan changes are accepted only after signed server verification.</span></div>
        <div><strong>Protected access</strong><span>Editing browser state cannot unlock paid features.</span></div>
        <div><strong>Bounded AI usage</strong><span>Cloud AI stops when the configured provider quota is unavailable.</span></div>
      </section>
    </main>
  );
}
