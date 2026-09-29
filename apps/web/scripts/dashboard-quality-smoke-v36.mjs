import fs from "node:fs/promises";
import path from "node:path";

import axe from "axe-core";
import { chromium } from "playwright";

const baseUrl = (process.env.AVERIS_BASE_URL || "http://127.0.0.1:4173/averis-ai").replace(/\/$/, "");
const artifactDir = path.resolve(process.cwd(), "../../artifacts/web-quality");
const storageKey = "averis:assignment-workspaces:v35";
const activeKey = "averis:assignment-workspace-active:v35";

const profiles = [
  { name: "desktop", viewport: { width: 1440, height: 1000 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
];

function futureDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function seedWorkspaces() {
  const now = new Date().toISOString();
  return [
    {
      id: "qa-assignment-1",
      title: "Evidence-based systems report",
      module: "IT Research Methods",
      dueDate: futureDate(3),
      wordTarget: 2200,
      brief: "Write a 2,200 word report with an introduction, analysis, conclusion and APA 7 references.",
      draft: "Evidence-first academic review supports transparent student decision making. ".repeat(24).trim(),
      source: "A sample scholarly source passage used only for browser quality testing.",
      references: "Smith, J. (2024). Evidence review in higher education. Journal of Academic Practice. https://doi.org/10.1000/example\n\nPerera, N. (2023). Student review workflows. Learning Systems Review.",
      notes: "Finish analysis section and re-run evidence checks.",
      autosave: true,
      createdAt: now,
      updatedAt: now,
      history: [
        { at: now, action: "Captured current Studio state", words: 1680 },
        { at: new Date(Date.now() - 86_400_000).toISOString(), action: "Restored workspace into Studio", words: 1490 },
      ],
    },
    {
      id: "qa-assignment-2",
      title: "Network security reflection",
      module: "Computer Networks",
      dueDate: futureDate(11),
      wordTarget: 1200,
      brief: "Prepare a structured reflection using Harvard references.",
      draft: "This reflection considers how network controls affect practical risk decisions. ".repeat(9).trim(),
      source: "",
      references: "Fernando, A. (2025). Network controls in practice. Computing Review.",
      notes: "",
      autosave: true,
      createdAt: now,
      updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
      history: [{ at: new Date(Date.now() - 3_600_000).toISOString(), action: "Workspace created from current Studio", words: 630 }],
    },
  ];
}

await fs.mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
let failed = false;
const checks = [];

try {
  for (const profile of profiles) {
    const context = await browser.newContext({ viewport: profile.viewport, colorScheme: "dark" });
    const page = await context.newPage();

    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const workspaces = seedWorkspaces();
    await page.evaluate(({ key, active, items }) => {
      localStorage.setItem(key, JSON.stringify(items));
      localStorage.setItem(active, items[0].id);
    }, { key: storageKey, active: activeKey, items: workspaces });

    const response = await page.goto(`${baseUrl}/dashboard/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(800);
    await page.getByText("ASSIGNMENT RADAR").waitFor({ timeout: 5_000 });

    const layout = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    const horizontalOverflow = Math.max(layout.scrollWidth, layout.bodyScrollWidth) - layout.viewportWidth;

    const brokenImages = await page.locator("img").evaluateAll((images) => images
      .filter((image) => !image.complete || image.naturalWidth === 0)
      .map((image) => ({ src: image.getAttribute("src"), alt: image.getAttribute("alt") })));

    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const result = await window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
        resultTypes: ["violations"],
      });
      return result.violations
        .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
        .map((violation) => ({ id: violation.id, impact: violation.impact, help: violation.help, targets: violation.nodes.slice(0, 5).map((node) => node.target) }));
    });

    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => ({
      tag: document.activeElement?.tagName ?? null,
      ok: Boolean(document.activeElement && !["BODY", "HTML"].includes(document.activeElement.tagName)),
    }));

    const screenshot = `dashboard-${profile.name}-v36.png`;
    await page.screenshot({ path: path.join(artifactDir, screenshot), fullPage: true });

    const check = {
      profile: profile.name,
      viewport: profile.viewport,
      status: response?.status() ?? 0,
      horizontal_overflow_px: horizontalOverflow,
      broken_images: brokenImages,
      serious_or_critical_accessibility_violations: violations,
      keyboard_focus: focus,
      screenshot,
    };
    checks.push(check);

    if (!response || check.status < 200 || check.status >= 400) failed = true;
    if (horizontalOverflow > 2 || brokenImages.length || violations.length || !focus.ok) failed = true;

    console.log(`[${profile.name}] dashboard status=${check.status} overflow=${horizontalOverflow}px brokenImages=${brokenImages.length} severeA11y=${violations.length} focus=${focus.tag}`);
    await context.close();
  }
} finally {
  await browser.close();
}

await fs.writeFile(
  path.join(artifactDir, "dashboard-quality-v36.json"),
  `${JSON.stringify({ schema_version: "averis.dashboard-quality/v36", generated_at: new Date().toISOString(), checks }, null, 2)}\n`,
  "utf8",
);

if (failed) process.exit(1);
