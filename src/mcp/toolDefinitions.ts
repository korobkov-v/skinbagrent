export const toolDefs = [
  {
    name: "get_agent_identity",
    description: "Get MCP agent identity and feature capabilities.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "search_humans",
    description: "Search available humans by text query, skill and hourly rate filters.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        skill: { type: "string" },
        min_hourly_rate_cents: { type: "integer", minimum: 0 },
        max_hourly_rate_cents: { type: "integer", minimum: 0 },
        available_only: { type: "boolean" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        offset: { type: "integer", minimum: 0 }
      },
      additionalProperties: false
    }
  },
  {
    name: "get_human",
    description: "Get full profile of a human by ID.",
    inputSchema: {
      type: "object",
      properties: {
        human_id: { type: "string", format: "uuid" }
      },
      required: ["human_id"],
      additionalProperties: false
    }
  },
  {
    name: "list_skills",
    description: "List available skill tags for discovery.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" }
      },
      additionalProperties: false
    }
  },
  {
    name: "get_reviews",
    description: "Get review list for a specific human.",
    inputSchema: {
      type: "object",
      properties: {
        human_id: { type: "string", format: "uuid" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        offset: { type: "integer", minimum: 0 }
      },
      required: ["human_id"],
      additionalProperties: false
    }
  },
  {
    name: "start_conversation",
    description: "Open a conversation thread with a human and send the first message.",
    inputSchema: {
      type: "object",
      properties: {
        human_id: { type: "string", format: "uuid" },
        subject: { type: "string", minLength: 2, maxLength: 180 },
        message: { type: "string", minLength: 1, maxLength: 4000 }
      },
      required: ["human_id", "message"],
      additionalProperties: false
    }
  },
  {
    name: "send_message",
    description: "Send message to an existing conversation.",
    inputSchema: {
      type: "object",
      properties: {
        conversation_id: { type: "string", format: "uuid" },
        message: { type: "string", minLength: 1, maxLength: 4000 }
      },
      required: ["conversation_id", "message"],
      additionalProperties: false
    }
  },
  {
    name: "get_conversation",
    description: "Get conversation details and message history.",
    inputSchema: {
      type: "object",
      properties: {
        conversation_id: { type: "string", format: "uuid" }
      },
      required: ["conversation_id"],
      additionalProperties: false
    }
  },
  {
    name: "list_conversations",
    description: "List the current user's conversations.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["open", "closed"] },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        offset: { type: "integer", minimum: 0 }
      },
      additionalProperties: false
    }
  },
  {
    name: "create_bounty",
    description: "Create a bounty with budget and skill target.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 3, maxLength: 200 },
        description: { type: "string", minLength: 10, maxLength: 10000 },
        budget_cents: { type: "integer", minimum: 1 },
        currency: { type: "string", minLength: 3, maxLength: 3 },
        skill_slug: { type: "string" }
      },
      required: ["title", "description", "budget_cents"],
      additionalProperties: false
    }
  },
  {
    name: "list_bounties",
    description: "List bounties for the current user.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["open", "in_review", "in_progress", "completed", "cancelled"]
        },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        offset: { type: "integer", minimum: 0 }
      },
      additionalProperties: false
    }
  },
  {
    name: "get_bounty",
    description: "Get bounty details by ID.",
    inputSchema: {
      type: "object",
      properties: {
        bounty_id: { type: "string", format: "uuid" }
      },
      required: ["bounty_id"],
      additionalProperties: false
    }
  },
  {
    name: "get_bounty_applications",
    description: "List applications for a bounty.",
    inputSchema: {
      type: "object",
      properties: {
        bounty_id: { type: "string", format: "uuid" },
        status: { type: "string", enum: ["applied", "accepted", "rejected"] }
      },
      required: ["bounty_id"],
      additionalProperties: false
    }
  },
  {
    name: "accept_application",
    description: "Accept one bounty application and reject others.",
    inputSchema: {
      type: "object",
      properties: {
        bounty_id: { type: "string", format: "uuid" },
        application_id: { type: "string", format: "uuid" }
      },
      required: ["bounty_id", "application_id"],
      additionalProperties: false
    }
  },
  {
    name: "update_bounty",
    description: "Update bounty fields including status.",
    inputSchema: {
      type: "object",
      properties: {
        bounty_id: { type: "string", format: "uuid" },
        title: { type: "string", minLength: 3, maxLength: 200 },
        description: { type: "string", minLength: 10, maxLength: 10000 },
        budget_cents: { type: "integer", minimum: 1 },
        skill_slug: { type: ["string", "null"] },
        status: {
          type: "string",
          enum: ["open", "in_review", "in_progress", "completed", "cancelled"]
        }
      },
      required: ["bounty_id"],
      additionalProperties: false
    }
  },
  {
    name: "set_human_availability_window",
    description: "Create or update one weekly availability window for a human profile.",
    inputSchema: {
      type: "object",
      properties: {
        human_id: { type: "string", format: "uuid" },
        day_of_week: { type: "string", enum: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] },
        start_time: { type: "string", pattern: "^([01]\\\\d|2[0-3]):[0-5]\\\\d$" },
        end_time: { type: "string", pattern: "^([01]\\\\d|2[0-3]):[0-5]\\\\d$" },
        timezone: { type: "string", minLength: 2, maxLength: 120 },
        is_active: { type: "boolean" }
      },
      required: ["human_id", "day_of_week", "start_time", "end_time"],
      additionalProperties: false
    }
  },
  {
    name: "match_humans_for_bounty",
    description: "Rank humans for a bounty using skill, budget, rating, and availability windows.",
    inputSchema: {
      type: "object",
      properties: {
        bounty_id: { type: "string", format: "uuid" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        include_unavailable: { type: "boolean" }
      },
      required: ["bounty_id"],
      additionalProperties: false
    }
  },
  {
    name: "book_human",
    description: "Create a booking for a human in a date range.",
    inputSchema: {
      type: "object",
      properties: {
        human_id: { type: "string", format: "uuid" },
        starts_at: { type: "string", format: "date-time" },
        ends_at: { type: "string", format: "date-time" },
        note: { type: "string", maxLength: 4000 }
      },
      required: ["human_id", "starts_at", "ends_at"],
      additionalProperties: false
    }
  },
  {
    name: "get_booking",
    description: "Get booking details by ID.",
    inputSchema: {
      type: "object",
      properties: {
        booking_id: { type: "string", format: "uuid" }
      },
      required: ["booking_id"],
      additionalProperties: false
    }
  },
  {
    name: "update_booking",
    description: "Update booking status or note.",
    inputSchema: {
      type: "object",
      properties: {
        booking_id: { type: "string", format: "uuid" },
        status: {
          type: "string",
          enum: ["requested", "confirmed", "cancelled", "completed"]
        },
        note: { type: ["string", "null"] }
      },
      required: ["booking_id"],
      additionalProperties: false
    }
  },
  {
    name: "review_completed_booking",
    description: "Leave rating and review for a completed booking.",
    inputSchema: {
      type: "object",
      properties: {
        booking_id: { type: "string", format: "uuid" },
        rating: { type: "integer", minimum: 1, maximum: 5 },
        comment: { type: "string", minLength: 3, maxLength: 4000 },
        author_name: { type: "string", minLength: 2, maxLength: 120 }
      },
      required: ["booking_id", "rating", "comment"],
      additionalProperties: false
    }
  },
  {
    name: "list_payment_networks",
    description: "Get supported chains/networks and payout statuses for crypto payouts.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "estimate_payout_fees",
    description: "Estimate network/platform fees and net payout amount before execution.",
    inputSchema: {
      type: "object",
      properties: {
        chain: { type: "string", enum: ["ethereum", "polygon", "arbitrum", "solana", "bitcoin", "tron"] },
        network: { type: "string", enum: ["mainnet", "testnet"] },
        token_symbol: { type: "string", minLength: 2, maxLength: 12 },
        amount_cents: { type: "integer", minimum: 1 },
        execution_mode: { type: "string", enum: ["manual", "agent_auto"] }
      },
      required: ["chain", "network", "token_symbol", "amount_cents"],
      additionalProperties: false
    }
  },
  {
    name: "create_payout_webhook_subscription",
    description: "Create payout lifecycle webhook subscription.",
    inputSchema: {
      type: "object",
      properties: {
        endpoint_url: { type: "string", format: "uri", maxLength: 1000 },
        events: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "*",
              "payout_created",
              "payout_auto_approved",
              "payout_approved",
              "payout_submitted",
              "payout_confirmed",
              "payout_failed",
              "payout_cancelled"
            ]
          },
          minItems: 1,
          maxItems: 20
        },
        secret: { type: "string", minLength: 6, maxLength: 300 },
        status: { type: "string", enum: ["active", "paused", "revoked"] },
        description: { type: "string", maxLength: 400 },
        created_by_agent_id: { type: "string", minLength: 2, maxLength: 120 }
      },
      required: ["endpoint_url"],
      additionalProperties: false
    }
  },
  {
    name: "list_payout_webhook_deliveries",
    description: "List payout webhook deliveries with filters.",
    inputSchema: {
      type: "object",
      properties: {
        subscription_id: { type: "string", format: "uuid" },
        payout_id: { type: "string", format: "uuid" },
        delivery_status: { type: "string", enum: ["queued", "delivered", "failed"] },
        limit: { type: "integer", minimum: 1, maximum: 200 },
        offset: { type: "integer", minimum: 0 }
      },
      additionalProperties: false
    }
  },
  {
    name: "register_human_wallet",
    description: "Register or update payout wallet for a human.",
    inputSchema: {
      type: "object",
      properties: {
        human_id: { type: "string", format: "uuid" },
        label: { type: "string" },
        chain: { type: "string", enum: ["ethereum", "polygon", "arbitrum", "solana", "bitcoin", "tron"] },
        network: { type: "string", enum: ["mainnet", "testnet"] },
        token_symbol: { type: "string", minLength: 2, maxLength: 12 },
        address: { type: "string", minLength: 10, maxLength: 120 },
        destination_tag: { type: ["string", "null"] },
        is_default: { type: "boolean" },
        verification_status: { type: "string", enum: ["unverified", "verified", "rejected"] }
      },
      required: ["human_id", "chain", "network", "token_symbol", "address"],
      additionalProperties: false
    }
  },
  {
    name: "list_human_wallets",
    description: "List payout wallets registered by a human.",
    inputSchema: {
      type: "object",
      properties: {
        human_id: { type: "string", format: "uuid" }
      },
      required: ["human_id"],
      additionalProperties: false
    }
  },
  {
    name: "get_payment_policy",
    description: "Get current user's crypto payout policy.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "update_payment_policy",
    description: "Update autopay policy limits and allowlists.",
    inputSchema: {
      type: "object",
      properties: {
        autopay_enabled: { type: "boolean" },
        require_approval: { type: "boolean" },
        max_single_payout_cents: { type: "integer", minimum: 1 },
        max_daily_payout_cents: { type: "integer", minimum: 1 },
        allowed_chains: {
          type: "array",
          items: {
            type: "string",
            enum: ["ethereum", "polygon", "arbitrum", "solana", "bitcoin", "tron"]
          }
        },
        allowed_tokens: {
          type: "array",
          items: { type: "string" }
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "create_crypto_payout",
    description: "Create crypto payout intent for bounty/booking/manual source.",
    inputSchema: {
      type: "object",
      properties: {
        source_type: { type: "string", enum: ["bounty", "booking", "manual"] },
        source_id: { type: "string", format: "uuid" },
        human_id: { type: "string", format: "uuid" },
        amount_cents: { type: "integer", minimum: 1 },
        chain: { type: "string", enum: ["ethereum", "polygon", "arbitrum", "solana", "bitcoin", "tron"] },
        network: { type: "string", enum: ["mainnet", "testnet"] },
        token_symbol: { type: "string", minLength: 2, maxLength: 12 },
        wallet_id: { type: "string", format: "uuid" },
        execution_mode: { type: "string", enum: ["manual", "agent_auto"] },
        requested_by_agent_id: { type: "string", minLength: 2, maxLength: 120 },
        idempotency_key: { type: "string", minLength: 6, maxLength: 120 }
      },
      required: ["source_type", "chain", "network", "token_symbol", "execution_mode"],
      additionalProperties: false
    }
  },
  {
    name: "list_crypto_payouts",
    description: "List user's crypto payouts with status filters.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "approved", "submitted", "confirmed", "failed", "cancelled"]
        },
        source_type: { type: "string", enum: ["bounty", "booking", "manual"] },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        offset: { type: "integer", minimum: 0 }
      },
      additionalProperties: false
    }
  },
  {
    name: "get_crypto_payout",
    description: "Get payout details by ID.",
    inputSchema: {
      type: "object",
      properties: {
        payout_id: { type: "string", format: "uuid" }
      },
      required: ["payout_id"],
      additionalProperties: false
    }
  },
  {
    name: "approve_crypto_payout",
    description: "Approve pending payout before execution.",
    inputSchema: {
      type: "object",
      properties: {
        payout_id: { type: "string", format: "uuid" }
      },
      required: ["payout_id"],
      additionalProperties: false
    }
  },
  {
    name: "execute_crypto_payout",
    description: "Execute approved payout by LLM agent (simulated on-chain transfer).",
    inputSchema: {
      type: "object",
      properties: {
        payout_id: { type: "string", format: "uuid" },
        agent_id: { type: "string", minLength: 2, maxLength: 120 },
        tx_hash: { type: "string", minLength: 8, maxLength: 140 },
        confirm_immediately: { type: "boolean" }
      },
      required: ["payout_id", "agent_id"],
      additionalProperties: false
    }
  },
  {
    name: "fail_crypto_payout",
    description: "Mark payout as failed with reason.",
    inputSchema: {
      type: "object",
      properties: {
        payout_id: { type: "string", format: "uuid" },
        reason: { type: "string", minLength: 4, maxLength: 400 }
      },
      required: ["payout_id", "reason"],
      additionalProperties: false
    }
  },
  {
    name: "get_payout_events",
    description: "Get payout event/audit log.",
    inputSchema: {
      type: "object",
      properties: {
        payout_id: { type: "string", format: "uuid" }
      },
      required: ["payout_id"],
      additionalProperties: false
    }
  },
  {
    name: "create_booking_milestone",
    description: "Create milestone for booking/bounty with partial amount tracking.",
    inputSchema: {
      type: "object",
      properties: {
        source_type: { type: "string", enum: ["booking", "bounty"] },
        source_id: { type: "string", format: "uuid" },
        title: { type: "string", minLength: 3, maxLength: 200 },
        description: { type: "string", maxLength: 2000 },
        amount_cents: { type: "integer", minimum: 1 },
        due_at: { type: "string", format: "date-time" },
        created_by_agent_id: { type: "string", minLength: 2, maxLength: 120 }
      },
      required: ["source_type", "source_id", "title", "amount_cents"],
      additionalProperties: false
    }
  },
  {
    name: "list_booking_milestones",
    description: "List booking/bounty milestones for current user.",
    inputSchema: {
      type: "object",
      properties: {
        source_type: { type: "string", enum: ["booking", "bounty"] },
        source_id: { type: "string", format: "uuid" },
        status: { type: "string", enum: ["planned", "in_progress", "completed", "paid", "cancelled"] },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        offset: { type: "integer", minimum: 0 }
      },
      additionalProperties: false
    }
  },
  {
    name: "complete_booking_milestone",
    description: "Complete milestone and optionally create linked payout.",
    inputSchema: {
      type: "object",
      properties: {
        milestone_id: { type: "string", format: "uuid" },
        auto_create_payout: { type: "boolean" },
        payout: {
          type: "object",
          properties: {
            chain: { type: "string", enum: ["ethereum", "polygon", "arbitrum", "solana", "bitcoin", "tron"] },
            network: { type: "string", enum: ["mainnet", "testnet"] },
            token_symbol: { type: "string", minLength: 2, maxLength: 12 },
            wallet_id: { type: "string", format: "uuid" },
            execution_mode: { type: "string", enum: ["manual", "agent_auto"] },
            requested_by_agent_id: { type: "string", minLength: 2, maxLength: 120 },
            idempotency_key: { type: "string", minLength: 6, maxLength: 120 },
            auto_execute: { type: "boolean" },
            tx_hash: { type: "string", minLength: 8, maxLength: 140 },
            confirm_immediately: { type: "boolean" }
          },
          required: ["chain", "network", "token_symbol", "execution_mode"],
          additionalProperties: false
        }
      },
      required: ["milestone_id"],
      additionalProperties: false
    }
  },
  {
    name: "create_wallet_verification_challenge",
    description: "Create wallet verification challenge for a human wallet (demo deterministic signature flow).",
    inputSchema: {
      type: "object",
      properties: {
        human_id: { type: "string", format: "uuid" },
        wallet_id: { type: "string", format: "uuid" },
        chain: { type: "string", enum: ["ethereum", "polygon", "arbitrum", "solana", "bitcoin", "tron"] },
        network: { type: "string", enum: ["mainnet", "testnet"] },
        token_symbol: { type: "string", minLength: 2, maxLength: 12 },
        address: { type: "string", minLength: 10, maxLength: 120 },
        expires_in_minutes: { type: "integer", minimum: 1, maximum: 1440 }
      },
      required: ["human_id"],
      additionalProperties: false
    }
  },
  {
    name: "verify_wallet_signature",
    description: "Verify wallet challenge signature and mark wallet as verified.",
    inputSchema: {
      type: "object",
      properties: {
        human_id: { type: "string", format: "uuid" },
        challenge_id: { type: "string", format: "uuid" },
        signature: { type: "string", minLength: 12, maxLength: 600 }
      },
      required: ["human_id", "challenge_id", "signature"],
      additionalProperties: false
    }
  },
  {
    name: "create_escrow_hold",
    description: "Create escrow hold for manual/bounty/booking settlement flow.",
    inputSchema: {
      type: "object",
      properties: {
        source_type: { type: "string", enum: ["bounty", "booking", "manual"] },
        source_id: { type: "string", format: "uuid" },
        human_id: { type: "string", format: "uuid" },
        amount_cents: { type: "integer", minimum: 1 },
        chain: { type: "string", enum: ["ethereum", "polygon", "arbitrum", "solana", "bitcoin", "tron"] },
        network: { type: "string", enum: ["mainnet", "testnet"] },
        token_symbol: { type: "string", minLength: 2, maxLength: 12 },
        wallet_id: { type: "string", format: "uuid" },
        note: { type: "string", maxLength: 2000 },
        created_by_agent_id: { type: "string", minLength: 2, maxLength: 120 }
      },
      required: ["source_type", "chain", "network", "token_symbol"],
      additionalProperties: false
    }
  },
  {
    name: "release_escrow_hold",
    description: "Release escrow hold by creating linked payout intent (optionally auto-execute for agent_auto).",
    inputSchema: {
      type: "object",
      properties: {
        escrow_id: { type: "string", format: "uuid" },
        execution_mode: { type: "string", enum: ["manual", "agent_auto"] },
        requested_by_agent_id: { type: "string", minLength: 2, maxLength: 120 },
        idempotency_key: { type: "string", minLength: 6, maxLength: 120 },
        auto_execute: { type: "boolean" },
        tx_hash: { type: "string", minLength: 8, maxLength: 140 },
        confirm_immediately: { type: "boolean" }
      },
      required: ["escrow_id", "execution_mode"],
      additionalProperties: false
    }
  },
  {
    name: "open_dispute",
    description: "Open dispute for booking/payout/escrow/bounty target.",
    inputSchema: {
      type: "object",
      properties: {
        target_type: { type: "string", enum: ["booking", "payout", "escrow", "bounty"] },
        target_id: { type: "string", format: "uuid" },
        reason: { type: "string", minLength: 8, maxLength: 4000 },
        evidence: { type: "object" },
        opened_by_agent_id: { type: "string", minLength: 2, maxLength: 120 }
      },
      required: ["target_type", "target_id", "reason"],
      additionalProperties: false
    }
  },
  {
    name: "resolve_dispute",
    description: "Resolve dispute with human reviewer decision.",
    inputSchema: {
      type: "object",
      properties: {
        dispute_id: { type: "string", format: "uuid" },
        reviewer_user_id: { type: "string", format: "uuid" },
        decision: { type: "string", enum: ["refund", "release", "split", "no_action", "reject"] },
        note: { type: "string", maxLength: 3000 }
      },
      required: ["dispute_id", "reviewer_user_id", "decision"],
      additionalProperties: false
    }
  },
  {
    name: "request_mcp_tool_creation",
    description:
      "Submit a request for creating a new MCP tool. Human review is mandatory before implementation/merge.",
    inputSchema: {
      type: "object",
      properties: {
        requested_by_agent_id: { type: "string", minLength: 2, maxLength: 120 },
        tool_name: { type: "string", minLength: 3, maxLength: 80 },
        tool_description: { type: "string", minLength: 6, maxLength: 400 },
        reason: { type: "string", minLength: 8, maxLength: 3000 },
        input_schema: { type: "object" },
        output_contract: { type: "object" },
        implementation_notes: { type: "string", maxLength: 4000 },
        target_files: {
          type: "array",
          items: { type: "string", minLength: 2, maxLength: 260 },
          maxItems: 50
        },
        pr_preference: { type: "string", enum: ["none", "draft_pr"] }
      },
      required: ["requested_by_agent_id", "tool_name", "tool_description", "reason", "input_schema"],
      additionalProperties: false
    }
  },
  {
    name: "list_mcp_tool_creation_requests",
    description: "List MCP tool creation requests and their review status.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending_human_review", "approved", "rejected", "implemented"]
        },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        offset: { type: "integer", minimum: 0 }
      },
      additionalProperties: false
    }
  },
  {
    name: "get_mcp_tool_creation_request",
    description: "Get one MCP tool creation request including PR draft metadata.",
    inputSchema: {
      type: "object",
      properties: {
        request_id: { type: "string", format: "uuid" }
      },
      required: ["request_id"],
      additionalProperties: false
    }
  }
] as const;
