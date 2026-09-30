import fs from "node:fs/promises";
import path from "node:path";

import axe from "axe-core";
import { chromium } from "playwright";

const baseUrl = (process.env.AVERIS_BASE_URL || "http://127.0.0.1:4173/averis-ai").replace(/\/$/, "");
const artifactDir = path.resolve(process.cwd(), "../../artifacts/web-quality");
const profiles = [
  { name: "desktop", viewport: { width: 1440, height: 1000 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
  { name: "small-mobile", viewport: { width: 360, height: 800 } },
];

await fs.mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
let failed = false;

for (const profile of profiles) {
  const page = await browser.newPage({ viewport: profile.viewport });
  const response = await page.goto(`${baseUrl}/pricing/`, { waitUntil: "networkidle" });
  if (!response || response.status() !== 200) throw new Error(`Pricing ${profile.name} did not return HTTP 200`);

  await page.addScriptTag({ content: axe.source });
  const axeResult = await page.evaluate(async () => window.axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
  }));
  const serious = axeResult.violations.filter((item) => ["serious", "critical"].includes(item.impact));

  const measurements = await page.evaluate(() => {
    const isVisible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    };

    const segmentButtons = [...document.querySelectorAll('[aria-label="Billing currency display"] button, [aria-label="Billing cadence"] button')];
    const cardActions = [...document.querySelectorAll('section[aria-label="Student subscription plans"] article > button, section[aria-label="Student subscription plans"] article > a')];
    const microcopy = document.querySelector('main p[class*="microcopy"]');
    const signInHint = document.querySelector('section[aria-label="Sign in for subscriptions"]');
    const signInHintButton = signInHint?.querySelector("button") ?? null;
    const signInHintCopy = signInHint?.querySelector("div") ?? null;
    const paidButtons = [...document.querySelectorAll('section[aria-label="Student subscription plans"] article > button')];
    const signedOutPaidButtons = paidButtons.filter((button) => button.textContent?.includes("Sign in to choose") && !button.disabled);
    const legacyActivatingButtons = paidButtons.filter((button) => button.textContent?.includes("Subscriptions activating soon"));

    const hintRect = signInHint?.getBoundingClientRect() ?? null;
    const hintButtonRect = signInHintButton?.getBoundingClientRect() ?? null;
    const hintCopyRect = signInHintCopy?.getBoundingClientRect() ?? null;

    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      cards: document.querySelectorAll('section[aria-label="Student subscription plans"] article').length,
      securityItems: document.querySelectorAll('section[aria-label="Subscription protections"] > div').length,
      brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).length,
      signedOutPaidButtons: signedOutPaidButtons.length,
      legacyActivatingButtons: legacyActivatingButtons.length,
      signInHintVisible: Boolean(signInHint && isVisible(signInHint)),
      signInHintWidth: hintRect?.width ?? 0,
      signInHintButtonWidth: hintButtonRect?.width ?? 0,
      signInHintCopyWidth: hintCopyRect?.width ?? 0,
      controlsVisible: [...segmentButtons, ...cardActions].every(isVisible),
      touchTargetsOk: [...segmentButtons, ...cardActions].every((element) => element.getBoundingClientRect().height >= 40),
      microcopyFontSize: microcopy ? Number.parseFloat(getComputedStyle(microcopy).fontSize) : 0,
    };
  });

  const lkrText = await page.locator("main").innerText();
  const hasLkr = lkrText.includes("Rs. 1,490") && lkrText.includes("Rs. 2,690");
  await page.getByRole("button", { name: "USD" }).click();
  const usdText = await page.locator("main").innerText();
  const hasUsd = usdText.includes("$4.99") && usdText.includes("$8.99");

  const overflow = measurements.scrollWidth > measurements.clientWidth + 1;
  const signInHintLayoutOk = profile.name === "desktop"
    ? measurements.signInHintButtonWidth <= 240 && measurements.signInHintCopyWidth >= 300
    : measurements.signInHintButtonWidth >= measurements.signInHintWidth - 48;

  const ok = !overflow
    && measurements.cards === 3
    && measurements.securityItems === 4
    && measurements.brokenImages === 0
    && serious.length === 0
    && hasLkr
    && hasUsd
    && measurements.signedOutPaidButtons === 2
    && measurements.legacyActivatingButtons === 0
    && measurements.signInHintVisible
    && signInHintLayoutOk
    && measurements.controlsVisible
    && measurements.touchTargetsOk
    && measurements.microcopyFontSize >= 13;

  if (!ok) failed = true;

  await page.screenshot({ path: path.join(artifactDir, `pricing-v44-${profile.name}.png`), fullPage: true });
  results.push({
    profile: profile.name,
    ok,
    overflow,
    cards: measurements.cards,
    security_items: measurements.securityItems,
    broken_images: measurements.brokenImages,
    serious_or_critical_a11y: serious.map((item) => item.id),
    lkr_toggle_ok: hasLkr,
    usd_toggle_ok: hasUsd,
    signed_out_checkout_actions: measurements.signedOutPaidButtons,
    legacy_activating_actions: measurements.legacyActivatingButtons,
    sign_in_hint_visible: measurements.signInHintVisible,
    sign_in_hint_layout_ok: signInHintLayoutOk,
    sign_in_hint_width: Math.round(measurements.signInHintWidth),
    sign_in_hint_button_width: Math.round(measurements.signInHintButtonWidth),
    sign_in_hint_copy_width: Math.round(measurements.signInHintCopyWidth),
    controls_visible: measurements.controlsVisible,
    touch_targets_ok: measurements.touchTargetsOk,
    microcopy_font_px: measurements.microcopyFontSize,
  });
  await page.close();
}

await browser.close();
await fs.writeFile(path.join(artifactDir, "pricing-v44-report.json"), `${JSON.stringify({ results }, null, 2)}\n`);
if (failed) {
  console.error(JSON.stringify(results, null, 2));
  process.exit(1);
}
console.log("Pricing v44 desktop/mobile auth-ready quality smoke passed.");
