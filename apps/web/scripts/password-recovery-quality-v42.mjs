import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.AVERIS_BASE_URL ?? "http://127.0.0.1:4173/averis-ai").replace(/\/$/, "");
const expectLoginLink = process.env.EXPECT_LOGIN_RECOVERY_LINK === "true";
const outputDir = path.resolve("artifacts/web-quality/password-recovery-v42");
fs.mkdirSync(outputDir, { recursive: true });

const profiles = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function certifyRecoveryPage(browser, profile) {
  const page = await browser.newPage({ viewport: { width: profile.width, height: profile.height } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  await page.goto(`${baseUrl}/recover/`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Reset your password" }).waitFor();

  const email = page.getByLabel("Email address");
  const submit = page.getByRole("button", { name: "Send password-reset link" });
  const back = page.getByRole("link", { name: /back to login/i });

  assert(await email.isVisible(), `${profile.name}: email field is not visible`);
  assert(await submit.isVisible(), `${profile.name}: recovery submit button is not visible`);
  assert(await back.isVisible(), `${profile.name}: back-to-login link is not visible`);

  const submitBox = await submit.boundingBox();
  assert(submitBox && submitBox.height >= 44, `${profile.name}: recovery submit target is smaller than 44px`);

  const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  assert(overflow <= 2, `${profile.name}: recovery route has ${overflow}px horizontal overflow`);

  const backHref = await back.getAttribute("href");
  assert(Boolean(backHref), `${profile.name}: back-to-login link has no href`);

  await page.screenshot({ path: path.join(outputDir, `recover-${profile.name}.png`), fullPage: true });

  if (errors.length) {
    throw new Error(`${profile.name}: browser errors detected:\n${errors.join("\n")}`);
  }

  await page.close();
}

async function certifyLoginRecoveryLink(browser) {
  if (!expectLoginLink) return;

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

  const login = page.getByRole("button", { name: /^login$/i }).first();
  await login.waitFor({ state: "visible" });
  await login.click();

  const recoveryLink = page.locator('[data-averis-recovery-link="true"]');
  await recoveryLink.waitFor({ state: "visible" });
  const href = await recoveryLink.getAttribute("href");
  assert(href?.includes("recover"), "Login recovery link does not target the recovery route");

  const box = await recoveryLink.boundingBox();
  assert(box && box.height >= 44, "Login recovery link touch target is smaller than 44px");

  await page.screenshot({ path: path.join(outputDir, "login-recovery-link.png"), fullPage: true });
  await page.close();
}

const browser = await chromium.launch({ headless: true });
try {
  for (const profile of profiles) {
    await certifyRecoveryPage(browser, profile);
  }
  await certifyLoginRecoveryLink(browser);
  console.log(`Password recovery v42 quality passed for ${profiles.length} viewport profiles${expectLoginLink ? " plus login-link integration" : ""}.`);
} finally {
  await browser.close();
}
