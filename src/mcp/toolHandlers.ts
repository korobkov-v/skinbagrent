import type { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  createMcpToolCreationRequest,
  getMcpToolCreationRequest,
  listMcpToolCreationRequests
} from "../services/mcpToolRequestService";
import {
  approveCryptoPayout,
  completeBookingMilestone,
  createBookingMilestone,
  createEscrowHold,
  createPayoutWebhookSubscription,
  createCryptoPayoutIntent,
  createWalletVerificationChallenge,
  estimatePayoutFees,
  executeCryptoPayoutByAgent,
  getCryptoPayout,
  listBookingMilestones,
  listCryptoPayouts,
  listDisputeEvents,
  listEscrowEvents,
  listWalletVerificationChallenges,
  listHumanWallets,
  listPayoutEvents,
  listPayoutWebhookDeliveries,
  listSupportedPaymentNetworks,
  markCryptoPayoutFailed,
  openDispute,
  releaseEscrowHold,
  resolveDispute,
  updatePaymentPolicy,
  upsertHumanWallet,
  verifyWalletSignature,
  getPaymentPolicy
} from "../services/paymentService";
import {
  acceptBountyApplication,
  createBooking,
  createBounty,
  createBookingReview,
  createConversation,
  getAgentIdentity,
  getBooking,
  getBounty,
  getBountyApplications,
  getConversationWithMessages,
  getHuman,
  getHumanOwnerUserId,
  getReviews,
  listHumanAvailabilityWindows,
  listBounties,
  listConversations,
  listSkills,
  matchHumansForBounty,
  searchHumans,
  setHumanAvailabilityWindow,
  sendConversationMessage,
  updateBooking,
  updateBounty
} from "../services/rentService";
import { parseSchemas, type ToolName } from "./parseSchemas";

function asToolArgs(request: CallToolRequest) {
  return (request.params.arguments ?? {}) as Record<string, unknown>;
}

function ok(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}

function fail(message: string) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: message
      }
    ]
  };
}

export async function handleToolCall(request: CallToolRequest, userId: string) {
  const toolName = request.params.name as ToolName;

  try {
switch (toolName) {
      case "get_agent_identity":
        return ok(getAgentIdentity());

      case "search_humans": {
        const input = parseSchemas.search_humans.parse(asToolArgs(request));
        const humans = searchHumans({
          query: input.query,
          skill: input.skill,
          minHourlyRateCents: input.min_hourly_rate_cents,
          maxHourlyRateCents: input.max_hourly_rate_cents,
          availableOnly: input.available_only,
          limit: input.limit,
          offset: input.offset
        });
        return ok({ humans });
      }

      case "get_human": {
        const input = parseSchemas.get_human.parse(asToolArgs(request));
        const human = getHuman(input.human_id);
        if (!human) {
          return fail("Human not found");
        }
        return ok({ human });
      }

      case "list_skills": {
        const input = parseSchemas.list_skills.parse(asToolArgs(request));
        const skills = listSkills(input.query);
        return ok({ skills });
      }

      case "get_reviews": {
        const input = parseSchemas.get_reviews.parse(asToolArgs(request));
        const reviews = getReviews(input.human_id, input.limit, input.offset);
        return ok({ reviews });
      }

      case "start_conversation": {
        const input = parseSchemas.start_conversation.parse(asToolArgs(request));
        const result = createConversation({
          userId,
          humanId: input.human_id,
          subject: input.subject || "New conversation",
          message: input.message
        });
        return ok(result);
      }

      case "send_message": {
        const input = parseSchemas.send_message.parse(asToolArgs(request));
        const message = sendConversationMessage({
          userId,
          conversationId: input.conversation_id,
          body: input.message
        });
        return ok({ message });
      }

      case "get_conversation": {
        const input = parseSchemas.get_conversation.parse(asToolArgs(request));
        const conversation = getConversationWithMessages(userId, input.conversation_id);
        if (!conversation) {
          return fail("Conversation not found");
        }
        return ok(conversation);
      }

      case "list_conversations": {
        const input = parseSchemas.list_conversations.parse(asToolArgs(request));
        const conversations = listConversations({
          userId,
          status: input.status,
          limit: input.limit,
          offset: input.offset
        });
        return ok({ conversations });
      }

      case "create_bounty": {
        const input = parseSchemas.create_bounty.parse(asToolArgs(request));
        const bounty = createBounty({
          userId,
          title: input.title,
          description: input.description,
          budgetCents: input.budget_cents,
          currency: input.currency?.toUpperCase(),
          skillSlug: input.skill_slug
        });
        return ok({ bounty });
      }

      case "list_bounties": {
        const input = parseSchemas.list_bounties.parse(asToolArgs(request));
        const bounties = listBounties({
          userId,
          status: input.status,
          limit: input.limit,
          offset: input.offset
        });
        return ok({ bounties });
      }

      case "get_bounty": {
        const input = parseSchemas.get_bounty.parse(asToolArgs(request));
        const bounty = getBounty(userId, input.bounty_id);
        if (!bounty) {
          return fail("Bounty not found");
        }
        return ok({ bounty });
      }

      case "get_bounty_applications": {
        const input = parseSchemas.get_bounty_applications.parse(asToolArgs(request));
        const applications = getBountyApplications({
          userId,
          bountyId: input.bounty_id,
          status: input.status
        });
        return ok({ applications });
      }

      case "accept_application": {
        const input = parseSchemas.accept_application.parse(asToolArgs(request));
        const result = acceptBountyApplication({
          userId,
          bountyId: input.bounty_id,
          applicationId: input.application_id
        });
        return ok(result);
      }

      case "update_bounty": {
        const input = parseSchemas.update_bounty.parse(asToolArgs(request));
        const bounty = updateBounty({
          userId,
          bountyId: input.bounty_id,
          title: input.title,
          description: input.description,
          budgetCents: input.budget_cents,
          status: input.status,
          skillSlug: input.skill_slug
        });
        return ok({ bounty });
      }

      case "set_human_availability_window": {
        const input = parseSchemas.set_human_availability_window.parse(asToolArgs(request));
        const ownerUserId = getHumanOwnerUserId(input.human_id);
        if (ownerUserId && ownerUserId !== userId) {
          return fail("Forbidden: you can manage only your own human profile");
        }

        const window = setHumanAvailabilityWindow({
          humanId: input.human_id,
          dayOfWeek: input.day_of_week,
          startTime: input.start_time,
          endTime: input.end_time,
          timezone: input.timezone,
          isActive: input.is_active
        });
        const windows = listHumanAvailabilityWindows({
          humanId: input.human_id
        });
        return ok({ window, windows });
      }

      case "match_humans_for_bounty": {
        const input = parseSchemas.match_humans_for_bounty.parse(asToolArgs(request));
        const result = matchHumansForBounty({
          userId,
          bountyId: input.bounty_id,
          limit: input.limit,
          includeUnavailable: input.include_unavailable
        });
        return ok(result);
      }

      case "book_human": {
        const input = parseSchemas.book_human.parse(asToolArgs(request));
        const booking = createBooking({
          userId,
          humanId: input.human_id,
          startsAt: input.starts_at,
          endsAt: input.ends_at,
          note: input.note
        });
        return ok({ booking });
      }

      case "get_booking": {
        const input = parseSchemas.get_booking.parse(asToolArgs(request));
        const booking = getBooking(userId, input.booking_id);
        if (!booking) {
          return fail("Booking not found");
        }
        return ok({ booking });
      }

      case "update_booking": {
        const input = parseSchemas.update_booking.parse(asToolArgs(request));
        const booking = updateBooking({
          userId,
          bookingId: input.booking_id,
          status: input.status,
          note: input.note
        });
        return ok({ booking });
      }

      case "review_completed_booking": {
        const input = parseSchemas.review_completed_booking.parse(asToolArgs(request));
        const result = createBookingReview({
          userId,
          bookingId: input.booking_id,
          rating: input.rating,
          comment: input.comment,
          authorName: input.author_name
        });
        return ok(result);
      }

      case "list_payment_networks": {
        parseSchemas.list_payment_networks.parse(asToolArgs(request));
        return ok(listSupportedPaymentNetworks());
      }

      case "estimate_payout_fees": {
        const input = parseSchemas.estimate_payout_fees.parse(asToolArgs(request));
        const estimate = estimatePayoutFees({
          chain: input.chain,
          network: input.network,
          tokenSymbol: input.token_symbol,
          amountCents: input.amount_cents,
          executionMode: input.execution_mode
        });
        return ok({ estimate });
      }

      case "create_payout_webhook_subscription": {
        const input = parseSchemas.create_payout_webhook_subscription.parse(asToolArgs(request));
        const subscription = createPayoutWebhookSubscription({
          userId,
          endpointUrl: input.endpoint_url,
          events: input.events,
          secret: input.secret,
          status: input.status,
          description: input.description,
          createdByAgentId: input.created_by_agent_id
        });
        return ok({ subscription });
      }

      case "list_payout_webhook_deliveries": {
        const input = parseSchemas.list_payout_webhook_deliveries.parse(asToolArgs(request));
        const deliveries = listPayoutWebhookDeliveries({
          userId,
          subscriptionId: input.subscription_id,
          payoutId: input.payout_id,
          deliveryStatus: input.delivery_status,
          limit: input.limit,
          offset: input.offset
        });
        return ok({ deliveries });
      }

      case "register_human_wallet": {
        const input = parseSchemas.register_human_wallet.parse(asToolArgs(request));
        const wallet = upsertHumanWallet({
          humanId: input.human_id,
          label: input.label,
          chain: input.chain,
          network: input.network,
          tokenSymbol: input.token_symbol,
          address: input.address,
          destinationTag: input.destination_tag,
          isDefault: input.is_default,
          verificationStatus: input.verification_status
        });
        return ok({ wallet });
      }

      case "list_human_wallets": {
        const input = parseSchemas.list_human_wallets.parse(asToolArgs(request));
        const wallets = listHumanWallets(input.human_id);
        return ok({ wallets });
      }

      case "get_payment_policy": {
        parseSchemas.get_payment_policy.parse(asToolArgs(request));
        const policy = getPaymentPolicy(userId);
        return ok({ policy });
      }

      case "update_payment_policy": {
        const input = parseSchemas.update_payment_policy.parse(asToolArgs(request));
        const policy = updatePaymentPolicy({
          userId,
          autopayEnabled: input.autopay_enabled,
          requireApproval: input.require_approval,
          maxSinglePayoutCents: input.max_single_payout_cents,
          maxDailyPayoutCents: input.max_daily_payout_cents,
          allowedChains: input.allowed_chains,
          allowedTokens: input.allowed_tokens
        });
        return ok({ policy });
      }

      case "create_crypto_payout": {
        const input = parseSchemas.create_crypto_payout.parse(asToolArgs(request));
        const payout = createCryptoPayoutIntent({
          userId,
          sourceType: input.source_type,
          sourceId: input.source_id,
          humanId: input.human_id,
          amountCents: input.amount_cents,
          chain: input.chain,
          network: input.network,
          tokenSymbol: input.token_symbol,
          walletId: input.wallet_id,
          executionMode: input.execution_mode,
          requestedByAgentId: input.requested_by_agent_id,
          idempotencyKey: input.idempotency_key
        });
        return ok({ payout });
      }

      case "list_crypto_payouts": {
        const input = parseSchemas.list_crypto_payouts.parse(asToolArgs(request));
        const payouts = listCryptoPayouts({
          userId,
          status: input.status,
          sourceType: input.source_type,
          limit: input.limit,
          offset: input.offset
        });
        return ok({ payouts });
      }

      case "get_crypto_payout": {
        const input = parseSchemas.get_crypto_payout.parse(asToolArgs(request));
        const payout = getCryptoPayout(userId, input.payout_id);
        if (!payout) {
          return fail("Payout not found");
        }
        return ok({ payout });
      }

      case "approve_crypto_payout": {
        const input = parseSchemas.approve_crypto_payout.parse(asToolArgs(request));
        const payout = approveCryptoPayout({
          userId,
          payoutId: input.payout_id,
          actorId: userId
        });
        return ok({ payout });
      }

      case "execute_crypto_payout": {
        const input = parseSchemas.execute_crypto_payout.parse(asToolArgs(request));
        const payout = executeCryptoPayoutByAgent({
          userId,
          payoutId: input.payout_id,
          agentId: input.agent_id,
          txHash: input.tx_hash,
          confirmImmediately: input.confirm_immediately
        });
        return ok({ payout });
      }

      case "fail_crypto_payout": {
        const input = parseSchemas.fail_crypto_payout.parse(asToolArgs(request));
        const payout = markCryptoPayoutFailed({
          userId,
          payoutId: input.payout_id,
          reason: input.reason,
          actorType: "agent",
          actorId: "mcp-agent"
        });
        return ok({ payout });
      }

      case "get_payout_events": {
        const input = parseSchemas.get_payout_events.parse(asToolArgs(request));
        const events = listPayoutEvents(userId, input.payout_id);
        return ok({ events });
      }

      case "create_booking_milestone": {
        const input = parseSchemas.create_booking_milestone.parse(asToolArgs(request));
        const milestone = createBookingMilestone({
          userId,
          sourceType: input.source_type,
          sourceId: input.source_id,
          title: input.title,
          description: input.description,
          amountCents: input.amount_cents,
          dueAt: input.due_at,
          createdByAgentId: input.created_by_agent_id
        });
        return ok({ milestone });
      }

      case "list_booking_milestones": {
        const input = parseSchemas.list_booking_milestones.parse(asToolArgs(request));
        const milestones = listBookingMilestones({
          userId,
          sourceType: input.source_type,
          sourceId: input.source_id,
          status: input.status,
          limit: input.limit,
          offset: input.offset
        });
        return ok({ milestones });
      }

      case "complete_booking_milestone": {
        const input = parseSchemas.complete_booking_milestone.parse(asToolArgs(request));
        const result = completeBookingMilestone({
          userId,
          milestoneId: input.milestone_id,
          autoCreatePayout: input.auto_create_payout,
          payout: input.payout
            ? {
                chain: input.payout.chain,
                network: input.payout.network,
                tokenSymbol: input.payout.token_symbol,
                walletId: input.payout.wallet_id,
                executionMode: input.payout.execution_mode,
                requestedByAgentId: input.payout.requested_by_agent_id,
                idempotencyKey: input.payout.idempotency_key,
                autoExecute: input.payout.auto_execute,
                txHash: input.payout.tx_hash,
                confirmImmediately: input.payout.confirm_immediately
              }
            : undefined
        });
        return ok(result);
      }

      case "create_wallet_verification_challenge": {
        const input = parseSchemas.create_wallet_verification_challenge.parse(asToolArgs(request));
        const challenge = createWalletVerificationChallenge({
          humanId: input.human_id,
          walletId: input.wallet_id,
          chain: input.chain,
          network: input.network,
          tokenSymbol: input.token_symbol,
          address: input.address,
          expiresInMinutes: input.expires_in_minutes
        });
        return ok({ challenge });
      }

      case "verify_wallet_signature": {
        const input = parseSchemas.verify_wallet_signature.parse(asToolArgs(request));
        const verification = verifyWalletSignature({
          challengeId: input.challenge_id,
          signature: input.signature,
          expectedHumanId: input.human_id
        });
        const challenges = listWalletVerificationChallenges({
          humanId: input.human_id,
          status: "verified",
          limit: 10,
          offset: 0
        });
        return ok({ verification, latest_verified_challenges: challenges });
      }

      case "create_escrow_hold": {
        const input = parseSchemas.create_escrow_hold.parse(asToolArgs(request));
        const escrow = createEscrowHold({
          userId,
          sourceType: input.source_type,
          sourceId: input.source_id,
          humanId: input.human_id,
          amountCents: input.amount_cents,
          chain: input.chain,
          network: input.network,
          tokenSymbol: input.token_symbol,
          walletId: input.wallet_id,
          note: input.note,
          createdByAgentId: input.created_by_agent_id
        });
        return ok({ escrow });
      }

      case "release_escrow_hold": {
        const input = parseSchemas.release_escrow_hold.parse(asToolArgs(request));
        const result = releaseEscrowHold({
          userId,
          escrowId: input.escrow_id,
          executionMode: input.execution_mode,
          requestedByAgentId: input.requested_by_agent_id,
          idempotencyKey: input.idempotency_key,
          autoExecute: input.auto_execute,
          txHash: input.tx_hash,
          confirmImmediately: input.confirm_immediately
        });
        const escrowEvents = listEscrowEvents(userId, input.escrow_id);
        return ok({ ...result, escrowEvents });
      }

      case "open_dispute": {
        const input = parseSchemas.open_dispute.parse(asToolArgs(request));
        const dispute = openDispute({
          userId,
          targetType: input.target_type,
          targetId: input.target_id,
          reason: input.reason,
          evidence: input.evidence,
          openedByAgentId: input.opened_by_agent_id
        });
        return ok({ dispute });
      }

      case "resolve_dispute": {
        const input = parseSchemas.resolve_dispute.parse(asToolArgs(request));
        const dispute = resolveDispute({
          disputeId: input.dispute_id,
          reviewerUserId: input.reviewer_user_id,
          decision: input.decision,
          note: input.note
        });
        const events = listDisputeEvents(dispute.user_id, dispute.id);
        return ok({ dispute, events });
      }

      case "request_mcp_tool_creation": {
        const input = parseSchemas.request_mcp_tool_creation.parse(asToolArgs(request));
        const result = createMcpToolCreationRequest({
          requestedByAgentId: input.requested_by_agent_id,
          requestSource: "agent",
          toolName: input.tool_name,
          toolDescription: input.tool_description,
          reason: input.reason,
          inputSchema: input.input_schema,
          outputContract: input.output_contract,
          implementationNotes: input.implementation_notes,
          targetFiles: input.target_files,
          prPreference: input.pr_preference
        });
        return ok(result);
      }

      case "list_mcp_tool_creation_requests": {
        const input = parseSchemas.list_mcp_tool_creation_requests.parse(asToolArgs(request));
        const requests = listMcpToolCreationRequests({
          status: input.status,
          limit: input.limit,
          offset: input.offset
        });
        return ok({
          requests,
          note: "Requests remain pending until reviewed by a human."
        });
      }

      case "get_mcp_tool_creation_request": {
        const input = parseSchemas.get_mcp_tool_creation_request.parse(asToolArgs(request));
        const requestData = getMcpToolCreationRequest(input.request_id);
        if (!requestData) {
          return fail("MCP tool creation request not found");
        }
        return ok(requestData);
      }

      default:
        return fail(`Unknown tool: ${toolName}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return fail(message);
  }
}
