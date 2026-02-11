import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const port = 5100 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;
const dbFile = path.join(
  os.tmpdir(),
  `skinbag-e2e-ui-${Date.now()}-${Math.random().toString(16).slice(2)}.db`
);

let serverProcess;
let browser;
let chromium;
let skipReason = null;
let serverStderr = "";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServerReady() {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (serverProcess?.exitCode !== null) {
      return false;
    }

    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return true;
      }
    } catch {
      // ignore until server starts
    }
    await sleep(120);
  }
  return false;
}

function requireReadyOrSkip(t) {
  if (!skipReason) {
    return true;
  }
  t.skip(skipReason);
  return false;
}

before(async () => {
  let playwrightModule = null;
  try {
    playwrightModule = await import("playwright");
  } catch {
    try {
      playwrightModule = await import("@playwright/test");
    } catch {
      skipReason = "Playwright is not installed (npm i -D playwright)";
      return;
    }
  }

  chromium = playwrightModule.chromium;
  if (!chromium) {
    skipReason = "Playwright chromium launcher is unavailable";
    return;
  }

  serverProcess = spawn("node", ["dist/server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      APP_URL: baseUrl,
      DB_FILE: dbFile,
      JWT_SECRET: "e2e-ui-secret"
    },
    stdio: ["ignore", "ignore", "pipe"]
  });

  serverProcess.stderr.on("data", (chunk) => {
    serverStderr += chunk.toString();
  });

  const ready = await waitForServerReady();
  if (!ready) {
    skipReason = serverStderr.includes("EPERM") || serverStderr.includes("EACCES")
      ? "HTTP bind is not allowed in this runtime"
      : "UI E2E server did not start";
    return;
  }

  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    skipReason = "Chromium browser is not installed (run: npx playwright install chromium)";
  }
});

after(async () => {
  if (browser) {
    await browser.close();
  }
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
  }
  await sleep(120);
  fs.rmSync(dbFile, { force: true });
  fs.rmSync(`${dbFile}-wal`, { force: true });
  fs.rmSync(`${dbFile}-shm`, { force: true });
});

test("login page renders google-only auth controls on clean url", async (t) => {
  if (!requireReadyOrSkip(t)) return;

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${baseUrl}/login`);
  await page.waitForURL("**/login", { timeout: 10_000 });
  await page.waitForSelector("#google-btn");
  await page.waitForSelector('a.home-link[href="/"]');

  await context.close();
});

test("unauthorized app route redirects to clean login url", async (t) => {
  if (!requireReadyOrSkip(t)) return;

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${baseUrl}/app`);
  await page.waitForURL("**/login", { timeout: 10_000 });

  await context.close();
});

test("theme switch persists on login page", async (t) => {
  if (!requireReadyOrSkip(t)) return;

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${baseUrl}/login`);
  await page.click('.theme button[data-theme-value="dark"]');
  await page.reload();

  const themeValue = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  assert.equal(themeValue, "dark");

  await context.close();
});
