import { db } from "../db/client";
import { getTrafficStats } from "./trafficStatsService";

export interface MarketplaceStats {
  agents: number;
  humans: number;
  visits: number;
  apiRequests: number;
  humanVisits: number;
  agentScrapeVisits: number;
  mcpRequests: number;
}

function toCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getMarketplaceStats(): MarketplaceStats {
  const agentRow = db
    .prepare("SELECT COUNT(DISTINCT agent_id) AS count FROM api_keys WHERE status = 'active'")
    .get() as { count?: number | string } | undefined;
  const humanRow = db.prepare("SELECT COUNT(*) AS count FROM humans").get() as
    | { count?: number | string }
    | undefined;
  const traffic = getTrafficStats();

  return {
    agents: toCount(agentRow?.count),
    humans: toCount(humanRow?.count),
    visits: traffic.visits,
    apiRequests: traffic.apiRequests,
    humanVisits: traffic.humanVisits,
    agentScrapeVisits: traffic.agentScrapeVisits,
    mcpRequests: traffic.mcpRequests
  };
}
