export const BASE_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('client', 'human', 'admin', 'agent')) DEFAULT 'client',
      avatar_url TEXT,
      auth_provider TEXT NOT NULL CHECK (auth_provider IN ('local', 'google')),
      google_id TEXT UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      email_verified_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS humans (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      display_name TEXT NOT NULL,
      headline TEXT NOT NULL,
      bio TEXT NOT NULL,
      hourly_rate_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      timezone TEXT NOT NULL,
      rating_avg REAL NOT NULL DEFAULT 0,
      reviews_count INTEGER NOT NULL DEFAULT 0,
      is_available INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS human_skills (
      human_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 3,
      PRIMARY KEY (human_id, skill_id),
      FOREIGN KEY (human_id) REFERENCES humans(id) ON DELETE CASCADE,
      FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS human_availability_windows (
      id TEXT PRIMARY KEY,
      human_id TEXT NOT NULL,
      day_of_week TEXT NOT NULL CHECK (day_of_week IN ('sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat')),
      start_minute INTEGER NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440),
      end_minute INTEGER NOT NULL CHECK (end_minute > 0 AND end_minute <= 1440),
      timezone TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (human_id) REFERENCES humans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      human_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (human_id) REFERENCES humans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      human_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('open', 'closed')) DEFAULT 'open',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (human_id) REFERENCES humans(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'human', 'system')),
      sender_id TEXT,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bounties (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      budget_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL CHECK (status IN ('open', 'in_review', 'in_progress', 'completed', 'cancelled')) DEFAULT 'open',
      skill_slug TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS bounty_applications (
      id TEXT PRIMARY KEY,
      bounty_id TEXT NOT NULL,
      human_id TEXT NOT NULL,
      cover_letter TEXT NOT NULL,
      proposed_amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('applied', 'accepted', 'rejected')) DEFAULT 'applied',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (bounty_id) REFERENCES bounties(id) ON DELETE CASCADE,
      FOREIGN KEY (human_id) REFERENCES humans(id)
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      human_id TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('requested', 'confirmed', 'cancelled', 'completed')) DEFAULT 'requested',
      note TEXT,
      total_price_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (human_id) REFERENCES humans(id)
    );

    CREATE TABLE IF NOT EXISTS booking_reviews (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      human_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (human_id) REFERENCES humans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS api_bookings (
      id TEXT PRIMARY KEY,
      human_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      agent_type TEXT,
      task_title TEXT NOT NULL,
      task_description TEXT,
      start_time TEXT NOT NULL,
      estimated_hours REAL NOT NULL,
      total_amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')) DEFAULT 'pending',
      payment_tx_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (human_id) REFERENCES humans(id)
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      agent_id TEXT NOT NULL,
      agent_type TEXT,
      scopes_json TEXT NOT NULL DEFAULT '["compat:read","compat:write"]',
      status TEXT NOT NULL CHECK (status IN ('active', 'revoked')) DEFAULT 'active',
      created_by_user_id TEXT,
      last_used_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS human_wallets (
      id TEXT PRIMARY KEY,
      human_id TEXT NOT NULL,
      label TEXT,
      chain TEXT NOT NULL CHECK (chain IN ('ethereum', 'polygon', 'arbitrum', 'solana', 'bitcoin', 'tron')),
      network TEXT NOT NULL CHECK (network IN ('mainnet', 'testnet')),
      token_symbol TEXT NOT NULL,
      address TEXT NOT NULL,
      destination_tag TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      verification_status TEXT NOT NULL CHECK (verification_status IN ('unverified', 'verified', 'rejected')) DEFAULT 'unverified',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (human_id) REFERENCES humans(id) ON DELETE CASCADE,
      UNIQUE (human_id, chain, network, token_symbol, address)
    );

    CREATE TABLE IF NOT EXISTS payment_policies (
      user_id TEXT PRIMARY KEY,
      autopay_enabled INTEGER NOT NULL DEFAULT 0,
      require_approval INTEGER NOT NULL DEFAULT 1,
      max_single_payout_cents INTEGER NOT NULL DEFAULT 50000,
      max_daily_payout_cents INTEGER NOT NULL DEFAULT 200000,
      allowed_chains_json TEXT NOT NULL DEFAULT '["polygon"]',
      allowed_tokens_json TEXT NOT NULL DEFAULT '["USDC"]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS crypto_payouts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      human_id TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK (source_type IN ('bounty', 'booking', 'manual')),
      source_id TEXT,
      wallet_id TEXT NOT NULL,
      chain TEXT NOT NULL CHECK (chain IN ('ethereum', 'polygon', 'arbitrum', 'solana', 'bitcoin', 'tron')),
      network TEXT NOT NULL CHECK (network IN ('mainnet', 'testnet')),
      token_symbol TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'submitted', 'confirmed', 'failed', 'cancelled')) DEFAULT 'pending',
      execution_mode TEXT NOT NULL CHECK (execution_mode IN ('manual', 'agent_auto')) DEFAULT 'manual',
      tx_hash TEXT,
      idempotency_key TEXT UNIQUE,
      requested_by_agent_id TEXT,
      approved_at TEXT,
      submitted_at TEXT,
      confirmed_at TEXT,
      failed_at TEXT,
      failure_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (human_id) REFERENCES humans(id),
      FOREIGN KEY (wallet_id) REFERENCES human_wallets(id)
    );

    CREATE TABLE IF NOT EXISTS payout_events (
      id TEXT PRIMARY KEY,
      payout_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'agent', 'system')),
      actor_id TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (payout_id) REFERENCES crypto_payouts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wallet_verification_challenges (
      id TEXT PRIMARY KEY,
      wallet_id TEXT NOT NULL,
      human_id TEXT NOT NULL,
      challenge TEXT NOT NULL,
      message TEXT NOT NULL,
      proof_method TEXT NOT NULL DEFAULT 'demo_deterministic',
      expected_signature_hash TEXT NOT NULL,
      provided_signature TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'verified', 'expired', 'rejected')) DEFAULT 'pending',
      expires_at TEXT NOT NULL,
      verified_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (wallet_id) REFERENCES human_wallets(id) ON DELETE CASCADE,
      FOREIGN KEY (human_id) REFERENCES humans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS escrow_holds (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      human_id TEXT NOT NULL,
      wallet_id TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK (source_type IN ('bounty', 'booking', 'manual')),
      source_id TEXT,
      chain TEXT NOT NULL CHECK (chain IN ('ethereum', 'polygon', 'arbitrum', 'solana', 'bitcoin', 'tron')),
      network TEXT NOT NULL CHECK (network IN ('mainnet', 'testnet')),
      token_symbol TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('held', 'released', 'cancelled', 'expired')) DEFAULT 'held',
      release_payout_id TEXT,
      note TEXT,
      created_by_agent_id TEXT,
      held_at TEXT NOT NULL,
      released_at TEXT,
      cancelled_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (human_id) REFERENCES humans(id),
      FOREIGN KEY (wallet_id) REFERENCES human_wallets(id),
      FOREIGN KEY (release_payout_id) REFERENCES crypto_payouts(id)
    );

    CREATE TABLE IF NOT EXISTS escrow_events (
      id TEXT PRIMARY KEY,
      escrow_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'agent', 'system', 'admin')),
      actor_id TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (escrow_id) REFERENCES escrow_holds(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS disputes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      target_type TEXT NOT NULL CHECK (target_type IN ('booking', 'payout', 'escrow', 'bounty')),
      target_id TEXT NOT NULL,
      opened_by_agent_id TEXT,
      reason TEXT NOT NULL,
      evidence_json TEXT,
      status TEXT NOT NULL CHECK (status IN ('open', 'under_review', 'resolved', 'rejected')) DEFAULT 'open',
      resolution TEXT CHECK (resolution IN ('refund', 'release', 'split', 'no_action', 'reject')),
      resolution_note TEXT,
      resolved_by_user_id TEXT,
      opened_at TEXT NOT NULL,
      resolved_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (resolved_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS dispute_events (
      id TEXT PRIMARY KEY,
      dispute_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'agent', 'system', 'admin')),
      actor_id TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (dispute_id) REFERENCES disputes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payout_webhook_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      endpoint_url TEXT NOT NULL,
      secret_hash TEXT,
      events_json TEXT NOT NULL DEFAULT '["*"]',
      status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'revoked')) DEFAULT 'active',
      description TEXT,
      created_by_agent_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payout_webhook_deliveries (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      payout_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      delivery_status TEXT NOT NULL CHECK (delivery_status IN ('queued', 'delivered', 'failed')) DEFAULT 'queued',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      http_status INTEGER,
      response_body TEXT,
      error_message TEXT,
      last_attempt_at TEXT,
      delivered_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (subscription_id) REFERENCES payout_webhook_subscriptions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (payout_id) REFERENCES crypto_payouts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS booking_milestones (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK (source_type IN ('booking', 'bounty')),
      source_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL CHECK (status IN ('planned', 'in_progress', 'completed', 'paid', 'cancelled')) DEFAULT 'planned',
      due_at TEXT,
      completed_at TEXT,
      payout_id TEXT,
      created_by_agent_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (payout_id) REFERENCES crypto_payouts(id)
    );

    CREATE TABLE IF NOT EXISTS human_profile_settings (
      human_id TEXT PRIMARY KEY,
      city TEXT,
      state TEXT,
      country TEXT,
      show_email INTEGER NOT NULL DEFAULT 0,
      social_links_json TEXT NOT NULL DEFAULT '{}',
      photos_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (human_id) REFERENCES humans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_email_verification_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mcp_tool_requests (
      id TEXT PRIMARY KEY,
      requested_by_agent_id TEXT NOT NULL,
      request_source TEXT NOT NULL CHECK (request_source IN ('agent', 'human')),
      tool_name TEXT NOT NULL,
      tool_description TEXT NOT NULL,
      reason TEXT NOT NULL,
      input_schema_json TEXT NOT NULL,
      output_contract_json TEXT,
      implementation_notes TEXT,
      target_files_json TEXT,
      pr_preference TEXT NOT NULL CHECK (pr_preference IN ('none', 'draft_pr')) DEFAULT 'draft_pr',
      status TEXT NOT NULL CHECK (status IN ('pending_human_review', 'approved', 'rejected', 'implemented')) DEFAULT 'pending_human_review',
      human_review_required INTEGER NOT NULL DEFAULT 1,
      human_reviewer_id TEXT,
      human_review_note TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mcp_tool_pr_drafts (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL UNIQUE,
      branch_name TEXT NOT NULL,
      commit_title TEXT NOT NULL,
      pr_title TEXT NOT NULL,
      pr_body TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('draft', 'ready', 'opened')) DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (request_id) REFERENCES mcp_tool_requests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS site_metrics (
      metric_key TEXT PRIMARY KEY,
      metric_value BIGINT NOT NULL DEFAULT 0 CHECK (metric_value >= 0),
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_humans_available ON humans(is_available);
    CREATE INDEX IF NOT EXISTS idx_human_windows_human_id ON human_availability_windows(human_id, day_of_week);
    CREATE INDEX IF NOT EXISTS idx_reviews_human_id ON reviews(human_id);
    CREATE INDEX IF NOT EXISTS idx_booking_reviews_human_id ON booking_reviews(human_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_bounties_user_id ON bounties(user_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
    CREATE INDEX IF NOT EXISTS idx_api_bookings_human_id ON api_bookings(human_id);
    CREATE INDEX IF NOT EXISTS idx_api_bookings_agent_id ON api_bookings(agent_id);
    CREATE INDEX IF NOT EXISTS idx_api_bookings_status ON api_bookings(status);
    CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
    CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);
    CREATE INDEX IF NOT EXISTS idx_wallets_human_id ON human_wallets(human_id);
    CREATE INDEX IF NOT EXISTS idx_wallet_challenges_wallet_status ON wallet_verification_challenges(wallet_id, status);
    CREATE INDEX IF NOT EXISTS idx_wallet_challenges_human_status ON wallet_verification_challenges(human_id, status);
    CREATE INDEX IF NOT EXISTS idx_payouts_user_status ON crypto_payouts(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_payout_events_payout_id ON payout_events(payout_id);
    CREATE INDEX IF NOT EXISTS idx_escrow_holds_user_status ON escrow_holds(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_escrow_holds_source ON escrow_holds(source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_escrow_events_escrow_id ON escrow_events(escrow_id);
    CREATE INDEX IF NOT EXISTS idx_disputes_user_status ON disputes(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_disputes_target ON disputes(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_dispute_events_dispute_id ON dispute_events(dispute_id);
    CREATE INDEX IF NOT EXISTS idx_payout_webhooks_user_status ON payout_webhook_subscriptions(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_payout_webhooks_delivery_sub ON payout_webhook_deliveries(subscription_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_payout_webhooks_delivery_payout ON payout_webhook_deliveries(payout_id, event_type);
    CREATE INDEX IF NOT EXISTS idx_booking_milestones_user_status ON booking_milestones(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_booking_milestones_source ON booking_milestones(source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_profile_settings_human_id ON human_profile_settings(human_id);
    CREATE INDEX IF NOT EXISTS idx_verify_tokens_user_id ON user_email_verification_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_verify_tokens_token ON user_email_verification_tokens(token);
    CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_mcp_requests_status ON mcp_tool_requests(status);
    CREATE INDEX IF NOT EXISTS idx_mcp_requests_tool_name ON mcp_tool_requests(tool_name);
    CREATE INDEX IF NOT EXISTS idx_mcp_pr_drafts_request_id ON mcp_tool_pr_drafts(request_id);
  `;
