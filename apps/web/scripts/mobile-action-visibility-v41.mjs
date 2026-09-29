import fs from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const baseUrl = (process.env.AVERIS_BASE_URL || "http://127.0.0.1:4173/averis-ai").replace(/\/$/, "");
const artifactDir = path.resolve(process.cwd(), "../../artifacts/web-quality");
const profiles = [
  { name: "mobile", viewport: { width: 390, height: 844 } },
  { name: "small-mobile", viewport: { width: 360, height: 800 } },
];
const routes = [
  { name: "workspace", path: "/", selector: ".toolNav .toolButton", expected: 4, prepareWorkspace: true },
  { name: "studio", path: "/studio/", selector: ".studioV27Command__phase", expected: 6 },
];

await fs.mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
let failed = false;

try {
  for (const profile of profiles) {
    const context = await browser.newContext({ viewport: profile.viewport, colorScheme: "dark" });
    for (const route of routes) {
      const page = await context.newPage();
      const url = route.path === "/" ? `${baseUrl}/` : `${baseUrl}${route.path}`;
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      if (!response || response.status() >= 400) throw new Error(`${route.name} ${profile.name} failed to load`);
      await page.waitForTimeout(500);

      if (route.prepareWorkspace) {
        await page.evaluate(() => {
          document.querySelector('section[aria-label="Averis product introduction"]')?.remove();
          document.documentElement.dataset.averisIntroVisible = "false";
          document.documentElement.dataset.averisAuthBootstrap = "ready";
          document.documentElement.dataset.averisWorkspaceOpen = "true";
          delete document.documentElement.dataset.averisReviewCenter;
        });
        await page.waitForTimeout(160);
      }

      await page.locator(route.selector).first().waitFor({ state: "visible", timeout: 5_000 });
      const measurement = await page.evaluate(({ selector, expected }) => {
        const viewportWidth = document.documentElement.clientWidth;
        const controls = [...document.querySelectorAll(selector)];
        const details = controls.map((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          const horizontalClip = Math.max(0, -rect.left, rect.right - viewportWidth);
          return {
            text: (element.getAttribute("aria-label") || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 100),
            left: Math.round(rect.left * 100) / 100,
            right: Math.round(rect.right * 100) / 100,
            width: Math.round(rect.width * 100) / 100,
            height: Math.round(rect.height * 100) / 100,
            visible: style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0,
            horizontal_clip_px: Math.round(horizontalClip * 100) / 100,
          };
        });
        return {
          count: controls.length,
          expected,
          document_overflow_px: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - viewportWidth,
          controls: details,
          all_visible: controls.length === expected && details.every((item) => item.visible && item.horizontal_clip_px <= 2),
        };
      }, { selector: route.selector, expected: route.expected });

      const ok = measurement.all_visible && measurement.document_overflow_px <= 2;
      if (!ok) failed = true;
      results.push({ profile: profile.name, route: route.name, ok, ...measurement });
      await page.screenshot({ path: path.join(artifactDir, `mobile-action-v41-${route.name}-${profile.name}.png`), fullPage: true });
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}

await fs.writeFile(
  path.join(artifactDir, "mobile-action-visibility-v41-report.json"),
  `${JSON.stringify({ results }, null, 2)}\n`,
  "utf8",
);

if (failed) {
  console.error(JSON.stringify(results, null, 2));
  process.exit(1);
}
console.log("Averis v41 mobile action visibility certification passed.");
