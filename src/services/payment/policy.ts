import { db } from "../../db/client";
import type {
  CryptoChain,
  CryptoNetwork,
  PaymentPolicy,
  PayoutExecutionMode,
  PayoutFeeEstimate
} from "../../types";
import {
  CHAIN_VALUES,
  NETWORK_VALUES,
  PAYOUT_STATUSES,
  PAYOUT_WEBHOOK_EVENT_TYPES,
  ensureUserExists,
  isChain,
  normalizeTokenSymbol,
  now,
  parseJsonArray
} from "./common";

interface PaymentPolicyRow {
  user_id: string;
  autopay_enabled: number;
  require_approval: number;
  max_single_payout_cents: number;
  max_daily_payout_cents: number;
  allowed_chains_json: string;
  allowed_tokens_json: string;
  created_at: string;
  updated_at: string;
}

const CHAIN_FEE_RULES: Record<
  CryptoChain,
  { baseMainnetCents: number; baseTestnetCents: number; networkBps: number }
> = {
  ethereum: { baseMainnetCents: 180, baseTestnetCents: 15, networkBps: 20 },
  polygon: { baseMainnetCents: 25, baseTestnetCents: 5, networkBps: 5 },
  arbitrum: { baseMainnetCents: 60, baseTestnetCents: 8, networkBps: 8 },
  solana: { baseMainnetCents: 8, baseTestnetCents: 2, networkBps: 2 },
  bitcoin: { baseMainnetCents: 220, baseTestnetCents: 30, networkBps: 15 },
  tron: { baseMainnetCents: 40, baseTestnetCents: 6, networkBps: 6 }
};

function mapPolicy(row: PaymentPolicyRow): PaymentPolicy {
  return {
    user_id: row.user_id,
    autopay_enabled: row.autopay_enabled,
    require_approval: row.require_approval,
    max_single_payout_cents: row.max_single_payout_cents,
    max_daily_payout_cents: row.max_daily_payout_cents,
    allowed_chains: parseJsonArray<CryptoChain>(row.allowed_chains_json, ["polygon"]),
    allowed_tokens: parseJsonArray<string>(row.allowed_tokens_json, ["USDC"]),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function parsePolicyRow(row: PaymentPolicyRow | undefined, userId: string): PaymentPolicy {
  if (!row) {
    const ts = now();
    db.prepare(
      `INSERT INTO payment_policies (
        user_id, autopay_enabled, require_approval, max_single_payout_cents, max_daily_payout_cents,
        allowed_chains_json, allowed_tokens_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(userId, 0, 1, 100000, 300000, JSON.stringify(["polygon"]), JSON.stringify(["USDC"]), ts, ts);

    const inserted = db.prepare("SELECT * FROM payment_policies WHERE user_id = ?").get(userId) as PaymentPolicyRow;
    return mapPolicy(inserted);
  }

  return mapPolicy(row);
}

function getTodayAllocatedAmount(userId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total
       FROM crypto_payouts
       WHERE user_id = ?
         AND status IN ('approved', 'submitted', 'confirmed', 'pending')
         AND date(created_at) = CURRENT_DATE`
    )
    .get(userId) as { total: number };

  return row.total;
}

export function assertPolicyAllowsAutoPayout(input: {
  policy: PaymentPolicy;
  userId: string;
  amountCents: number;
  chain: CryptoChain;
  tokenSymbol: string;
}) {
  if (!input.policy.autopay_enabled) {
    throw new Error("Auto payout is disabled in payment policy");
  }

  if (input.amountCents > input.policy.max_single_payout_cents) {
    throw new Error("Payout exceeds max single payout limit");
  }

  if (!input.policy.allowed_chains.includes(input.chain)) {
    throw new Error(`Chain ${input.chain} is not allowed by payment policy`);
  }

  if (!input.policy.allowed_tokens.includes(input.tokenSymbol.toUpperCase())) {
    throw new Error(`Token ${input.tokenSymbol.toUpperCase()} is not allowed by payment policy`);
  }

  const currentDaily = getTodayAllocatedAmount(input.userId);
  if (currentDaily + input.amountCents > input.policy.max_daily_payout_cents) {
    throw new Error("Daily payout limit exceeded");
  }
}

export function listSupportedPaymentNetworks() {
  return {
    chains: [...CHAIN_VALUES],
    networks: [...NETWORK_VALUES],
    payout_statuses: [...PAYOUT_STATUSES],
    payout_webhook_event_types: [...PAYOUT_WEBHOOK_EVENT_TYPES]
  };
}

export function estimatePayoutFees(input: {
  chain: CryptoChain;
  network: CryptoNetwork;
  tokenSymbol: string;
  amountCents: number;
  executionMode?: PayoutExecutionMode;
}): PayoutFeeEstimate {
  if (input.amountCents <= 0) {
    throw new Error("amountCents must be positive");
  }

  const feeRule = CHAIN_FEE_RULES[input.chain];
  const tokenSymbol = normalizeTokenSymbol(input.tokenSymbol);
  const executionMode = input.executionMode ?? "manual";
  const networkBase = input.network === "mainnet" ? feeRule.baseMainnetCents : feeRule.baseTestnetCents;
  const networkVariable = Math.ceil((input.amountCents * feeRule.networkBps) / 10_000);
  const estimatedNetworkFeeCents = networkBase + networkVariable;

  const platformBps = executionMode === "agent_auto" ? 100 : 75;
  const estimatedPlatformFeeCents = Math.max(25, Math.ceil((input.amountCents * platformBps) / 10_000));
  const estimatedTotalDebitCents = input.amountCents + estimatedNetworkFeeCents + estimatedPlatformFeeCents;
  const estimatedRecipientNetCents = Math.max(input.amountCents - estimatedNetworkFeeCents - estimatedPlatformFeeCents, 0);

  return {
    chain: input.chain,
    network: input.network,
    token_symbol: tokenSymbol,
    amount_cents: input.amountCents,
    execution_mode: executionMode,
    estimated_network_fee_cents: estimatedNetworkFeeCents,
    estimated_platform_fee_cents: estimatedPlatformFeeCents,
    estimated_total_debit_cents: estimatedTotalDebitCents,
    estimated_recipient_net_cents: estimatedRecipientNetCents
  };
}

export function getPaymentPolicy(userId: string): PaymentPolicy {
  ensureUserExists(userId);

  const row = db
    .prepare("SELECT * FROM payment_policies WHERE user_id = ?")
    .get(userId) as PaymentPolicyRow | undefined;

  return parsePolicyRow(row, userId);
}

export function updatePaymentPolicy(input: {
  userId: string;
  autopayEnabled?: boolean;
  requireApproval?: boolean;
  maxSinglePayoutCents?: number;
  maxDailyPayoutCents?: number;
  allowedChains?: string[];
  allowedTokens?: string[];
}): PaymentPolicy {
  const policy = getPaymentPolicy(input.userId);

  const patch: string[] = [];
  const values: Array<string | number> = [];

  if (typeof input.autopayEnabled === "boolean") {
    patch.push("autopay_enabled = ?");
    values.push(input.autopayEnabled ? 1 : 0);
  }

  if (typeof input.requireApproval === "boolean") {
    patch.push("require_approval = ?");
    values.push(input.requireApproval ? 1 : 0);
  }

  if (typeof input.maxSinglePayoutCents === "number") {
    if (input.maxSinglePayoutCents <= 0) {
      throw new Error("maxSinglePayoutCents must be positive");
    }
    patch.push("max_single_payout_cents = ?");
    values.push(input.maxSinglePayoutCents);
  }

  if (typeof input.maxDailyPayoutCents === "number") {
    if (input.maxDailyPayoutCents <= 0) {
      throw new Error("maxDailyPayoutCents must be positive");
    }
    patch.push("max_daily_payout_cents = ?");
    values.push(input.maxDailyPayoutCents);
  }

  if (Array.isArray(input.allowedChains)) {
    const normalized = input.allowedChains.map((chain) => chain.trim().toLowerCase()).filter(Boolean);
    const uniqueChains = [...new Set(normalized)];
    if (!uniqueChains.length || uniqueChains.some((chain) => !isChain(chain))) {
      throw new Error(`allowedChains must be non-empty and subset of: ${CHAIN_VALUES.join(", ")}`);
    }
    patch.push("allowed_chains_json = ?");
    values.push(JSON.stringify(uniqueChains));
  }

  if (Array.isArray(input.allowedTokens)) {
    const normalized = input.allowedTokens.map((token) => normalizeTokenSymbol(token)).filter(Boolean);
    const uniqueTokens = [...new Set(normalized)];
    if (!uniqueTokens.length) {
      throw new Error("allowedTokens must be non-empty");
    }
    patch.push("allowed_tokens_json = ?");
    values.push(JSON.stringify(uniqueTokens));
  }

  if (!patch.length) {
    return policy;
  }

  patch.push("updated_at = ?");
  values.push(now());

  db.prepare(`UPDATE payment_policies SET ${patch.join(", ")} WHERE user_id = ?`).run(...values, input.userId);

  return getPaymentPolicy(input.userId);
}
