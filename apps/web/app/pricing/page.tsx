"use client";

import { useEffect, useMemo, useState } from "react";

import { supabase, supabaseConfigured } from "../../lib/supabase";
import styles from "./pricing-v40.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Currency = "USD" | "LKR";
type Cadence = "monthly" | "yearly";
type PlanId = "free" | "student" | "pro";

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
    features: [
      "200 server scans each billing month",
      "Optional Cloud AI revision when the provider quota is available",
      "Everything in Student Plus",
      "Built for high-volume project and thesis review",
      "Secure subscription portal",
    ],
  },
];

function money(currency: Currency, value: number) {
  if (currency === "LKR") return value === 0 ? "Rs. 0" : `Rs. ${value.toLocaleString("en-LK")}`;
  return value === 0 ? "$0" : `$${value.toFixed(value % 1 ? 2 : 0)}`;
}

export default function PricingPage() {
  const [currency, setCurrency] = useState<Currency>("LKR");
  const [cadence, setCadence] = useState<Cadence>("monthly");
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [statusChecked, setStatusChecked] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [message, setMessage] = useState("");

  const billingNote = useMemo(
    () => cadence === "yearly"
      ? "Yearly plans cost less than paying monthly for 12 months."
      : "Paid plans can be managed or cancelled from the billing portal.",
    [cadence],
  );
  const billingReady = statusChecked && status?.billing_enabled === true;

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setStatusChecked(true);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token || !active) {
        if (active) setStatusChecked(true);
        return;
      }
      try {
        const response = await fetch(`${API_URL}/api/v1/billing/status`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (response.ok && active) setStatus(await response.json());
      } catch {
        // Fail closed: checkout stays disabled until the API explicitly confirms readiness.
      } finally {
        if (active) setStatusChecked(true);
      }
    });
    return () => { active = false; };
  }, []);

  async function sessionToken() {
    if (!supabaseConfigured || !supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function checkout(plan: "student" | "pro") {
    setMessage("");
    if (!billingReady) {
      setMessage("Subscriptions are not accepting payments yet. The free student toolkit remains available.");
      return;
    }
    const token = await sessionToken();
    if (!token) {
      setMessage("Sign in first so the subscription can be securely linked to your Averis account.");
      window.dispatchEvent(new Event("averis:auth-open"));
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
    if (!token) return setMessage("Sign in to manage your subscription.");
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

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <span className={styles.eyebrow}>AVERIS STUDENT PLANS</span>
        <h1>Simple plans for your study workload.</h1>
        <p>
          Use Averis free for core review work. Upgrade only when you need more server scans or optional Cloud AI revision.
          Payments open in the provider&apos;s secure checkout, so Averis never sees or stores your card number or CVV.
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
        <p className={styles.microcopy}>{billingNote} LKR is a localized display reference; secure checkout shows the authoritative charged amount before payment.</p>
      </section>

      {status && (
        <section className={styles.accountBar} aria-label="Current subscription">
          <div><span>Current plan</span><strong>{status.plan === "student" ? "Student Plus" : status.plan === "pro" ? "Student Pro" : "Free"}</strong></div>
          <div><span>Status</span><strong>{status.subscription_status.replace(/_/g, " ")}</strong></div>
          <div><span>Monthly scans</span><strong>{status.monthly_credit_allowance}</strong></div>
          {status.plan !== "free" && <button type="button" onClick={openPortal}>Manage subscription</button>}
        </section>
      )}

      {message && <div className={styles.notice} role="status">{message}</div>}

      <section className={styles.grid} aria-label="Student subscription plans">
        {plans.map((plan) => {
          const amount = plan[cadence][currency];
          const current = status?.plan === plan.id;
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
              <div className={styles.creditLine}>{plan.credits} server scan credits / month</div>
              <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
              {plan.id === "free" ? (
                <a className={styles.secondaryAction} href="../dashboard/">Continue free</a>
              ) : current ? (
                <button className={styles.primaryAction} type="button" onClick={openPortal}>Manage current plan</button>
              ) : (
                <button className={styles.primaryAction} type="button" disabled={loadingPlan !== null || !billingReady} onClick={() => checkout(plan.id)}>
                  {loadingPlan === plan.id ? "Opening secure checkout…" : billingReady ? `Choose ${plan.name}` : "Subscriptions activating soon"}
                </button>
              )}
            </article>
          );
        })}
      </section>

      <section className={styles.securityStrip} aria-label="Subscription protections">
        <div><strong>Secure checkout</strong><span>Card details stay with the payment provider, not Averis.</span></div>
        <div><strong>Verified billing</strong><span>Plan changes are accepted only after signed server verification.</span></div>
        <div><strong>Protected plan access</strong><span>Editing browser state cannot unlock paid features.</span></div>
        <div><strong>No surprise AI charges</strong><span>Cloud AI stops when the configured free quota is unavailable.</span></div>
      </section>
    </main>
  );
}
