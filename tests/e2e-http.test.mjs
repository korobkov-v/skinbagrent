import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const port = 4700 + Math.floor(Math.random() * 400);
const baseUrl = `http://127.0.0.1:${port}`;
const compatApiKey = "sbr_e2e_bind_key";
const dbFile = path.join(
  os.tmpdir(),
  `skinbag-e2e-http-${Date.now()}-${Math.random().toString(16).slice(2)}.db`
);

let serverProcess;
let skipReason = null;
let serverStderr = "";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseSetCookie(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const fallback = headers.get("set-cookie");
  return fallback ? [fallback] : [];
}

function updateJarFromHeaders(headers, jar) {
  const cookies = parseSetCookie(headers);
  for (const cookie of cookies) {
    const pair = String(cookie).split(";")[0];
    const separator = pair.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    jar.set(name, value);
  }
}

function cookieHeader(jar) {
  return [...jar.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function request(pathname, options = {}) {
  const jar = options.jar ?? new Map();
  const headers = { ...(options.headers || {}) };

  if (jar.size) {
    headers.cookie = cookieHeader(jar);
  }
  if (options.json !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
    redirect: "manual"
  });

  updateJarFromHeaders(response.headers, jar);

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return { status: response.status, data, headers: response.headers, jar };
}

async function waitForHealth() {
  const deadline = Date.now() + 10_000;
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
      // still booting
    }
    await sleep(150);
  }
  return false;
}

before(async () => {
  serverProcess = spawn("node", ["dist/server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      APP_URL: baseUrl,
      DB_FILE: dbFile,
      JWT_SECRET: "e2e-http-secret",
      COMPAT_DEMO_API_KEY: compatApiKey
    },
    stdio: ["ignore", "ignore", "pipe"]
  });

  serverProcess.stderr.on("data", (chunk) => {
    serverStderr += chunk.toString();
  });

  const ready = await waitForHealth();
  if (!ready) {
    skipReason = "Could not start HTTP server in this environment";
    if (serverStderr.includes("EPERM") || serverStderr.includes("EACCES")) {
      skipReason = "HTTP bind is not allowed in this runtime";
    }
  }
});

after(async () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
  }
  await sleep(150);
  fs.rmSync(dbFile, { force: true });
  fs.rmSync(`${dbFile}-wal`, { force: true });
  fs.rmSync(`${dbFile}-shm`, { force: true });
});

function requireServerOrSkip(t) {
  if (!skipReason) {
    return true;
  }
  t.skip(skipReason);
  return false;
}

test("CSRF blocks auth write without token", async (t) => {
  if (!requireServerOrSkip(t)) return;

  const response = await request("/api/auth/register", {
    method: "POST",
    json: {
      email: "e2e-no-csrf@example.com",
      password: "password123",
      fullName: "No Csrf"
    }
  });

  assert.equal(response.status, 403);
  assert.equal(response.data?.error, "Invalid CSRF token");
});

test("local register/login are disabled and return google redirect hint", async (t) => {
  if (!requireServerOrSkip(t)) return;

  const jar = new Map();
  const csrf = await request("/api/auth/csrf", { jar });
  assert.equal(csrf.status, 200);
  assert.ok(typeof csrf.data?.csrfToken === "string");

  const register = await request("/api/auth/register", {
    method: "POST",
    jar,
    headers: { "x-csrf-token": csrf.data.csrfToken },
    json: {
      email: `e2e-${Date.now()}@example.com`,
      password: "password123",
      fullName: "E2E User"
    }
  });
  assert.equal(register.status, 403);
  assert.equal(register.data?.error, "Email/password authentication is disabled. Continue with Google.");
  assert.equal(register.data?.redirectUrl, "/login");

  const login = await request("/api/auth/login", {
    method: "POST",
    jar,
    headers: { "x-csrf-token": csrf.data.csrfToken },
    json: {
      email: "demo@rent.local",
      password: "wrong-password"
    }
  });
  assert.equal(login.status, 403);
  assert.equal(login.data?.error, "Email/password authentication is disabled. Continue with Google.");
  assert.equal(login.data?.redirectUrl, "/login");
});

test("compat api key binding is enforced on bookings", async (t) => {
  if (!requireServerOrSkip(t)) return;

  const humans = await request("/api/humans", {
    headers: { "x-api-key": compatApiKey }
  });
  assert.equal(humans.status, 200);
  assert.equal(humans.data?.success, true);
  assert.ok(Array.isArray(humans.data?.humans) && humans.data.humans.length > 0);

  const humanId = humans.data.humans[0].id;
  const mismatched = await request("/api/bookings", {
    method: "POST",
    headers: { "x-api-key": compatApiKey },
    json: {
      humanId,
      agentId: "other-agent",
      taskTitle: "E2E mismatch",
      taskDescription: "should fail by key binding",
      startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      estimatedHours: 1
    }
  });

  assert.equal(mismatched.status, 403);
  assert.equal(mismatched.data?.error, "agentId does not match API key");
});

test("auth me remains protected without google session", async (t) => {
  if (!requireServerOrSkip(t)) return;

  const me = await request("/api/auth/me");
  assert.equal(me.status, 401);
  assert.equal(me.data?.error, "Unauthorized");
});
