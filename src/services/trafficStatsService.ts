import { db } from "../db/client";

const METRIC_VISITS = "visits";
const METRIC_API_REQUESTS = "api_requests";
const METRIC_HUMAN_VISITS = "human_visits";
const METRIC_AGENT_SCRAPE_VISITS = "agent_scrape_visits";
const METRIC_MCP_REQUESTS = "mcp_requests";

interface MetricRow {
  metric_key?: string;
  metric_value?: number | string;
}

export interface TrafficStats {
  visits: number;
  apiRequests: number;
  humanVisits: number;
  agentScrapeVisits: number;
  mcpRequests: number;
}

const incrementMetricStatement = db.prepare(`
  INSERT INTO site_metrics (metric_key, metric_value, updated_at)
  VALUES (?, 1, ?)
  ON CONFLICT(metric_key)
  DO UPDATE SET
    metric_value = site_metrics.metric_value + 1,
    updated_at = excluded.updated_at
`);

const selectMetricsStatement = db.prepare(`
  SELECT metric_key, metric_value
  FROM site_metrics
  WHERE metric_key IN (?, ?, ?, ?, ?)
`);

function toCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.floor(parsed));
}

function incrementMetric(metricKey: string) {
  incrementMetricStatement.run(metricKey, new Date().toISOString());
}

export function recordVisit() {
  incrementMetric(METRIC_VISITS);
}

export function recordApiRequest() {
  incrementMetric(METRIC_API_REQUESTS);
}

export function recordHumanVisit() {
  incrementMetric(METRIC_HUMAN_VISITS);
}

export function recordAgentScrapeVisit() {
  incrementMetric(METRIC_AGENT_SCRAPE_VISITS);
}

export function recordMcpRequest() {
  incrementMetric(METRIC_MCP_REQUESTS);
}

export function getTrafficStats(): TrafficStats {
  const rows = selectMetricsStatement.all(
    METRIC_VISITS,
    METRIC_API_REQUESTS,
    METRIC_HUMAN_VISITS,
    METRIC_AGENT_SCRAPE_VISITS,
    METRIC_MCP_REQUESTS
  ) as MetricRow[];
  const values = new Map<string, number>();

  rows.forEach((row) => {
    const key = row.metric_key?.trim();
    if (!key) {
      return;
    }
    values.set(key, toCount(row.metric_value));
  });

  return {
    visits: values.get(METRIC_VISITS) ?? 0,
    apiRequests: values.get(METRIC_API_REQUESTS) ?? 0,
    humanVisits: values.get(METRIC_HUMAN_VISITS) ?? 0,
    agentScrapeVisits: values.get(METRIC_AGENT_SCRAPE_VISITS) ?? 0,
    mcpRequests: values.get(METRIC_MCP_REQUESTS) ?? 0
  };
}
