import path from "path";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import session from "express-session";
import passport from "passport";
import { attachUser, setupPassport } from "./auth";
import { csrfProtection } from "./middleware/csrf";
import { config } from "./config";
import { initializeDatabase } from "./db/init";
import { authApiRouter, googleAuthRouter } from "./routes/authRoutes";
import { bookingRouter } from "./routes/bookingRoutes";
import { bountyRouter } from "./routes/bountyRoutes";
import { conversationRouter } from "./routes/conversationRoutes";
import { docsRouter } from "./routes/docsRoutes";
import { humanRouter } from "./routes/humanRoutes";
import { paymentRouter } from "./routes/paymentRoutes";
import { mcpToolRequestRouter } from "./routes/mcpToolRequestRoutes";
import { hostedMcpRouter } from "./routes/mcpRoutes";
import { profileRouter } from "./routes/profileRoutes";
import { rentahumanCompatRouter } from "./routes/rentahumanCompatRoutes";
import { statsRouter } from "./routes/statsRoutes";
import { verifyEmailByToken } from "./services/profileService";
import { SqliteSessionStore } from "./services/sqliteSessionStore";
import {
  recordAgentScrapeVisit,
  recordApiRequest,
  recordHumanVisit,
  recordMcpRequest,
  recordVisit,
} from "./services/trafficStatsService";

initializeDatabase();
setupPassport();

const app = express();
const sessionStore = new SqliteSessionStore();
const TRACKED_PAGE_PATHS = new Set(["/", "/login", "/app", "/api-docs", "/llms.txt"]);
const EXCLUDED_API_METRIC_PATHS = new Set([
  "/api/health",
  "/api/stats",
  "/api/public-config",
]);
const BOT_USER_AGENT_PATTERN =
  /\b(bot|crawler|crawl|spider|slurp|archiver|gptbot|chatgpt|openai|anthropic|claude|perplexity|bytespider)\b/i;
const AGENT_USER_AGENT_PATTERN =
  /\b(mcp|agent|cursor|claude|openai|anthropic|perplexity|langchain|llamaindex)\b/i;

app.set("trust proxy", config.TRUST_PROXY);

// Health endpoint must be reachable without auth/session middleware.
// Docker healthchecks and uptime monitors call it without cookies/headers.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "rent-a-human-clone" });
});

function shouldRecordVisit(req: express.Request): boolean {
  if (req.method !== "GET") {
    return false;
  }
  if (req.path === "/docs" || req.path.startsWith("/docs/")) {
    return true;
  }
  return TRACKED_PAGE_PATHS.has(req.path);
}

function shouldRecordApiRequest(req: express.Request): boolean {
  if (!req.path.startsWith("/api/")) {
    return false;
  }
  if (req.method === "OPTIONS") {
    return false;
  }
  return !EXCLUDED_API_METRIC_PATHS.has(req.path);
}

function shouldRecordMcpRequest(req: express.Request): boolean {
  if (req.path !== "/mcp") {
    return false;
  }
  return req.method !== "OPTIONS";
}

function isLikelyAgentScraper(req: express.Request): boolean {
  const userAgent = String(req.header("user-agent") ?? "");
  if (!userAgent) {
    return false;
  }
  if (BOT_USER_AGENT_PATTERN.test(userAgent)) {
    return true;
  }
  if (AGENT_USER_AGENT_PATTERN.test(userAgent)) {
    return true;
  }
  if (req.header("mcp-session-id")) {
    return true;
  }
  return false;
}

app.use((req, _res, next) => {
  try {
    if (shouldRecordVisit(req)) {
      recordVisit();
      if (isLikelyAgentScraper(req)) {
        recordAgentScrapeVisit();
      } else {
        recordHumanVisit();
      }
    }
    if (shouldRecordApiRequest(req)) {
      recordApiRequest();
    }
    if (shouldRecordMcpRequest(req)) {
      recordMcpRequest();
    }
  } catch (error) {
    console.error("Failed to persist traffic metrics", error);
  }
  next();
});

app.use(
  cors({
    origin: config.APP_URL,
    credentials: true,
  }),
);
app.use(
  helmet({
    // We serve static HTML pages with inline scripts.
    // Helmet's default CSP blocks inline scripts which makes the UI invisible
    // (index.html hides [data-reveal] until JS runs).
    //
    // NOTE: Firebase/Google auth popup requires COOP allow-popups, otherwise
    // signInWithPopup may fail with auth/popup-closed-by-user.
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": [
          "'self'",
          "https://www.gstatic.com",
          "https://accounts.google.com",
          "https://apis.google.com",
          "https://www.googletagmanager.com",
          "'unsafe-inline'",
        ],
        "style-src": ["'self'", "https:", "'unsafe-inline'"],
        "font-src": ["'self'", "https:", "data:"],
        "connect-src": [
          "'self'",
          "https://identitytoolkit.googleapis.com",
          "https://securetoken.googleapis.com",
          "https://www.googleapis.com",
          "https://www.gstatic.com",
          "https://apis.google.com",
          "https://www.google.com",
          "https://accounts.google.com",
          "https://oauth2.googleapis.com",
          "https://www.google-analytics.com",
          "https://region1.google-analytics.com",
        ],
        "frame-src": [
          "'self'",
          "https://skinbagrent.firebaseapp.com",
          "https://www.google.com",
          "https://accounts.google.com",
          "https://apis.google.com",
        ],
        "img-src": [
          "'self'",
          "data:",
          "https://www.google.com",
          "https://accounts.google.com",
          "https://www.google-analytics.com",
          "https://region1.google-analytics.com",
        ],
      },
    },
  }),
);
app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  session({
    name: "sbr.sid",
    secret: config.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);
app.use(passport.initialize());
app.use(passport.session());
app.use(attachUser);

app.use(hostedMcpRouter);
app.use("/api", rentahumanCompatRouter);
app.use("/api", csrfProtection);
app.use("/api/auth", authApiRouter);
app.use("/auth", googleAuthRouter);
app.use("/api", humanRouter);
app.use("/api", statsRouter);
app.use("/api", bookingRouter);
app.use("/api", conversationRouter);
app.use("/api", bountyRouter);
app.use("/api", paymentRouter);
app.use("/api", profileRouter);
app.use("/api", mcpToolRequestRouter);
app.use(docsRouter);

app.get("/verify-email", (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token.trim()) {
    return res.redirect("/login?error=Missing%20verification%20token");
  }

  try {
    verifyEmailByToken(token.trim());
    return res.redirect("/login?verified=1");
  } catch (error) {
    return res.redirect(
      `/login?error=${encodeURIComponent((error as Error).message)}`,
    );
  }
});

const publicDir = path.resolve(__dirname, "..", "public");
app.get("/index.html", (_req, res) => {
  res.redirect("/");
});

app.get("/login.html", (req, res) => {
  const query = req.url.includes("?")
    ? req.url.slice(req.url.indexOf("?"))
    : "";
  res.redirect(`/login${query}`);
});

app.get("/app.html", (_req, res) => {
  res.redirect("/app");
});

app.use(express.static(publicDir));

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/login", (_req, res) => {
  res.sendFile(path.join(publicDir, "login.html"));
});

app.get("/app", (_req, res) => {
  res.sendFile(path.join(publicDir, "app.html"));
});

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  },
);

app.listen(config.PORT, () => {
  console.log(`API server started at ${config.APP_URL}`);
  console.log(`Docs: ${config.APP_URL}/api-docs`);
});

process.on("exit", () => {
  sessionStore.close();
});
