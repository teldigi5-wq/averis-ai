import fs from "node:fs/promises";
import path from "node:path";

import axe from "axe-core";
import { chromium } from "playwright";

const baseUrl = (process.env.AVERIS_BASE_URL || "http://127.0.0.1:4173/averis-ai").replace(/\/$/, "");
const artifactDir = path.resolve(process.cwd(), "../../artifacts/web-quality");
const profiles = [
  { name: "desktop", viewport: { width: 1440, height: 1000 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
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

  const measurements = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    cards: document.querySelectorAll('section[aria-label="Student subscription plans"] article').length,
    brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).length,
    disabledPaidButtons: [...document.querySelectorAll("button")].filter((button) => button.textContent?.includes("Subscriptions activating soon") && button.disabled).length,
  }));

  const lkrText = await page.locator("main").innerText();
  const hasLkr = lkrText.includes("Rs. 1,490") && lkrText.includes("Rs. 2,690");
  await page.getByRole("button", { name: "USD" }).click();
  const usdText = await page.locator("main").innerText();
  const hasUsd = usdText.includes("$4.99") && usdText.includes("$8.99");

  const overflow = measurements.scrollWidth > measurements.clientWidth + 1;
  const ok = !overflow && measurements.cards === 3 && measurements.brokenImages === 0 && serious.length === 0 && hasLkr && hasUsd && measurements.disabledPaidButtons === 2;
  if (!ok) failed = true;

  await page.screenshot({ path: path.join(artifactDir, `pricing-v40-${profile.name}.png`), fullPage: true });
  results.push({
    profile: profile.name,
    ok,
    overflow,
    cards: measurements.cards,
    broken_images: measurements.brokenImages,
    serious_or_critical_a11y: serious.map((item) => item.id),
    lkr_toggle_ok: hasLkr,
    usd_toggle_ok: hasUsd,
    paid_checkout_fail_closed: measurements.disabledPaidButtons === 2,
  });
  await page.close();
}

await browser.close();
await fs.writeFile(path.join(artifactDir, "pricing-v40-report.json"), `${JSON.stringify({ results }, null, 2)}\n`);
if (failed) {
  console.error(JSON.stringify(results, null, 2));
  process.exit(1);
}
console.log("Pricing v40 desktop/mobile quality smoke passed.");
