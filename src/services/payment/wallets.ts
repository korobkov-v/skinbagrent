import { randomUUID } from "crypto";
import { db } from "../../db/client";
import type { CryptoChain, CryptoNetwork, HumanWallet, WalletVerificationChallenge } from "../../types";
import {
  constantTimeHashEquals,
  ensureHumanExists,
  getWalletById,
  isChain,
  isNetwork,
  normalizeTokenSymbol,
  now,
  sha256Hex,
  validateWalletAddress
} from "./common";

export { getWalletById } from "./common";

function buildWalletChallengeMessage(address: string, challenge: string, expiresAt: string): string {
  return [
    "skinbag.rent wallet verification",
    `address:${address}`,
    `challenge:${challenge}`,
    `expires_at:${expiresAt}`,
    "proof_method:demo_deterministic"
  ].join("\n");
}

function buildWalletChallengeExpectedSignature(address: string, challenge: string): string {
  return `demo_sig_${sha256Hex(`${address.toLowerCase()}|${challenge}`)}`;
}

export function getHumanOwnerUserId(humanId: string): string | null {
  const row = db.prepare("SELECT user_id FROM humans WHERE id = ?").get(humanId) as
    | { user_id: string | null }
    | undefined;
  if (!row) {
    throw new Error("Human not found");
  }
  return row.user_id;
}

export function findWalletForPayout(input: {
  humanId: string;
  chain: CryptoChain;
  network: CryptoNetwork;
  tokenSymbol: string;
  walletId?: string;
}): HumanWallet {
  if (input.walletId) {
    const wallet = getWalletById(input.walletId);
    if (!wallet || wallet.human_id !== input.humanId) {
      throw new Error("Wallet not found for selected human");
    }
    if (wallet.chain !== input.chain || wallet.network !== input.network) {
      throw new Error("Wallet chain/network mismatch with payout");
    }
    if (wallet.token_symbol.toUpperCase() !== input.tokenSymbol.toUpperCase()) {
      throw new Error("Wallet token mismatch with payout");
    }
    return wallet;
  }

  const wallet = db
    .prepare(
      `SELECT id, human_id, label, chain, network, token_symbol, address, destination_tag, is_default,
              verification_status, created_at, updated_at
       FROM human_wallets
       WHERE human_id = ? AND chain = ? AND network = ? AND upper(token_symbol) = ?
       ORDER BY is_default DESC, updated_at DESC
       LIMIT 1`
    )
    .get(input.humanId, input.chain, input.network, input.tokenSymbol.toUpperCase()) as HumanWallet | undefined;

  if (!wallet) {
    throw new Error("No wallet configured for this human on selected chain/network/token");
  }

  return wallet;
}

export function assertWalletVerifiedForAgentAuto(wallet: HumanWallet) {
  if (wallet.verification_status !== "verified") {
    throw new Error("Wallet must be verified for agent_auto payouts");
  }
}

export function listHumanWallets(humanId: string): HumanWallet[] {
  ensureHumanExists(humanId);
  return db
    .prepare(
      `SELECT id, human_id, label, chain, network, token_symbol, address, destination_tag, is_default,
              verification_status, created_at, updated_at
       FROM human_wallets
       WHERE human_id = ?
       ORDER BY is_default DESC, updated_at DESC`
    )
    .all(humanId) as HumanWallet[];
}

export function upsertHumanWallet(input: {
  humanId: string;
  label?: string;
  chain: string;
  network: string;
  tokenSymbol: string;
  address: string;
  destinationTag?: string | null;
  isDefault?: boolean;
  verificationStatus?: "unverified" | "verified" | "rejected";
}): HumanWallet {
  ensureHumanExists(input.humanId);

  if (!isChain(input.chain)) {
    throw new Error("Unsupported chain");
  }

  if (!isNetwork(input.network)) {
    throw new Error("Unsupported network");
  }

  if (!validateWalletAddress(input.chain, input.address)) {
    throw new Error(`Invalid wallet address format for ${input.chain}`);
  }

  const normalizedAddress = input.address.trim();
  const tokenSymbol = normalizeTokenSymbol(input.tokenSymbol);
  const ts = now();

  const existing = db
    .prepare(
      `SELECT id FROM human_wallets
       WHERE human_id = ? AND chain = ? AND network = ? AND upper(token_symbol) = ? AND address = ?`
    )
    .get(input.humanId, input.chain, input.network, tokenSymbol, normalizedAddress) as { id: string } | undefined;

  const shouldDefault = Boolean(input.isDefault);
  const tx = db.transaction(() => {
    if (shouldDefault) {
      db.prepare(
        `UPDATE human_wallets
         SET is_default = 0, updated_at = ?
         WHERE human_id = ? AND chain = ? AND network = ? AND upper(token_symbol) = ?`
      ).run(ts, input.humanId, input.chain, input.network, tokenSymbol);
    }

    if (existing) {
      db.prepare(
        `UPDATE human_wallets
         SET label = ?, destination_tag = ?, verification_status = ?, is_default = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        input.label ?? null,
        input.destinationTag ?? null,
        input.verificationStatus ?? "unverified",
        shouldDefault ? 1 : 0,
        ts,
        existing.id
      );
      return existing.id;
    }

    const id = randomUUID();
    db.prepare(
      `INSERT INTO human_wallets (
        id, human_id, label, chain, network, token_symbol, address, destination_tag, is_default,
        verification_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.humanId,
      input.label ?? null,
      input.chain,
      input.network,
      tokenSymbol,
      normalizedAddress,
      input.destinationTag ?? null,
      shouldDefault ? 1 : 0,
      input.verificationStatus ?? "unverified",
      ts,
      ts
    );
    return id;
  });

  const walletId = tx();

  const hasDefault = db
    .prepare(
      `SELECT id FROM human_wallets
       WHERE human_id = ? AND chain = ? AND network = ? AND upper(token_symbol) = ? AND is_default = 1
       LIMIT 1`
    )
    .get(input.humanId, input.chain, input.network, tokenSymbol) as { id: string } | undefined;

  if (!hasDefault) {
    db.prepare("UPDATE human_wallets SET is_default = 1, updated_at = ? WHERE id = ?").run(ts, walletId);
  }

  const wallet = getWalletById(walletId);
  if (!wallet) {
    throw new Error("Failed to save wallet");
  }
  return wallet;
}

export function createWalletVerificationChallenge(input: {
  humanId: string;
  walletId?: string;
  chain?: CryptoChain;
  network?: CryptoNetwork;
  tokenSymbol?: string;
  address?: string;
  expiresInMinutes?: number;
}): WalletVerificationChallenge & {
  wallet: Pick<HumanWallet, "id" | "human_id" | "chain" | "network" | "token_symbol" | "address" | "verification_status">;
  signatureFormat: string;
} {
  ensureHumanExists(input.humanId);

  let wallet: HumanWallet | null = null;
  if (input.walletId) {
    const candidate = getWalletById(input.walletId);
    if (!candidate || candidate.human_id !== input.humanId) {
      throw new Error("Wallet not found for this human");
    }
    wallet = candidate;
  } else {
    const where = ["human_id = ?"];
    const params: Array<string | number> = [input.humanId];

    if (input.chain) {
      where.push("chain = ?");
      params.push(input.chain);
    }
    if (input.network) {
      where.push("network = ?");
      params.push(input.network);
    }
    if (input.tokenSymbol) {
      where.push("upper(token_symbol) = ?");
      params.push(input.tokenSymbol.toUpperCase());
    }
    if (input.address) {
      where.push("lower(address) = ?");
      params.push(input.address.toLowerCase());
    }

    const selectedWallet = db
      .prepare(
        `SELECT id, human_id, label, chain, network, token_symbol, address, destination_tag, is_default,
                verification_status, created_at, updated_at
         FROM human_wallets
         WHERE ${where.join(" AND ")}
         ORDER BY is_default DESC, updated_at DESC
         LIMIT 1`
      )
      .get(...params) as HumanWallet | undefined | null;
    wallet = selectedWallet ?? null;
  }

  if (!wallet) {
    throw new Error("Wallet not found for verification challenge");
  }

  const minutes = Math.min(Math.max(input.expiresInMinutes ?? 15, 1), 24 * 60);
  const challenge = randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString();
  const message = buildWalletChallengeMessage(wallet.address, challenge, expiresAt);
  const expectedSignature = buildWalletChallengeExpectedSignature(wallet.address, challenge);
  const expectedSignatureHash = sha256Hex(expectedSignature);
  const id = randomUUID();
  const ts = now();

  db.prepare(
    `INSERT INTO wallet_verification_challenges (
      id, wallet_id, human_id, challenge, message, proof_method, expected_signature_hash,
      provided_signature, status, expires_at, verified_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    wallet.id,
    wallet.human_id,
    challenge,
    message,
    "demo_deterministic",
    expectedSignatureHash,
    null,
    "pending",
    expiresAt,
    null,
    ts,
    ts
  );

  const created = db.prepare("SELECT * FROM wallet_verification_challenges WHERE id = ?").get(id) as
    | WalletVerificationChallenge
    | undefined;
  if (!created) {
    throw new Error("Failed to create wallet verification challenge");
  }

  return {
    ...created,
    wallet: {
      id: wallet.id,
      human_id: wallet.human_id,
      chain: wallet.chain,
      network: wallet.network,
      token_symbol: wallet.token_symbol,
      address: wallet.address,
      verification_status: wallet.verification_status
    },
    signatureFormat: "demo_sig_<sha256(lowercase_address + '|' + challenge)>"
  };
}

export function verifyWalletSignature(input: {
  challengeId: string;
  signature: string;
  expectedHumanId?: string;
}): {
  verified: boolean;
  challenge: WalletVerificationChallenge;
  wallet: HumanWallet;
} {
  const challenge = db
    .prepare(
      `SELECT
         id, wallet_id, human_id, challenge, message, proof_method, expected_signature_hash,
         provided_signature, status, expires_at, verified_at, created_at, updated_at
       FROM wallet_verification_challenges
       WHERE id = ?`
    )
    .get(input.challengeId) as WalletVerificationChallenge | undefined;

  if (!challenge) {
    throw new Error("Wallet verification challenge not found");
  }
  if (input.expectedHumanId && challenge.human_id !== input.expectedHumanId) {
    throw new Error("Challenge does not belong to selected human");
  }

  if (challenge.status !== "pending") {
    throw new Error(`Challenge is already in status ${challenge.status}`);
  }

  const expiresAtMs = new Date(challenge.expires_at).getTime();
  if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
    const tsExpired = now();
    db.prepare("UPDATE wallet_verification_challenges SET status = 'expired', updated_at = ? WHERE id = ?").run(
      tsExpired,
      challenge.id
    );
    throw new Error("Wallet verification challenge expired");
  }

  const wallet = getWalletById(challenge.wallet_id);
  if (!wallet) {
    throw new Error("Wallet not found for challenge");
  }

  const provided = input.signature.trim();
  if (!provided) {
    throw new Error("signature is required");
  }

  const providedHash = sha256Hex(provided);
  const isValid = constantTimeHashEquals(providedHash, challenge.expected_signature_hash);
  const ts = now();

  if (!isValid) {
    db.prepare(
      "UPDATE wallet_verification_challenges SET provided_signature = ?, status = 'rejected', updated_at = ? WHERE id = ?"
    ).run(provided, ts, challenge.id);

    const rejected = db.prepare("SELECT * FROM wallet_verification_challenges WHERE id = ?").get(challenge.id) as
      | WalletVerificationChallenge
      | undefined;
    throw new Error(
      `Invalid signature for challenge ${rejected?.id ?? challenge.id}. Expected format: demo_sig_<sha256(address|challenge)>`
    );
  }

  db.prepare(
    `UPDATE wallet_verification_challenges
     SET provided_signature = ?, status = 'verified', verified_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(provided, ts, ts, challenge.id);

  db.prepare("UPDATE human_wallets SET verification_status = 'verified', updated_at = ? WHERE id = ?").run(
    ts,
    challenge.wallet_id
  );

  const updatedChallenge = db.prepare("SELECT * FROM wallet_verification_challenges WHERE id = ?").get(challenge.id) as
    | WalletVerificationChallenge
    | undefined;
  const updatedWallet = getWalletById(challenge.wallet_id);
  if (!updatedChallenge || !updatedWallet) {
    throw new Error("Failed to finalize wallet verification");
  }

  return {
    verified: true,
    challenge: updatedChallenge,
    wallet: updatedWallet
  };
}

export function listWalletVerificationChallenges(input: {
  humanId: string;
  status?: WalletVerificationChallenge["status"];
  limit?: number;
  offset?: number;
}) {
  ensureHumanExists(input.humanId);

  const where: string[] = ["human_id = ?"];
  const params: Array<string | number> = [input.humanId];
  if (input.status) {
    where.push("status = ?");
    params.push(input.status);
  }

  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);

  return db
    .prepare(
      `SELECT
         id, wallet_id, human_id, challenge, message, proof_method, expected_signature_hash,
         provided_signature, status, expires_at, verified_at, created_at, updated_at
       FROM wallet_verification_challenges
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as WalletVerificationChallenge[];
}
