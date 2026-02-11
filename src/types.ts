export type AuthProvider = "local" | "google";
export type UserRole = "client" | "human" | "admin" | "agent";
export type ConversationStatus = "open" | "closed";
export type BountyStatus = "open" | "in_review" | "in_progress" | "completed" | "cancelled";
export type ApplicationStatus = "applied" | "accepted" | "rejected";
export type BookingStatus = "requested" | "confirmed" | "cancelled" | "completed";
export type ApiBookingStatus = "pending" | "confirmed" | "in_progress" | "completed" | "cancelled";
export type Weekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
export type CryptoChain = "ethereum" | "polygon" | "arbitrum" | "solana" | "bitcoin" | "tron";
export type CryptoNetwork = "mainnet" | "testnet";
export type WalletVerificationStatus = "unverified" | "verified" | "rejected";
export type WalletChallengeStatus = "pending" | "verified" | "expired" | "rejected";
export type PayoutStatus =
  | "pending"
  | "approved"
  | "submitted"
  | "confirmed"
  | "failed"
  | "cancelled";
export type PayoutSourceType = "bounty" | "booking" | "manual";
export type PayoutExecutionMode = "manual" | "agent_auto";
export type EscrowStatus = "held" | "released" | "cancelled" | "expired";
export type DisputeTargetType = "booking" | "payout" | "escrow" | "bounty";
export type DisputeStatus = "open" | "under_review" | "resolved" | "rejected";
export type DisputeResolution = "refund" | "release" | "split" | "no_action" | "reject";
export type PayoutWebhookSubscriptionStatus = "active" | "paused" | "revoked";
export type PayoutWebhookDeliveryStatus = "queued" | "delivered" | "failed";
export type MilestoneSourceType = "booking" | "bounty";
export type MilestoneStatus = "planned" | "in_progress" | "completed" | "paid" | "cancelled";
export type McpToolRequestStatus = "pending_human_review" | "approved" | "rejected" | "implemented";
export type McpToolRequestSource = "agent" | "human";
export type McpToolPrPreference = "none" | "draft_pr";
export type CompatApiKeyStatus = "active" | "revoked";
export type CompatApiKeyScope = "compat:read" | "compat:write" | "compat:admin";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url: string | null;
  auth_provider: AuthProvider;
  google_id: string | null;
  email_verified: number;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
}

export interface HumanSummary {
  id: string;
  display_name: string;
  headline: string;
  bio: string;
  hourly_rate_cents: number;
  currency: string;
  timezone: string;
  rating_avg: number;
  reviews_count: number;
  is_available: number;
  skills: string[];
}

export interface Review {
  id: string;
  human_id: string;
  author_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  human_id: string;
  subject: string;
  status: ConversationStatus;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: "user" | "human" | "system";
  sender_id: string | null;
  body: string;
  created_at: string;
}

export interface Bounty {
  id: string;
  user_id: string;
  title: string;
  description: string;
  budget_cents: number;
  currency: string;
  status: BountyStatus;
  skill_slug: string | null;
  created_at: string;
  updated_at: string;
}

export interface BountyApplication {
  id: string;
  bounty_id: string;
  human_id: string;
  cover_letter: string;
  proposed_amount_cents: number;
  status: ApplicationStatus;
  created_at: string;
}

export interface Booking {
  id: string;
  user_id: string;
  human_id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  note: string | null;
  total_price_cents: number;
  created_at: string;
  updated_at: string;
}

export interface HumanAvailabilityWindow {
  id: string;
  human_id: string;
  day_of_week: Weekday;
  start_minute: number;
  end_minute: number;
  timezone: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface BountyMatchCandidate {
  human_id: string;
  display_name: string;
  headline: string;
  timezone: string;
  hourly_rate_cents: number;
  rating_avg: number;
  reviews_count: number;
  skill_match: boolean;
  budget_fit: boolean;
  availability_match: boolean;
  score: number;
  score_breakdown: {
    skill: number;
    budget: number;
    rating: number;
    availability: number;
  };
}

export interface ApiBooking {
  id: string;
  human_id: string;
  agent_id: string;
  agent_type: string | null;
  task_title: string;
  task_description: string | null;
  start_time: string;
  estimated_hours: number;
  total_amount_cents: number;
  currency: string;
  status: ApiBookingStatus;
  payment_tx_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface HumanWallet {
  id: string;
  human_id: string;
  label: string | null;
  chain: CryptoChain;
  network: CryptoNetwork;
  token_symbol: string;
  address: string;
  destination_tag: string | null;
  is_default: number;
  verification_status: WalletVerificationStatus;
  created_at: string;
  updated_at: string;
}

export interface WalletVerificationChallenge {
  id: string;
  wallet_id: string;
  human_id: string;
  challenge: string;
  message: string;
  proof_method: string;
  expected_signature_hash: string;
  provided_signature: string | null;
  status: WalletChallengeStatus;
  expires_at: string;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentPolicy {
  user_id: string;
  autopay_enabled: number;
  require_approval: number;
  max_single_payout_cents: number;
  max_daily_payout_cents: number;
  allowed_chains: CryptoChain[];
  allowed_tokens: string[];
  created_at: string;
  updated_at: string;
}

export interface CryptoPayout {
  id: string;
  user_id: string;
  human_id: string;
  source_type: PayoutSourceType;
  source_id: string | null;
  wallet_id: string;
  chain: CryptoChain;
  network: CryptoNetwork;
  token_symbol: string;
  amount_cents: number;
  status: PayoutStatus;
  execution_mode: PayoutExecutionMode;
  tx_hash: string | null;
  idempotency_key: string | null;
  requested_by_agent_id: string | null;
  approved_at: string | null;
  submitted_at: string | null;
  confirmed_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayoutEvent {
  id: string;
  payout_id: string;
  event_type: string;
  actor_type: "user" | "agent" | "system";
  actor_id: string | null;
  payload_json: string | null;
  created_at: string;
}

export interface EscrowHold {
  id: string;
  user_id: string;
  human_id: string;
  wallet_id: string;
  source_type: PayoutSourceType;
  source_id: string | null;
  chain: CryptoChain;
  network: CryptoNetwork;
  token_symbol: string;
  amount_cents: number;
  status: EscrowStatus;
  release_payout_id: string | null;
  note: string | null;
  created_by_agent_id: string | null;
  held_at: string;
  released_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EscrowEvent {
  id: string;
  escrow_id: string;
  event_type: string;
  actor_type: "user" | "agent" | "system" | "admin";
  actor_id: string | null;
  payload_json: string | null;
  created_at: string;
}

export interface Dispute {
  id: string;
  user_id: string;
  target_type: DisputeTargetType;
  target_id: string;
  opened_by_agent_id: string | null;
  reason: string;
  evidence_json: string | null;
  status: DisputeStatus;
  resolution: DisputeResolution | null;
  resolution_note: string | null;
  resolved_by_user_id: string | null;
  opened_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DisputeEvent {
  id: string;
  dispute_id: string;
  event_type: string;
  actor_type: "user" | "agent" | "system" | "admin";
  actor_id: string | null;
  payload_json: string | null;
  created_at: string;
}

export interface PayoutFeeEstimate {
  chain: CryptoChain;
  network: CryptoNetwork;
  token_symbol: string;
  amount_cents: number;
  execution_mode: PayoutExecutionMode;
  estimated_network_fee_cents: number;
  estimated_platform_fee_cents: number;
  estimated_total_debit_cents: number;
  estimated_recipient_net_cents: number;
}

export interface PayoutWebhookSubscription {
  id: string;
  user_id: string;
  endpoint_url: string;
  secret_hash: string | null;
  events_json: string;
  status: PayoutWebhookSubscriptionStatus;
  description: string | null;
  created_by_agent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayoutWebhookDelivery {
  id: string;
  subscription_id: string;
  user_id: string;
  payout_id: string;
  event_type: string;
  payload_json: string;
  delivery_status: PayoutWebhookDeliveryStatus;
  attempt_count: number;
  http_status: number | null;
  response_body: string | null;
  error_message: string | null;
  last_attempt_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingMilestone {
  id: string;
  user_id: string;
  source_type: MilestoneSourceType;
  source_id: string;
  title: string;
  description: string | null;
  amount_cents: number;
  currency: string;
  status: MilestoneStatus;
  due_at: string | null;
  completed_at: string | null;
  payout_id: string | null;
  created_by_agent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface McpToolRequest {
  id: string;
  requested_by_agent_id: string;
  request_source: McpToolRequestSource;
  tool_name: string;
  tool_description: string;
  reason: string;
  input_schema_json: string;
  output_contract_json: string | null;
  implementation_notes: string | null;
  target_files_json: string | null;
  pr_preference: McpToolPrPreference;
  status: McpToolRequestStatus;
  human_review_required: number;
  human_reviewer_id: string | null;
  human_review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface McpToolPrDraft {
  id: string;
  request_id: string;
  branch_name: string;
  commit_title: string;
  pr_title: string;
  pr_body: string;
  status: "draft" | "ready" | "opened";
  created_at: string;
  updated_at: string;
}

export interface CompatApiKey {
  id: string;
  name: string;
  agent_id: string;
  agent_type: string | null;
  scopes_json: string;
  status: CompatApiKeyStatus;
  created_by_user_id: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}
