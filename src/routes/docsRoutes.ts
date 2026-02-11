import fs from "fs";
import path from "path";
import { Router } from "express";

export const docsRouter = Router();

interface McpToolDocEntry {
  name: string;
  description: string;
}

const mcpToolGroups: Record<string, McpToolDocEntry[]> = {
  discovery_profile: [
    {
      name: "get_agent_identity",
      description: "Return MCP agent metadata and capability list.",
    },
    {
      name: "search_humans",
      description: "Search humans by skill/query/rate/availability.",
    },
    { name: "get_human", description: "Get one human profile by ID." },
    {
      name: "list_skills",
      description: "List skill dictionary for discovery.",
    },
    { name: "get_reviews", description: "List reviews for one human profile." },
  ],
  conversations: [
    {
      name: "start_conversation",
      description: "Open conversation and send first message.",
    },
    {
      name: "send_message",
      description: "Send a message in existing conversation.",
    },
    {
      name: "get_conversation",
      description: "Get conversation details + message history.",
    },
    {
      name: "list_conversations",
      description: "List user conversations with filters.",
    },
  ],
  bounties: [
    { name: "create_bounty", description: "Create a bounty task." },
    {
      name: "list_bounties",
      description: "List bounties for current user context.",
    },
    { name: "get_bounty", description: "Get one bounty by ID." },
    {
      name: "get_bounty_applications",
      description: "List applications for one bounty.",
    },
    {
      name: "accept_application",
      description: "Accept one bounty application and reject others.",
    },
    { name: "update_bounty", description: "Update bounty status and fields." },
  ],
  availability_matching: [
    {
      name: "set_human_availability_window",
      description: "Set one weekly availability window for a human profile.",
    },
    {
      name: "match_humans_for_bounty",
      description:
        "Rank humans for bounty by skill/budget/rating/availability.",
    },
  ],
  bookings: [
    {
      name: "book_human",
      description: "Create booking for selected human/time range.",
    },
    { name: "get_booking", description: "Get booking details by ID." },
    { name: "update_booking", description: "Update booking status or note." },
    {
      name: "review_completed_booking",
      description: "Create a rating and review for a completed booking (one review per booking).",
    },
  ],
  crypto_payments: [
    {
      name: "list_payment_networks",
      description: "List supported chains/networks/statuses.",
    },
    {
      name: "estimate_payout_fees",
      description: "Estimate network/platform fees and recipient net amount.",
    },
    {
      name: "create_payout_webhook_subscription",
      description: "Create payout lifecycle webhook subscription.",
    },
    {
      name: "list_payout_webhook_deliveries",
      description: "List webhook delivery logs for payout events.",
    },
    {
      name: "register_human_wallet",
      description: "Register or update human payout wallet.",
    },
    {
      name: "list_human_wallets",
      description: "List payout wallets by human ID.",
    },
    {
      name: "create_wallet_verification_challenge",
      description: "Create wallet ownership challenge for verification flow.",
    },
    {
      name: "verify_wallet_signature",
      description: "Verify challenge signature and mark wallet as verified.",
    },
    {
      name: "get_payment_policy",
      description: "Get payout policy for current user context.",
    },
    {
      name: "update_payment_policy",
      description: "Update payout policy limits and allowlists.",
    },
    {
      name: "create_escrow_hold",
      description: "Create escrow hold for booking/bounty/manual settlement.",
    },
    {
      name: "release_escrow_hold",
      description: "Release escrow and create linked payout intent.",
    },
    {
      name: "open_dispute",
      description: "Open dispute for booking/payout/escrow/bounty target.",
    },
    {
      name: "resolve_dispute",
      description: "Resolve dispute with human reviewer decision.",
    },
    {
      name: "create_crypto_payout",
      description: "Create payout intent for manual/bounty/booking source.",
    },
    {
      name: "list_crypto_payouts",
      description: "List payouts with status/source filters.",
    },
    { name: "get_crypto_payout", description: "Get one payout by ID." },
    {
      name: "approve_crypto_payout",
      description: "Approve payout in pending status.",
    },
    {
      name: "execute_crypto_payout",
      description: "Execute payout by agent (simulated tx in demo).",
    },
    {
      name: "fail_crypto_payout",
      description: "Fail payout with explicit reason.",
    },
    {
      name: "get_payout_events",
      description: "Get payout event/audit timeline.",
    },
    {
      name: "create_booking_milestone",
      description: "Create milestone for booking/bounty partial payouts.",
    },
    {
      name: "list_booking_milestones",
      description: "List milestone records and statuses.",
    },
    {
      name: "complete_booking_milestone",
      description: "Complete milestone and optionally create payout.",
    },
  ],
  mcp_tool_factory: [
    {
      name: "request_mcp_tool_creation",
      description:
        "Create MCP tool request (always requires human review before implementation/merge).",
    },
    {
      name: "list_mcp_tool_creation_requests",
      description: "List tool creation requests by status.",
    },
    {
      name: "get_mcp_tool_creation_request",
      description: "Get one tool request with optional PR draft metadata.",
    },
  ],
};

const mcpTools = Object.values(mcpToolGroups).flatMap((group) => group);

const securityNotes = [
  "Compat humans API does not expose human email.",
  "agent_auto payouts require verified destination wallet.",
  "Wallet verification uses deterministic demo challenge/signature flow.",
  "Payout webhooks are persisted as simulated deliveries (outbox model).",
  "Availability window writes are owner/admin-only in REST API.",
  "New MCP tools require explicit human review before merge.",
];

const SITE_BASE_URL = "https://skinbag.rent";
const PREVIEW_IMAGE_URL = `${SITE_BASE_URL}/os-skinbag.png`;
const SEO_KEYWORDS =
  "rent human, rent a human, rent-a-human, human rent, hire a human, MCP tools, human operator marketplace";

const PUBLIC_DOCS = {
  "mcp-tools": {
    title: "MCP Tools Reference",
    description: "MCP tools used to rent a human, coordinate tasks, and execute verified outcomes.",
    fileName: "MCP_TOOLS.md",
  },
  "rest-api": {
    title: "REST API Guide",
    description: "HTTP API for rent-a-human search, booking, payouts, auth, and security behavior.",
    fileName: "REST_API.md",
  },
} as const;

type PublicDocId = keyof typeof PUBLIC_DOCS;

function isPublicDocId(value: string): value is PublicDocId {
  return Object.prototype.hasOwnProperty.call(PUBLIC_DOCS, value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineMarkdown(source: string): string {
  let text = escapeHtml(source);
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_match, label: string, href: string) =>
      `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`,
  );
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return text;
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?[-:\s|]+\|[-:\s|]*$/.test(line.trim());
}

function splitTableCells(row: string): string[] {
  const trimmed = row.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index]?.trim() ?? "";
  if (!line) {
    return true;
  }
  if (line.startsWith("```")) {
    return true;
  }
  if (/^#{1,6}\s+/.test(line)) {
    return true;
  }
  if (/^\s*-\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
    return true;
  }
  if (
    index + 1 < lines.length &&
    line.includes("|") &&
    isTableSeparator(lines[index + 1] ?? "")
  ) {
    return true;
  }
  return false;
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i] ?? "";
    const line = rawLine.trim();

    if (!line) {
      i += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
        codeLines.push(lines[i] ?? "");
        i += 1;
      }
      if (i < lines.length) {
        i += 1;
      }
      const className = language ? ` class="lang-${escapeHtml(language)}"` : "";
      html.push(
        `<pre><code${className}>${escapeHtml(codeLines.join("\n"))}</code></pre>`,
      );
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*-\s+/.test(rawLine)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i] ?? "")) {
        const itemText = (lines[i] ?? "").replace(/^\s*-\s+/, "");
        items.push(`<li>${renderInlineMarkdown(itemText)}</li>`);
        i += 1;
      }
      html.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(rawLine)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? "")) {
        const itemText = (lines[i] ?? "").replace(/^\s*\d+\.\s+/, "");
        items.push(`<li>${renderInlineMarkdown(itemText)}</li>`);
        i += 1;
      }
      html.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1] ?? "")
    ) {
      const headerCells = splitTableCells(lines[i] ?? "").map(
        (cell) => `<th>${renderInlineMarkdown(cell)}</th>`,
      );
      const bodyRows: string[] = [];
      i += 2;
      while (i < lines.length) {
        const candidate = (lines[i] ?? "").trim();
        if (!candidate || !candidate.includes("|")) {
          break;
        }
        const rowCells = splitTableCells(lines[i] ?? "").map(
          (cell) => `<td>${renderInlineMarkdown(cell)}</td>`,
        );
        bodyRows.push(`<tr>${rowCells.join("")}</tr>`);
        i += 1;
      }
      html.push(
        `<table><thead><tr>${headerCells.join("")}</tr></thead><tbody>${bodyRows.join("")}</tbody></table>`,
      );
      continue;
    }

    const paragraphLines: string[] = [line];
    i += 1;
    while (i < lines.length) {
      const candidate = (lines[i] ?? "").trim();
      if (!candidate || isBlockStart(lines, i)) {
        break;
      }
      paragraphLines.push(candidate);
      i += 1;
    }
    html.push(`<p>${renderInlineMarkdown(paragraphLines.join(" "))}</p>`);
  }

  return html.join("\n");
}

function getDocsDirPath(): string {
  const projectRoot = path.resolve(__dirname, "..", "..");
  return path.join(projectRoot, "docs");
}

function readPublicDocMarkdown(docId: PublicDocId): string {
  const filePath = path.join(getDocsDirPath(), PUBLIC_DOCS[docId].fileName);
  return fs.readFileSync(filePath, "utf8");
}

function renderLayout(input: {
  title: string;
  body: string;
  description?: string;
  canonicalPath?: string;
  activeDoc?: PublicDocId;
}): string {
  const pageTitle = `${input.title} | skinbag.rent docs`;
  const description =
    input.description ?? "skinbag.rent documentation and API reference.";
  const canonicalUrl = `${SITE_BASE_URL}${input.canonicalPath ?? "/docs"}`;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: pageTitle,
    description,
    url: canonicalUrl,
    isPartOf: {
      "@type": "WebSite",
      name: "skinbag.rent",
      url: SITE_BASE_URL,
    },
    about: [
      { "@type": "Thing", name: "rent a human" },
      { "@type": "Thing", name: "rent human" },
      { "@type": "Thing", name: "MCP tools" },
    ],
  }).replace(/</g, "\\u003c");
  const navLinks = Object.entries(PUBLIC_DOCS)
    .map(([docId, doc]) => {
      const active = input.activeDoc === docId ? ' class="active"' : "";
      return `<a href="/docs/${docId}"${active}>${escapeHtml(doc.title)}</a>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="keywords" content="${escapeHtml(SEO_KEYWORDS)}" />
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <link rel="alternate" type="text/plain" href="${SITE_BASE_URL}/llms.txt" title="LLMs catalog" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="skinbag.rent" />
    <meta property="og:title" content="${escapeHtml(pageTitle)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:image" content="${PREVIEW_IMAGE_URL}" />
    <meta property="og:image:alt" content="skinbag.rent preview image" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${PREVIEW_IMAGE_URL}" />
    <script type="application/ld+json">${jsonLd}</script>
    <title>${escapeHtml(pageTitle)}</title>
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;500;600;700&family=VT323&display=swap");
      :root {
        --bg: #ffffff;
        --card: #e5e0d0;
        --card-alt: #d8d2c0;
        --text: #1a1a1a;
        --muted: #545049;
        --line-dark: #101010;
        --line-light: #f2ebd8;
        --blue: #5e79a8;
        --red: #b95454;
        --pink: #c786ab;
        --black: #101010;
        --accent: #5e79a8;
        --code-bg: #141416;
        --code-ink: #d7d9f2;
      }
      html[data-theme="dark"] {
        --bg: #000000;
        --card: #2f3035;
        --card-alt: #292a2f;
        --text: #ece8de;
        --muted: #beb6a6;
        --line-dark: #090909;
        --line-light: #52535a;
        --blue: #6f88ba;
        --red: #cf6a6a;
        --pink: #d496bc;
        --black: #090909;
        --accent: #6f88ba;
        --code-bg: #090a0d;
        --code-ink: #d7daf6;
      }
      @media (prefers-color-scheme: dark) {
        html:not([data-theme]) {
          --bg: #000000;
          --card: #2f3035;
          --card-alt: #292a2f;
          --text: #ece8de;
          --muted: #beb6a6;
          --line-dark: #090909;
          --line-light: #52535a;
          --blue: #6f88ba;
          --red: #cf6a6a;
          --pink: #d496bc;
          --black: #090909;
          --accent: #6f88ba;
          --code-bg: #090a0d;
          --code-ink: #d7daf6;
        }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Pixelify Sans", "Trebuchet MS", sans-serif;
        font-size: 1.02rem;
        color: var(--text);
        background: var(--bg);
      }
      .shell {
        width: min(960px, 100% - 1rem);
        margin: 0 auto;
        padding: 0.75rem 0 1.2rem;
      }
      .window {
        border: 3px solid var(--black);
        box-shadow:
          inset -3px -3px 0 var(--black),
          inset 3px 3px 0 var(--line-light),
          0 8px 0 rgba(0, 0, 0, 0.12);
        background: var(--card);
      }
      .top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.6rem;
        margin-bottom: 0.6rem;
        padding: 0.6rem;
      }
      .top a {
        color: var(--text);
        text-decoration: none;
        border: 2px solid var(--black);
        box-shadow: inset 2px 2px 0 var(--line-light);
        padding: 0.35rem 0.58rem;
        background: color-mix(in srgb, var(--card-alt) 78%, var(--blue));
        font-family: "Pixelify Sans", sans-serif;
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
      }
      .nav {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin-bottom: 0.6rem;
        padding: 0.45rem;
      }
      .nav a {
        text-decoration: none;
        color: var(--text);
        border: 2px solid var(--black);
        box-shadow: inset 2px 2px 0 var(--line-light);
        background: color-mix(in srgb, var(--card-alt) 80%, var(--blue));
        padding: 0.35rem 0.58rem;
        font-family: "Pixelify Sans", sans-serif;
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
      }
      .nav a.active {
        background: color-mix(in srgb, var(--card-alt) 62%, var(--pink));
      }
      .card {
        padding: 0.8rem;
      }
      article h1, article h2, article h3, article h4 {
        margin-top: 0.95rem;
        margin-bottom: 0.4rem;
        font-family: "Pixelify Sans", monospace;
        font-size: 0.62rem;
        line-height: 1.5;
        text-transform: uppercase;
      }
      article h1:first-child, article h2:first-child, article h3:first-child {
        margin-top: 0;
      }
      article p { line-height: 1.5; color: var(--text); }
      article ul, article ol { line-height: 1.5; }
      article code {
        background: color-mix(in srgb, var(--card-alt) 82%, var(--pink));
        border: 1px solid var(--black);
        padding: 0.12rem 0.24rem;
        font-size: 0.95em;
      }
      article pre {
        overflow: auto;
        background: var(--code-bg);
        color: var(--code-ink);
        padding: 0.6rem;
        border: 2px solid var(--line-dark);
        box-shadow: inset 2px 2px 0 rgba(255, 255, 255, 0.08);
      }
      article pre code {
        background: transparent;
        padding: 0;
        color: inherit;
        border: 0;
        font-family: "VT323", "Pixelify Sans", monospace;
      }
      article table {
        width: 100%;
        max-width: 100%;
        table-layout: fixed;
        border-collapse: collapse;
        margin: 0.6rem 0;
        font-size: 1.1rem;
      }
      article th, article td {
        border: 2px solid var(--black);
        padding: 0.3rem 0.45rem;
        text-align: left;
        vertical-align: top;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      article th {
        background: color-mix(in srgb, var(--card-alt) 80%, var(--blue));
      }
      article a {
        color: var(--accent);
      }
      .doc-grid {
        display: grid;
        gap: 0.55rem;
      }
      .doc-card {
        border: 2px solid var(--black);
        background: color-mix(in srgb, var(--card-alt) 78%, var(--pink));
        box-shadow: inset 2px 2px 0 var(--line-light);
        padding: 0.6rem;
      }
      .doc-card h2 {
        margin: 0 0 0.3rem;
      }
      .doc-card h2 a {
        color: var(--text);
        text-decoration: none;
      }
      .doc-card p {
        margin: 0;
        color: var(--muted);
      }
      @media (max-width: 900px) {
        .top {
          flex-direction: column;
          align-items: flex-start;
        }
      }
    </style>
    <style>
      @import url("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&family=Manrope:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap");
      :root {
        --bg: #ffffff;
        --panel: rgba(255, 255, 255, 0.9);
        --panel-alt: rgba(244, 244, 244, 0.94);
        --panel-muted: rgba(236, 236, 236, 0.95);
        --text: #101010;
        --muted: #505050;
        --line: #141414;
        --line-soft: rgba(0, 0, 0, 0.2);
        --accent: #181818;
        --accent-alt: #343434;
        --ascii: rgba(0, 0, 0, 0.11);
        --code-bg: #101010;
        --code-ink: #f6f6f6;
        --shadow: 0 18px 34px rgba(0, 0, 0, 0.14);
      }
      html[data-theme="dark"] {
        --bg: #000000;
        --panel: rgba(12, 12, 12, 0.9);
        --panel-alt: rgba(20, 20, 20, 0.94);
        --panel-muted: rgba(28, 28, 28, 0.95);
        --text: #f2f2f2;
        --muted: #b5b5b5;
        --line: #f2f2f2;
        --line-soft: rgba(255, 255, 255, 0.26);
        --accent: #f0f0f0;
        --accent-alt: #d4d4d4;
        --ascii: rgba(255, 255, 255, 0.14);
        --code-bg: #050505;
        --code-ink: #f0f0f0;
        --shadow: 0 20px 40px rgba(0, 0, 0, 0.52);
      }
      @media (prefers-color-scheme: dark) {
        html:not([data-theme]) {
          --bg: #000000;
          --panel: rgba(12, 12, 12, 0.9);
          --panel-alt: rgba(20, 20, 20, 0.94);
          --panel-muted: rgba(28, 28, 28, 0.95);
          --text: #f2f2f2;
          --muted: #b5b5b5;
          --line: #f2f2f2;
          --line-soft: rgba(255, 255, 255, 0.26);
          --accent: #f0f0f0;
          --accent-alt: #d4d4d4;
          --ascii: rgba(255, 255, 255, 0.14);
          --code-bg: #050505;
          --code-ink: #f0f0f0;
          --shadow: 0 20px 40px rgba(0, 0, 0, 0.52);
        }
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font-family: "Manrope", "Trebuchet MS", sans-serif;
        font-size: 1rem;
        line-height: 1.55;
      }

      .ascii-bg {
        position: fixed;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        overflow: hidden;
      }

      .ascii-layer {
        position: absolute;
        inset: 0;
        margin: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        white-space: pre;
        text-align: center;
        font-family: "JetBrains Mono", monospace;
        font-size: clamp(8px, 1.05vw, 13px);
        line-height: 1.08;
        letter-spacing: 0.01em;
        color: var(--ascii);
        opacity: 0;
        transition: opacity 1.25s ease;
      }

      .ascii-layer.active {
        opacity: 1;
      }

      .shell {
        width: min(980px, calc(100% - 24px));
        margin: 0 auto;
        padding: 0.9rem 0 1.4rem;
        position: relative;
        z-index: 1;
      }
      .window {
        border-radius: 16px;
        border: 1px solid var(--line-soft);
        background: linear-gradient(160deg, var(--panel), var(--panel-alt));
        box-shadow: var(--shadow);
      }
      .top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.7rem;
        margin-bottom: 0.7rem;
        padding: 0.7rem;
      }
      .top a {
        color: var(--text);
        text-decoration: none;
        border: 1px solid var(--line-soft);
        border-radius: 999px;
        padding: 0.42rem 0.7rem;
        background: var(--panel-alt);
        font-family: "Space Grotesk", "Manrope", sans-serif;
        font-size: 0.82rem;
        font-weight: 700;
      }
      .nav {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
        margin-bottom: 0.7rem;
        padding: 0.58rem;
      }
      .nav a {
        text-decoration: none;
        color: var(--text);
        border: 1px solid var(--line-soft);
        border-radius: 999px;
        background: var(--panel-alt);
        padding: 0.38rem 0.68rem;
        font-family: "Space Grotesk", "Manrope", sans-serif;
        font-size: 0.8rem;
        font-weight: 700;
      }
      .nav a.active {
        border-color: transparent;
        color: var(--bg);
        background: var(--accent);
      }
      .card {
        padding: 0.95rem;
      }
      article h1,
      article h2,
      article h3,
      article h4 {
        margin-top: 1.05rem;
        margin-bottom: 0.45rem;
        font-family: "Space Grotesk", "Manrope", sans-serif;
        font-weight: 700;
        line-height: 1.25;
      }
      article h1:first-child,
      article h2:first-child,
      article h3:first-child {
        margin-top: 0;
      }
      article p {
        line-height: 1.6;
        color: var(--text);
      }
      article ul,
      article ol {
        line-height: 1.6;
      }
      article code {
        background: var(--panel-muted);
        border: 1px solid var(--line-soft);
        border-radius: 6px;
        padding: 0.14rem 0.32rem;
        font-size: 0.92em;
        font-family: "JetBrains Mono", monospace;
      }
      article pre {
        overflow: auto;
        background: var(--code-bg);
        color: var(--code-ink);
        padding: 0.72rem;
        border-radius: 12px;
        border: 1px solid var(--line-soft);
      }
      article pre code {
        background: transparent;
        padding: 0;
        color: inherit;
        border: 0;
        font-family: "JetBrains Mono", monospace;
      }
      article table {
        width: 100%;
        max-width: 100%;
        table-layout: fixed;
        border-collapse: collapse;
        margin: 0.7rem 0;
        font-size: 0.95rem;
      }
      article th,
      article td {
        border: 1px solid var(--line-soft);
        padding: 0.42rem 0.5rem;
        text-align: left;
        vertical-align: top;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      article th {
        background: var(--panel-muted);
      }
      article a {
        color: var(--text);
      }
      .doc-grid {
        display: grid;
        gap: 0.62rem;
      }
      .doc-card {
        border: 1px solid var(--line-soft);
        border-radius: 12px;
        background: var(--panel-alt);
        padding: 0.72rem;
      }
      .doc-card h2 {
        margin: 0 0 0.35rem;
      }
      .doc-card h2 a {
        color: var(--text);
        text-decoration: none;
      }
      .doc-card p {
        margin: 0;
        color: var(--muted);
      }
      @media (max-width: 900px) {
        .top {
          flex-direction: column;
          align-items: flex-start;
        }
      }
    </style>
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Pixelify+Sans:wght@400;500;600;700&family=VT323&display=swap");

      :root {
        --bg: #72a9ff;
        --bg-alt: #5e8fff;
        --surface: #fff3b0;
        --surface-alt: #ffdf5a;
        --surface-muted: #ffd078;
        --ink: #050505;
        --muted: #173772;
        --line: #000000;
        --line-soft: rgba(0, 0, 0, 0.28);
        --blue: #2b5cff;
        --red: #ff3f31;
        --cyan: #26d7ff;
        --green: #2bbf66;
        --yellow: #ffdf5a;
        --code-bg: #101a3b;
        --code-ink: #eef4ff;
        --shadow: rgba(0, 0, 0, 0.32);
      }

      html[data-theme="dark"] {
        --bg: #07102a;
        --bg-alt: #0f1d4d;
        --surface: #1b2764;
        --surface-alt: #24357e;
        --surface-muted: #2d4195;
        --ink: #f4f8ff;
        --muted: #99afff;
        --line: #dbe5ff;
        --line-soft: rgba(219, 229, 255, 0.32);
        --blue: #5f8eff;
        --red: #ff7b72;
        --cyan: #5ae3ff;
        --green: #53d884;
        --yellow: #ffe784;
        --code-bg: #030915;
        --code-ink: #edf3ff;
        --shadow: rgba(0, 0, 0, 0.55);
      }

      @media (prefers-color-scheme: dark) {
        html:not([data-theme]) {
          --bg: #07102a;
          --bg-alt: #0f1d4d;
          --surface: #1b2764;
          --surface-alt: #24357e;
          --surface-muted: #2d4195;
          --ink: #f4f8ff;
          --muted: #99afff;
          --line: #dbe5ff;
          --line-soft: rgba(219, 229, 255, 0.32);
          --blue: #5f8eff;
          --red: #ff7b72;
          --cyan: #5ae3ff;
          --green: #53d884;
          --yellow: #ffe784;
          --code-bg: #030915;
          --code-ink: #edf3ff;
          --shadow: rgba(0, 0, 0, 0.55);
        }
      }

      .ascii-bg {
        display: none;
      }

      body {
        font-family: "Pixelify Sans", "VT323", monospace;
        color: var(--ink);
        background:
          repeating-linear-gradient(
            0deg,
            color-mix(in srgb, var(--bg-alt) 78%, transparent) 0 4px,
            transparent 4px 8px
          ),
          repeating-linear-gradient(
            90deg,
            color-mix(in srgb, var(--bg-alt) 84%, transparent) 0 4px,
            transparent 4px 8px
          ),
          linear-gradient(180deg, var(--bg), var(--bg-alt));
      }

      .shell {
        width: min(980px, calc(100% - 20px));
      }

      .window {
        border: 4px solid var(--line);
        border-radius: 0;
        box-shadow:
          inset -3px -3px 0 var(--line-soft),
          inset 3px 3px 0 rgba(255, 255, 255, 0.32),
          8px 8px 0 var(--shadow);
        background: linear-gradient(180deg, var(--surface), var(--surface-alt));
      }

      .top {
        padding: 11px 12px;
      }

      .top a,
      .nav a {
        border: 3px solid var(--line);
        border-radius: 0;
        box-shadow: inset -2px -2px 0 var(--line-soft);
        background: color-mix(in srgb, var(--surface) 70%, var(--cyan));
        color: var(--ink);
        font-family: "Press Start 2P", monospace;
        font-size: 0.54rem;
        text-transform: uppercase;
        line-height: 1.45;
        padding: 5px 8px;
      }

      .nav a.active {
        color: #ffffff;
        background: color-mix(in srgb, var(--surface) 58%, var(--blue));
      }

      .card {
        padding: 0.9rem;
      }

      article h1,
      article h2,
      article h3,
      article h4 {
        font-family: "Press Start 2P", monospace;
        line-height: 1.5;
        text-transform: uppercase;
        font-size: 0.64rem;
      }

      article p,
      article ul,
      article ol {
        color: var(--muted);
        font-size: 1.02rem;
      }

      article code {
        border: 2px solid var(--line);
        border-radius: 0;
        background: color-mix(in srgb, var(--surface) 74%, var(--yellow));
        font-family: "VT323", "JetBrains Mono", monospace;
        font-size: 1.02em;
      }

      article pre {
        border: 3px solid var(--line);
        border-radius: 0;
        background: var(--code-bg);
        color: var(--code-ink);
      }

      article pre code {
        border: 0;
      }

      article th,
      article td {
        border: 3px solid var(--line);
      }

      article th {
        background: color-mix(in srgb, var(--surface) 70%, var(--green));
      }

      article a {
        color: var(--ink);
        font-weight: 700;
      }

      .doc-card {
        border: 3px solid var(--line);
        border-radius: 0;
        box-shadow: inset -2px -2px 0 var(--line-soft);
        background: color-mix(in srgb, var(--surface) 70%, var(--blue));
      }

      .doc-card h2 a {
        color: var(--ink);
      }

      .doc-card p {
        color: color-mix(in srgb, var(--ink) 72%, transparent);
      }

      .api-doc-image {
        margin: 0 0 12px;
        border: 3px solid var(--line);
        background: color-mix(in srgb, var(--surface) 72%, var(--blue));
        box-shadow: inset -2px -2px 0 var(--line-soft);
        padding: 6px;
      }

      .api-doc-image img {
        display: block;
        width: 100%;
        height: auto;
      }
    </style>
  </head>
  <body>
    <div class="ascii-bg" aria-hidden="true">
      <pre class="ascii-layer active"></pre>
      <pre class="ascii-layer"></pre>
    </div>

    <div class="shell">
      <div class="window top">
        <a href="/">skinbag.rent</a>
        <a href="/api-docs?raw=1">API JSON (/api-docs?raw=1)</a>
      </div>
      <nav class="window nav">${navLinks}</nav>
      <section class="window card">
        ${input.body}
      </section>
    </div>
    <script>
      const asciiLayers = Array.from(document.querySelectorAll(".ascii-layer"));
      const asciiFrames = [
        [
          "  ________________________________________________  ",
          " /                                                \\ ",
          "|  [SEARCH]   [BOOK]   [MESSAGE]   [PAYOUT]      |",
          "|                                                  |",
          "|  > agent request accepted                        |",
          "|  > human operator connected                      |",
          "|  > verification pending                          |",
          " \\________________________________________________/ "
        ].join("\\n"),
        [
          "   ______________________________________________   ",
          "  /                                              \\  ",
          " |  /\\\\   /\\\\   /\\\\   /\\\\   /\\\\   /\\\\   /\\\\   /\\\\         | ",
          " | /  \\\\ /  \\\\ /  \\\\ /  \\\\ /  \\\\ /  \\\\ /  \\\\ /  \\\\        | ",
          " |/____V____V____V____V____V____V____V____\\\\       | ",
          " | queue depth stable | dispatch window open       | ",
          "  \\\\______________________________________________/  "
        ].join("\\n"),
        [
          "  ________________________________________________  ",
          " /                                                \\ ",
          "|  +------+   +------+   +------+   +------+      |",
          "|  | MCP  |-->| TASK |-->| CHAT |-->| DONE |      |",
          "|  +------+   +------+   +------+   +------+      |",
          "|                                                  |",
          "|  wallet signatures: ##########                  |",
          " \\________________________________________________/ "
        ].join("\\n"),
        [
          "  ________________________________________________  ",
          " /                                                \\ ",
          "|  local ops map                                   |",
          "|      o----o----o----o----o                      |",
          "|       \\\\  / \\\\  / \\\\  / \\\\  /                       |",
          "|        oo   oo   oo   oo                        |",
          "|  active humans: [#######.....]                  |",
          " \\________________________________________________/ "
        ].join("\\n")
      ];
      const ASCII_INTERVAL_MS = 5200;
      let asciiFrameIndex = 0;
      let asciiLayerIndex = 0;
      let asciiTimer = null;

      function stopAsciiBackground() {
        if (asciiTimer) {
          clearInterval(asciiTimer);
          asciiTimer = null;
        }
      }

      function swapAsciiFrame(nextFrameText) {
        if (asciiLayers.length < 2) {
          return;
        }
        const nextLayerIndex = asciiLayerIndex === 0 ? 1 : 0;
        const currentLayer = asciiLayers[asciiLayerIndex];
        const nextLayer = asciiLayers[nextLayerIndex];
        nextLayer.textContent = nextFrameText;
        nextLayer.classList.add("active");
        currentLayer.classList.remove("active");
        asciiLayerIndex = nextLayerIndex;
      }

      function initAsciiBackground() {
        if (!asciiLayers.length || !asciiFrames.length) {
          return;
        }
        asciiLayers[0].textContent = asciiFrames[0];
        asciiLayers[0].classList.add("active");
        if (asciiLayers[1]) {
          asciiLayers[1].textContent = asciiFrames[1 % asciiFrames.length];
        }
        stopAsciiBackground();
        asciiTimer = setInterval(() => {
          asciiFrameIndex = (asciiFrameIndex + 1) % asciiFrames.length;
          swapAsciiFrame(asciiFrames[asciiFrameIndex]);
        }, ASCII_INTERVAL_MS);
      }

      initAsciiBackground();
      window.addEventListener("beforeunload", stopAsciiBackground);
    </script>
  </body>
</html>`;
}

function renderDocsIndexPage(): string {
  const cards = Object.entries(PUBLIC_DOCS)
    .map(
      ([
        docId,
        doc
      ]) => `<article class="doc-card">
  <h2><a href="/docs/${docId}">${escapeHtml(doc.title)}</a></h2>
  <p>${escapeHtml(doc.description)}</p>
</article>`,
    )
    .join("");

  return renderLayout({
    title: "Public Docs",
    description: "Public docs for rent human workflows: MCP tools, REST API, booking, payouts, and operations.",
    canonicalPath: "/docs",
    body: `<h1>Public Documentation</h1>
<p>These documents are public and describe how to rent a human through MCP tools and API endpoints.</p>
<div class="doc-grid">${cards}</div>`,
  });
}

docsRouter.get("/docs", (_req, res) => {
  res.type("html").send(renderDocsIndexPage());
});

docsRouter.get("/docs/:docId", (req, res) => {
  const docId = req.params.docId;
  if (!isPublicDocId(docId)) {
    return res
      .status(404)
      .type("html")
      .send(
        renderLayout({
          title: "Not Found",
          description: "Requested documentation page was not found.",
          canonicalPath: "/docs",
          body: "<h1>Document not found</h1>",
        }),
      );
  }

  try {
    const markdown = readPublicDocMarkdown(docId);
    const htmlBody = markdownToHtml(markdown);
    return res
      .type("html")
      .send(
        renderLayout({
          title: PUBLIC_DOCS[docId].title,
          description: PUBLIC_DOCS[docId].description,
          canonicalPath: `/docs/${docId}`,
          body: `<article>${htmlBody}</article>`,
          activeDoc: docId,
        }),
      );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return res
      .status(500)
      .type("html")
      .send(
        renderLayout({
          title: "Docs Error",
          description: "Documentation rendering error.",
          canonicalPath: `/docs/${docId}`,
          body: `<h1>Failed to load document</h1><p>${escapeHtml(message)}</p>`,
        }),
      );
  }
});

docsRouter.get("/api-docs", (_req, res) => {
  const payload = {
    name: "Skinbag.rent MCP Service",
    version: "0.1.0",
    mcp_tools: mcpTools,
    mcp_tool_groups: mcpToolGroups,
    mcp_tool_docs: {
      public_usage_pages: ["/docs/mcp-tools", "/docs/rest-api"],
      machine_readable_catalog: "/api-docs",
      hosted_mcp_endpoint: "/mcp",
    },
    security_notes: securityNotes,
    rest_endpoints: {
      compat: [
        "GET /api/humans [x-api-key | Bearer key]",
        "GET /api/humans/:id [x-api-key | Bearer key]",
        "POST /api/humans [x-api-key | Bearer key]",
        "GET /api/bookings [x-api-key | Bearer key]",
        "POST /api/bookings [x-api-key | Bearer key]",
        "GET /api/bookings/:id [x-api-key | Bearer key]",
        "PATCH /api/bookings/:id [x-api-key | Bearer key]",
      ],
      auth: [
        "POST /api/auth/firebase",
        "GET /auth/google",
        "GET /auth/google/callback",
        "GET /api/auth/csrf",
        "GET /api/auth/me",
        "POST /api/auth/logout",
        "GET /api/auth/api-keys [admin]",
        "POST /api/auth/api-keys [admin]",
        "POST /api/auth/api-keys/:keyId/revoke [admin]",
      ],
      public: ["GET /verify-email?token=..."],
      humans: [
        "GET /api/skills",
        "GET /api/humans",
        "GET /api/humans/:humanId",
        "GET /api/humans/:humanId/reviews",
        "GET /api/humans/:humanId/availability-windows",
        "POST /api/humans/:humanId/availability-windows",
      ],
      conversations: [
        "POST /api/conversations",
        "POST /api/conversations/:conversationId/messages",
        "GET /api/conversations",
        "GET /api/conversations/:conversationId",
      ],
      bounties: [
        "POST /api/bounties",
        "GET /api/bounties",
        "GET /api/bounties/:bountyId",
        "PATCH /api/bounties/:bountyId",
        "GET /api/bounties/:bountyId/applications",
        "POST /api/bounties/:bountyId/applications",
        "POST /api/bounties/:bountyId/applications/:applicationId/accept",
        "GET /api/bounties/:bountyId/matches",
      ],
      bookings: [
        "POST /api/bookings",
        "GET /api/bookings/:bookingId",
        "PATCH /api/bookings/:bookingId",
      ],
      payments: [
        "GET /api/payments/networks",
        "POST /api/payouts/estimate-fees",
        "POST /api/payout-webhooks/subscriptions",
        "GET /api/payout-webhooks/subscriptions",
        "GET /api/payout-webhooks/deliveries",
        "GET /api/payment-policy",
        "PATCH /api/payment-policy",
        "GET /api/humans/:humanId/wallets",
        "POST /api/humans/:humanId/wallets",
        "POST /api/humans/:humanId/wallet-verification-challenges",
        "GET /api/humans/:humanId/wallet-verification-challenges",
        "POST /api/wallet-verification/verify",
        "POST /api/escrows",
        "GET /api/escrows",
        "GET /api/escrows/:escrowId",
        "GET /api/escrows/:escrowId/events",
        "POST /api/escrows/:escrowId/release",
        "POST /api/disputes",
        "GET /api/disputes",
        "GET /api/disputes/:disputeId",
        "GET /api/disputes/:disputeId/events",
        "POST /api/disputes/:disputeId/resolve [admin]",
        "POST /api/milestones",
        "GET /api/milestones",
        "POST /api/milestones/:milestoneId/complete",
        "POST /api/payouts",
        "GET /api/payouts",
        "GET /api/payouts/:payoutId",
        "GET /api/payouts/:payoutId/events",
        "POST /api/payouts/:payoutId/approve",
        "POST /api/payouts/:payoutId/execute",
        "POST /api/payouts/:payoutId/fail",
      ],
      profile: [
        "GET /api/profile/me",
        "GET /api/profile/notifications",
        "PATCH /api/profile/me",
        "POST /api/profile/skills",
        "DELETE /api/profile/skills/:skillSlug",
        "POST /api/profile/email/resend",
        "POST /api/profile/email/verify",
      ],
      mcp_tool_requests: [
        "POST /api/mcp-tools/requests",
        "GET /api/mcp-tools/requests",
        "GET /api/mcp-tools/requests/:requestId",
        "POST /api/mcp-tools/requests/:requestId/review",
        "POST /api/mcp-tools/requests/:requestId/implemented",
      ],
    },
  };

  const req = _req;
  const wantsHtml =
    req.query.format !== "json" &&
    req.query.raw !== "1" &&
    req.accepts(["json", "html"]) === "html";

  if (wantsHtml) {
    const jsonPretty = escapeHtml(JSON.stringify(payload, null, 2));
    return res.type("html").send(
      renderLayout({
        title: "API Docs",
        description: "Machine-readable and human-readable API docs for rent-a-human and MCP integration.",
        canonicalPath: "/api-docs",
        body: `<h1>API Docs</h1>
<figure class="api-doc-image">
  <img src="/images/skinbagrent.png" alt="skinbag.rent API documentation cover" loading="lazy" />
</figure>
<p>This is the human-readable view. For machine JSON use: <a href="/api-docs?raw=1"><code>/api-docs?raw=1</code></a>.</p>
<pre><code class="lang-json">${jsonPretty}</code></pre>`,
      }),
    );
  }

  const pretty = req.query.pretty === "1";
  const json = JSON.stringify(payload, null, pretty ? 2 : 0);
  return res.type("application/json").send(pretty ? `${json}\n` : json);
});
