import fs from "node:fs/promises";
import path from "node:path";

import axe from "axe-core";
import { chromium } from "playwright";

const baseUrl = (process.env.AVERIS_BASE_URL || "http://127.0.0.1:4173/averis-ai").replace(/\/$/, "");
const artifactDir = path.resolve(process.cwd(), "../../artifacts/web-quality");

const routes = [
  { name: "home", path: "/" },
  { name: "review-center", path: "/?review-center=1", reviewCenter: true },
  { name: "workspace", path: "/", workspace: true },
  { name: "multi-source", path: "/multi-source/" },
  { name: "revision", path: "/revision/" },
  { name: "refine", path: "/refine/" },
  { name: "studio", path: "/studio/" },
  { name: "privacy", path: "/privacy/" },
];

const profiles = [
  { name: "desktop", viewport: { width: 1440, height: 1000 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
];

function routeUrl(routePath) {
  if (routePath === "/") return `${baseUrl}/`;
  return `${baseUrl}${routePath}`;
}

function compactViolation(violation) {
  return {
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    helpUrl: violation.helpUrl,
    nodes: violation.nodes.slice(0, 5).map((node) => ({
      target: node.target,
      html: node.html.slice(0, 320),
      failureSummary: node.failureSummary,
    })),
  };
}

async function prepareRoute(page, route) {
  if (!route.workspace && !route.reviewCenter) return;
  await page.evaluate((mode) => {
    document.querySelector('section[aria-label="Averis product introduction"]')?.remove();
    document.documentElement.dataset.averisIntroVisible = "false";
    document.documentElement.dataset.averisAuthBootstrap = "ready";
    document.documentElement.dataset.averisWorkspaceOpen = "true";
    if (mode === "workspace") delete document.documentElement.dataset.averisReviewCenter;
  }, route.workspace ? "workspace" : "review-center");
  await page.waitForTimeout(route.reviewCenter ? 320 : 120);
}

async function exerciseScrollExperience(page) {
  const { scrollHeight, viewportHeight } = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
  }));
  const step = Math.max(320, Math.floor(viewportHeight * 0.72));
  for (let y = 0; y < scrollHeight; y += step) {
    await page.evaluate((offset) => window.scrollTo({ top: offset, behavior: "instant" }), y);
    await page.waitForTimeout(70);
  }
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await page.waitForTimeout(140);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(180);
}

await fs.mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const report = {
  schema_version: "averis.web-quality/v3",
  base_url: baseUrl,
  generated_at: new Date().toISOString(),
  checks: [],
  summary: {
    pages_checked: 0,
    serious_or_critical_accessibility_violations: 0,
    overflow_failures: 0,
    broken_image_failures: 0,
    keyboard_focus_failures: 0,
  },
};

let failed = false;

try {
  for (const profile of profiles) {
    const context = await browser.newContext({
      viewport: profile.viewport,
      colorScheme: "dark",
      reducedMotion: "no-preference",
    });

    for (const route of routes) {
      const page = await context.newPage();
      const url = routeUrl(route.path);
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(600);
      await prepareRoute(page, route);
      await exerciseScrollExperience(page);

      const status = response?.status() ?? 0;
      const title = await page.title();
      const layout = await page.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }));
      const horizontalOverflow = Math.max(layout.scrollWidth, layout.bodyScrollWidth) - layout.viewportWidth;

      const overflowOffenders = await page.evaluate(() => {
        const viewportWidth = document.documentElement.clientWidth;
        return [...document.querySelectorAll("body *")]
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const rightOverflow = Math.max(0, rect.right - viewportWidth);
            const leftOverflow = Math.max(0, -rect.left);
            const overflow = Math.max(rightOverflow, leftOverflow);
            return {
              overflow: Math.round(overflow * 100) / 100,
              tag: element.tagName,
              id: element.id || null,
              className: typeof element.className === "string" ? element.className.slice(0, 180) : null,
              width: Math.round(rect.width * 100) / 100,
              left: Math.round(rect.left * 100) / 100,
              right: Math.round(rect.right * 100) / 100,
              text: (element.getAttribute("aria-label") || element.textContent || "")
                .trim()
                .replace(/\s+/g, " ")
                .slice(0, 120),
            };
          })
          .filter((item) => item.overflow > 2)
          .sort((a, b) => b.overflow - a.overflow)
          .slice(0, 12);
      });

      const brokenImages = await page.locator("img").evaluateAll((images) =>
        images
          .filter((image) => !image.complete || image.naturalWidth === 0)
          .map((image) => ({ src: image.getAttribute("src"), alt: image.getAttribute("alt") })),
      );

      await page.addScriptTag({ content: axe.source });
      const axeResults = await page.evaluate(async () => {
        const results = await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
          resultTypes: ["violations"],
        });
        return results.violations;
      });
      const severeViolations = axeResults
        .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
        .map(compactViolation);

      await page.keyboard.press("Tab");
      const focusState = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active) return { ok: false, tag: null, text: null };
        const tag = active.tagName;
        return {
          ok: !["BODY", "HTML"].includes(tag),
          tag,
          text: (active.getAttribute("aria-label") || active.textContent || "").trim().slice(0, 120),
        };
      });

      const screenshotPath = path.join(artifactDir, `${route.name}-${profile.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      const check = {
        route: route.path,
        mode: route.reviewCenter ? "review-center" : route.workspace ? "workspace" : "default",
        profile: profile.name,
        viewport: profile.viewport,
        url,
        http_status: status,
        title,
        horizontal_overflow_px: horizontalOverflow,
        overflow_offenders: overflowOffenders,
        broken_images: brokenImages,
        keyboard_focus: focusState,
        serious_or_critical_accessibility_violations: severeViolations,
        screenshot: path.basename(screenshotPath),
      };
      report.checks.push(check);
      report.summary.pages_checked += 1;
      report.summary.serious_or_critical_accessibility_violations += severeViolations.length;

      if (!response || status < 200 || status >= 400) failed = true;
      if (!title.toLowerCase().includes("averis")) failed = true;
      if (horizontalOverflow > 2) {
        failed = true;
        report.summary.overflow_failures += 1;
      }
      if (brokenImages.length > 0) {
        failed = true;
        report.summary.broken_image_failures += 1;
      }
      if (!focusState.ok) {
        failed = true;
        report.summary.keyboard_focus_failures += 1;
      }
      if (severeViolations.length > 0) failed = true;

      console.log(
        `[${profile.name}] ${route.name} status=${status} overflow=${horizontalOverflow}px ` +
          `brokenImages=${brokenImages.length} severeA11y=${severeViolations.length} focus=${focusState.tag}`,
      );
      if (overflowOffenders.length > 0) {
        console.log(`overflow offenders for [${profile.name}] ${route.name}: ${JSON.stringify(overflowOffenders, null, 2)}`);
      }

      await page.close();
    }

    await context.close();
  }
} finally {
  await browser.close();
}

const reportPath = path.join(artifactDir, "web-quality-report.json");
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Averis browser quality report: ${reportPath}`);

if (failed) {
  console.error(JSON.stringify(report.summary, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report.summary, null, 2));
