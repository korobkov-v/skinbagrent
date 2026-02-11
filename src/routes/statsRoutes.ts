import { Router } from "express";
import { config } from "../config";
import { getMarketplaceStats } from "../services/statsService";

export const statsRouter = Router();

const MIN_AGENTS = 3;
const MIN_HUMANS = 43;

statsRouter.get("/stats", (_req, res) => {
  const stats = getMarketplaceStats();
  const agentsDisplay = Math.max(stats.agents, MIN_AGENTS);
  const humansDisplay = Math.max(stats.humans, MIN_HUMANS);

  return res.json({
    agents: {
      count: stats.agents,
      display: agentsDisplay,
      minimum: MIN_AGENTS
    },
    humans: {
      count: stats.humans,
      display: humansDisplay,
      minimum: MIN_HUMANS
    },
    visits: {
      count: stats.visits,
      display: stats.visits
    },
    apiRequests: {
      count: stats.apiRequests,
      display: stats.apiRequests
    },
    humanVisits: {
      count: stats.humanVisits,
      display: stats.humanVisits
    },
    agentScrapeVisits: {
      count: stats.agentScrapeVisits,
      display: stats.agentScrapeVisits
    },
    mcpRequests: {
      count: stats.mcpRequests,
      display: stats.mcpRequests
    }
  });
});

statsRouter.get("/public-config", (_req, res) => {
  const firebaseConfig = {
    apiKey: config.FIREBASE_WEB_API_KEY?.trim() || "",
    authDomain: config.FIREBASE_WEB_AUTH_DOMAIN?.trim() || "",
    projectId: config.FIREBASE_WEB_PROJECT_ID?.trim() || "",
    storageBucket: config.FIREBASE_WEB_STORAGE_BUCKET?.trim() || "",
    messagingSenderId: config.FIREBASE_WEB_MESSAGING_SENDER_ID?.trim() || "",
    appId: config.FIREBASE_WEB_APP_ID?.trim() || "",
    measurementId: config.FIREBASE_WEB_MEASUREMENT_ID?.trim() || ""
  };
  const hasFirebaseConfig = Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.storageBucket &&
      firebaseConfig.messagingSenderId &&
      firebaseConfig.appId
  );

  return res.json({
    gaMeasurementId: config.GA_MEASUREMENT_ID?.trim() || null,
    googleClientId: config.GOOGLE_CLIENT_ID?.trim() || null,
    firebaseConfig: hasFirebaseConfig ? firebaseConfig : null
  });
});
