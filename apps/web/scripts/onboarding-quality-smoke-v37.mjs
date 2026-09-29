import fs from "node:fs/promises";
import path from "node:path";

import axe from "axe-core";
import { chromium } from "playwright";

const baseUrl = (process.env.AVERIS_BASE_URL || "http://127.0.0.1:4173/averis-ai").replace(/\/$/, "");
const artifactDir = path.resolve(process.cwd(), "../../artifacts/web-quality");
const onboardingKey = "averis:onboarding:v37";

const profiles = [
  { name: "desktop", viewport: { width: 1440, height: 1000 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
];

await fs.mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
let failed = false;
const checks = [];

try {
  for (const profile of profiles) {
    const context = await browser.newContext({ viewport: profile.viewport, colorScheme: "dark" });
    const page = await context.newPage();
    const response = await page.goto(`${baseUrl}/dashboard/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(700);
    await page.evaluate((key) => localStorage.removeItem(key), onboardingKey);

    const guideButton = page.getByRole("button", { name: "Open Averis product guide" });
    await guideButton.waitFor({ state: "visible", timeout: 5_000 });
    await guideButton.click();

    const dialog = page.getByRole("dialog", { name: /Averis helps you review work/i });
    await dialog.waitFor({ state: "visible", timeout: 5_000 });
    await page.waitForTimeout(120);

    const initialFocus = await page.evaluate(() => ({
      tag: document.activeElement?.tagName ?? null,
      label: document.activeElement?.getAttribute("aria-label") ?? null,
    }));

    const layout = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    const horizontalOverflow = Math.max(layout.scrollWidth, layout.bodyScrollWidth) - layout.viewportWidth;

    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const result = await window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
        resultTypes: ["violations"],
      });
      return result.violations
        .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
        .map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          targets: violation.nodes.slice(0, 5).map((node) => node.target),
        }));
    });

    const screenshotInitial = `onboarding-${profile.name}-step-1-v37.png`;
    await page.screenshot({ path: path.join(artifactDir, screenshotInitial), fullPage: false });

    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByText("Browser-local assignment workspace", { exact: true }).waitFor({ timeout: 3_000 });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByText("Re-check", { exact: true }).waitFor({ timeout: 3_000 });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByText("PRIVATE BROWSER AI", { exact: true }).waitFor({ timeout: 3_000 });

    const progressValue = await page.getByRole("progressbar", { name: "Product guide progress" }).getAttribute("aria-valuenow");
    const screenshotFinal = `onboarding-${profile.name}-step-4-v37.png`;
    await page.screenshot({ path: path.join(artifactDir, screenshotFinal), fullPage: false });

    await page.getByRole("button", { name: "Open my dashboard" }).click();
    await page.waitForTimeout(250);
    const storedAfterFinish = await page.evaluate((key) => localStorage.getItem(key), onboardingKey);

    await guideButton.waitFor({ state: "visible", timeout: 5_000 });
    await guideButton.click();
    await page.getByRole("dialog").waitFor({ state: "visible", timeout: 3_000 });
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 3_000 });
    const storedAfterManualEscape = await page.evaluate((key) => localStorage.getItem(key), onboardingKey);

    const check = {
      profile: profile.name,
      viewport: profile.viewport,
      status: response?.status() ?? 0,
      horizontal_overflow_px: horizontalOverflow,
      serious_or_critical_accessibility_violations: violations,
      initial_focus: initialFocus,
      final_progress_value: progressValue,
      completion_persisted: Boolean(storedAfterFinish?.startsWith("completed:")),
      manual_reopen_preserved_completion: storedAfterFinish === storedAfterManualEscape,
      screenshots: [screenshotInitial, screenshotFinal],
    };
    checks.push(check);

    if (!response || check.status < 200 || check.status >= 400) failed = true;
    if (horizontalOverflow > 2 || violations.length) failed = true;
    if (initialFocus.label !== "Close product guide") failed = true;
    if (progressValue !== "4") failed = true;
    if (!check.completion_persisted || !check.manual_reopen_preserved_completion) failed = true;

    console.log(
      `[${profile.name}] onboarding status=${check.status} overflow=${horizontalOverflow}px ` +
      `severeA11y=${violations.length} focus=${initialFocus.label} completion=${check.completion_persisted}`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}

await fs.writeFile(
  path.join(artifactDir, "onboarding-quality-v37.json"),
  `${JSON.stringify({ schema_version: "averis.onboarding-quality/v37", generated_at: new Date().toISOString(), checks }, null, 2)}\n`,
  "utf8",
);

if (failed) process.exit(1);
