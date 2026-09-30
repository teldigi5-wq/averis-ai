import fs from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const baseUrl = (process.env.AVERIS_BASE_URL || "http://127.0.0.1:4173/averis-ai").replace(/\/$/, "");
const artifactDir = path.resolve(process.cwd(), "../../artifacts/web-quality");
const targets = [
  { name: "source-intelligence", href: "/multi-source/", launchText: "Open sources" },
  { name: "evidence-ai", href: "/revision/", launchText: "Open evidence AI" },
  { name: "writing-refinement", href: "/refine/", launchText: "Open refinement" },
  { name: "revision-studio", href: "/studio/", launchText: "Open studio" },
  { name: "private-ai", href: "/private-ai/", launchText: "Open private AI" },
];

await fs.mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const results = [];
let failed = false;

for (const target of targets) {
  const home = await page.goto(`${baseUrl}/?review-center=1`, { waitUntil: "networkidle" });
  if (!home || home.status() !== 200) throw new Error(`Review Center did not return HTTP 200 for ${target.name}`);

  const reviewCenter = page.locator(".reviewCenterV18");
  await reviewCenter.waitFor({ state: "visible" });
  await page.evaluate(() => window.scrollTo(0, Math.max(700, document.documentElement.scrollHeight * 0.45)));
  const beforeScroll = await page.evaluate(() => window.scrollY);
  if (beforeScroll < 300) throw new Error(`Could not create a meaningful pre-navigation scroll offset for ${target.name}`);

  const launcher = page.getByText(target.launchText, { exact: false }).last();
  await launcher.scrollIntoViewIfNeeded();
  await launcher.click();
  await page.waitForURL((url) => url.pathname.endsWith(target.href), { timeout: 10000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(80);

  const measurement = await page.evaluate(() => {
    const heading = document.querySelector("main h1") || document.querySelector("h1");
    const headingRect = heading?.getBoundingClientRect() ?? null;
    return {
      scrollY: window.scrollY,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      headingTop: headingRect?.top ?? null,
      headingBottom: headingRect?.bottom ?? null,
      headingVisible: Boolean(headingRect && headingRect.bottom > 0 && headingRect.top < window.innerHeight),
    };
  });

  const overflow = measurement.scrollWidth > measurement.clientWidth + 1;
  const reset = measurement.scrollY <= 2;
  const heroVisible = measurement.headingVisible && measurement.headingTop !== null && measurement.headingTop >= -1;
  const ok = reset && heroVisible && !overflow;
  if (!ok) failed = true;

  await page.screenshot({
    path: path.join(artifactDir, `route-isolation-v48-${target.name}.png`),
    fullPage: false,
  });

  results.push({
    route: target.href,
    ok,
    pre_navigation_scroll_y: beforeScroll,
    post_navigation_scroll_y: measurement.scrollY,
    heading_top: measurement.headingTop,
    heading_bottom: measurement.headingBottom,
    heading_visible: measurement.headingVisible,
    horizontal_overflow: overflow,
  });
}

await browser.close();
await fs.writeFile(path.join(artifactDir, "route-isolation-v48-report.json"), `${JSON.stringify({ results }, null, 2)}\n`);

if (failed) {
  console.error(JSON.stringify(results, null, 2));
  process.exit(1);
}

console.log("Averis v48 route scroll/isolation certification passed.");
