import { createHash, timingSafeEqual } from "crypto";
import { db } from "../../db/client";
import type { CryptoChain, CryptoNetwork, HumanWallet } from "../../types";

export const CHAIN_VALUES = ["ethereum", "polygon", "arbitrum", "solana", "bitcoin", "tron"] as const;
export const NETWORK_VALUES = ["mainnet", "testnet"] as const;
export const PAYOUT_STATUSES = ["pending", "approved", "submitted", "confirmed", "failed", "cancelled"] as const;
export const ESCROW_STATUSES = ["held", "released", "cancelled", "expired"] as const;
export const DISPUTE_STATUSES = ["open", "under_review", "resolved", "rejected"] as const;
export const MILESTONE_SOURCE_TYPES = ["booking", "bounty"] as const;
export const MILESTONE_STATUSES = ["planned", "in_progress", "completed", "paid", "cancelled"] as const;
export const PAYOUT_WEBHOOK_SUBSCRIPTION_STATUSES = ["active", "paused", "revoked"] as const;
export const PAYOUT_WEBHOOK_DELIVERY_STATUSES = ["queued", "delivered", "failed"] as const;
export const PAYOUT_WEBHOOK_EVENT_TYPES = [
  "payout_created",
  "payout_auto_approved",
  "payout_approved",
  "payout_submitted",
  "payout_confirmed",
  "payout_failed",
  "payout_cancelled"
] as const;

export const now = () => new Date().toISOString();

export type ActorType = "user" | "agent" | "system";

export function parseJsonArray<T extends string>(value: string, fallback: T[]): T[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return fallback;
    }
    return parsed.filter((item): item is T => typeof item === "string") as T[];
  } catch {
    return fallback;
  }
}

export function normalizeTokenSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function constantTimeHashEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function isChain(value: string): value is CryptoChain {
  return CHAIN_VALUES.includes(value as CryptoChain);
}

export function isNetwork(value: string): value is CryptoNetwork {
  return NETWORK_VALUES.includes(value as CryptoNetwork);
}

export function validateWalletAddress(chain: CryptoChain, address: string): boolean {
  const candidate = address.trim();

  switch (chain) {
    case "ethereum":
    case "polygon":
    case "arbitrum":
      return /^0x[a-fA-F0-9]{40}$/.test(candidate);
    case "solana":
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(candidate);
    case "bitcoin":
      return /^(bc1|tb1|[13])[a-zA-HJ-NP-Z0-9]{20,}$/i.test(candidate);
    case "tron":
      return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(candidate);
    default:
      return false;
  }
}

export function ensureUserExists(userId: string) {
  const row = db.prepare("SELECT id FROM users WHERE id = ?").get(userId) as { id: string } | undefined;
  if (!row) {
    throw new Error("User not found");
  }
}

export function ensureHumanExists(humanId: string) {
  const row = db.prepare("SELECT id FROM humans WHERE id = ?").get(humanId) as { id: string } | undefined;
  if (!row) {
    throw new Error("Human not found");
  }
}

export function getWalletById(walletId: string): HumanWallet | null {
  const row = db
    .prepare(
      `SELECT id, human_id, label, chain, network, token_symbol, address, destination_tag, is_default,
              verification_status, created_at, updated_at
       FROM human_wallets
       WHERE id = ?`
    )
    .get(walletId) as HumanWallet | undefined;

  return row ?? null;
}
