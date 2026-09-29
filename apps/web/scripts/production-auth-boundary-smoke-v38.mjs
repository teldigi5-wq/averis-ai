import fs from "node:fs/promises";
import path from "node:path";

import axe from "axe-core";
import { chromium } from "playwright";

const baseUrl = (process.env.AVERIS_BASE_URL || "http://127.0.0.1:4173/averis-ai").replace(/\/$/, "");
const artifactDir = path.resolve(process.cwd(), "../../artifacts/web-quality");
const workspaceKey = "averis:assignment-workspaces:v35";
const activeKey = "averis:assignment-workspace-active:v35";
const secretWorkspaceTitle = "QA PRIVATE ASSIGNMENT MUST STAY HIDDEN";

const profiles = [
  { name: "desktop", viewport: { width: 1440, height: 1000 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
];

function compactViolation(violation) {
  return {
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.slice(0, 5).map((node) => node.target),
  };
}

async function measurePage(page) {
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
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        targets: violation.nodes.slice(0, 5).map((node) => node.target),
      }));
  });

  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => ({
    tag: document.activeElement?.tagName ?? null,
    label: document.activeElement?.getAttribute("aria-label") ?? null,
    ok: Boolean(document.activeElement && !["BODY", "HTML"].includes(document.activeElement.tagName)),
  }));

  return { horizontalOverflow, brokenImages, violations, focus };
}

await fs.mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
let failed = false;
const checks = [];

try {
  for (const profile of profiles) {
    const context = await browser.newContext({ viewport: profile.viewport, colorScheme: "dark" });
    const page = await context.newPage();

    // Seed browser-local academic content before loading the protected dashboard.
    // The production auth boundary must keep it unreadable while signed out.
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.evaluate(({ workspaceKey, activeKey, title }) => {
      const now = new Date().toISOString();
      localStorage.setItem(workspaceKey, JSON.stringify([{
        id: "qa-private-assignment",
        title,
        module: "Private QA Module",
        dueDate: "2099-12-31",
        wordTarget: 1500,
        brief: "Private assignment brief",
        draft: "Private draft content that must not appear while the user is signed out.",
        source: "Private source",
        references: "Private reference",
        notes: "Private note",
        autosave: true,
        createdAt: now,
        updatedAt: now,
        history: [],
      }]));
      localStorage.setItem(activeKey, "qa-private-assignment");
    }, { workspaceKey, activeKey, title: secretWorkspaceTitle });

    const dashboardResponse = await page.goto(`${baseUrl}/dashboard/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.getByRole("heading", { name: "Your assignment overview stays behind your Averis session." }).waitFor({ timeout: 8_000 });
    const leakedWorkspace = await page.getByText(secretWorkspaceTitle, { exact: true }).count();
    const dashboardMetrics = await measurePage(page);
    const dashboardScreenshot = `production-auth-dashboard-${profile.name}-v38.png`;
    await page.screenshot({ path: path.join(artifactDir, dashboardScreenshot), fullPage: true });

    const dashboardCheck = {
      route: "/dashboard/",
      profile: profile.name,
      status: dashboardResponse?.status() ?? 0,
      expected_auth_gate_visible: true,
      local_workspace_content_exposed: leakedWorkspace > 0,
      horizontal_overflow_px: dashboardMetrics.horizontalOverflow,
      broken_images: dashboardMetrics.brokenImages,
      serious_or_critical_accessibility_violations: dashboardMetrics.violations,
      keyboard_focus: dashboardMetrics.focus,
      screenshot: dashboardScreenshot,
    };
    checks.push(dashboardCheck);

    if (!dashboardResponse || dashboardCheck.status < 200 || dashboardCheck.status >= 400) failed = true;
    if (dashboardCheck.local_workspace_content_exposed) failed = true;
    if (dashboardMetrics.horizontalOverflow > 2 || dashboardMetrics.brokenImages.length || dashboardMetrics.violations.length || !dashboardMetrics.focus.ok) failed = true;

    const studioResponse = await page.goto(`${baseUrl}/studio/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.getByRole("heading", { name: "Sign in to review and accept revision proposals sentence by sentence." }).waitFor({ timeout: 8_000 });
    const editorCount = await page.locator("textarea").count();
    const studioMetrics = await measurePage(page);
    const studioScreenshot = `production-auth-studio-${profile.name}-v38.png`;
    await page.screenshot({ path: path.join(artifactDir, studioScreenshot), fullPage: true });

    const studioCheck = {
      route: "/studio/",
      profile: profile.name,
      status: studioResponse?.status() ?? 0,
      expected_auth_gate_visible: true,
      editor_exposed_while_signed_out: editorCount > 0,
      horizontal_overflow_px: studioMetrics.horizontalOverflow,
      broken_images: studioMetrics.brokenImages,
      serious_or_critical_accessibility_violations: studioMetrics.violations,
      keyboard_focus: studioMetrics.focus,
      screenshot: studioScreenshot,
    };
    checks.push(studioCheck);

    if (!studioResponse || studioCheck.status < 200 || studioCheck.status >= 400) failed = true;
    if (studioCheck.editor_exposed_while_signed_out) failed = true;
    if (studioMetrics.horizontalOverflow > 2 || studioMetrics.brokenImages.length || studioMetrics.violations.length || !studioMetrics.focus.ok) failed = true;

    console.log(
      `[${profile.name}] production auth boundaries ` +
      `dashboardLeak=${dashboardCheck.local_workspace_content_exposed} ` +
      `studioEditorExposed=${studioCheck.editor_exposed_while_signed_out} ` +
      `dashboardA11y=${dashboardMetrics.violations.length} studioA11y=${studioMetrics.violations.length}`,
    );

    await context.close();
  }
} finally {
  await browser.close();
}

const report = {
  schema_version: "averis.production-auth-boundary/v38",
  generated_at: new Date().toISOString(),
  base_url: baseUrl,
  checks,
  passed: !failed,
};
await fs.writeFile(
  path.join(artifactDir, "production-auth-boundary-v38.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);

if (failed) process.exit(1);
