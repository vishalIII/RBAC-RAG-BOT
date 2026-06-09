CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================================================
-- SUBSCRIPTION PLANS
-- ====================================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Token limits (monthly)
    monthly_prompt_tokens BIGINT NOT NULL,
    monthly_completion_tokens BIGINT NOT NULL,
    
    -- Pricing (in cents, e.g., 500 = $5.00)
    monthly_price_cents INTEGER NOT NULL,
    
    -- Settings
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INSERT INTO subscription_plans (
--     name, description, monthly_prompt_tokens, 
--     monthly_completion_tokens, monthly_price_cents, is_active
-- ) VALUES 
--     ('Starter', 'Ideal for small teams', 1000000, 500000, 2999, true),
--     ('Professional', 'Growing businesses', 10000000, 5000000, 9999, true),
--     ('Enterprise', 'Large organizations', 100000000, 50000000, 49999, true)
-- ON CONFLICT DO NOTHING;

-- ==============================================================================
-- COMPANY SUBSCRIPTION (Billing/Plans)
-- ====================================================================
CREATE TABLE IF NOT EXISTS company_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    
    -- Billing cycle
    billing_cycle_start_date DATE NOT NULL,
    billing_cycle_end_date DATE NOT NULL,
    
    -- Usage tracking for current cycle
    prompt_tokens_used BIGINT NOT NULL DEFAULT 0,
    completion_tokens_used BIGINT NOT NULL DEFAULT 0,
    
    -- Cost tracking
    estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'cancelled')),
    
    payment_method VARCHAR(50),  -- stripe_card, bank_transfer, etc.
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS company_subscriptions_company_id_idx
    ON company_subscriptions(company_id);
CREATE INDEX IF NOT EXISTS company_subscriptions_plan_id_idx
    ON company_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS company_subscriptions_billing_cycle_idx
    ON company_subscriptions(billing_cycle_start_date, billing_cycle_end_date);

-- ====================================================================
-- TOKEN USAGE (Per Request)
-- ====================================================================
CREATE TABLE IF NOT EXISTS token_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identifiers
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
    
    -- Token counts (from Gemini)
    prompt_tokens INTEGER NOT NULL,
    completion_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,
    
    -- Cost calculation
    prompt_cost_cents INTEGER NOT NULL,  -- prompt tokens * rate
    completion_cost_cents INTEGER NOT NULL,  -- completion tokens * rate
    total_cost_cents INTEGER NOT NULL,
    
    -- Pricing rate at time of request (for historical reference)
    prompt_token_rate_per_1k INTEGER NOT NULL,  -- in cents
    completion_token_rate_per_1k INTEGER NOT NULL,  -- in cents
    
    -- Model info
    model_name VARCHAR(100) NOT NULL DEFAULT 'gemini-2.5-flash',
    
    -- Metadata
    question TEXT,
    context_tokens INTEGER,  -- tokens from retrieved documents
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS token_usage_logs_company_id_idx
    ON token_usage_logs(company_id);
CREATE INDEX IF NOT EXISTS token_usage_logs_employee_id_idx
    ON token_usage_logs(employee_id);
CREATE INDEX IF NOT EXISTS token_usage_logs_session_id_idx
    ON token_usage_logs(session_id);
CREATE INDEX IF NOT EXISTS token_usage_logs_created_at_idx
    ON token_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS token_usage_logs_company_created_idx
    ON token_usage_logs(company_id, created_at);

-- ====================================================================
-- DAILY USAGE AGGREGATES
-- ====================================================================
CREATE TABLE IF NOT EXISTS daily_usage_aggregates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    
    usage_date DATE NOT NULL,
    
    prompt_tokens_used BIGINT NOT NULL DEFAULT 0,
    completion_tokens_used BIGINT NOT NULL DEFAULT 0,
    total_tokens_used BIGINT NOT NULL DEFAULT 0,
    
    total_cost_cents INTEGER NOT NULL DEFAULT 0,
    
    request_count INTEGER NOT NULL DEFAULT 0,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_daily_usage
        UNIQUE (company_id, employee_id, usage_date)
);

CREATE INDEX IF NOT EXISTS daily_usage_company_date_idx
    ON daily_usage_aggregates(company_id, usage_date);
CREATE INDEX IF NOT EXISTS daily_usage_employee_date_idx
    ON daily_usage_aggregates(employee_id, usage_date);

-- ====================================================================
-- MONTHLY USAGE AGGREGATES
-- ====================================================================
CREATE TABLE IF NOT EXISTS monthly_usage_aggregates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    
    year_month DATE NOT NULL,  -- First day of month, e.g., 2024-01-01
    
    prompt_tokens_used BIGINT NOT NULL DEFAULT 0,
    completion_tokens_used BIGINT NOT NULL DEFAULT 0,
    total_tokens_used BIGINT NOT NULL DEFAULT 0,
    
    total_cost_cents INTEGER NOT NULL DEFAULT 0,
    
    request_count INTEGER NOT NULL DEFAULT 0,
    unique_employees INTEGER NOT NULL DEFAULT 0,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_monthly_usage
        UNIQUE (company_id, year_month)
);

CREATE INDEX IF NOT EXISTS monthly_usage_company_idx
    ON monthly_usage_aggregates(company_id);
CREATE INDEX IF NOT EXISTS monthly_usage_year_month_idx
    ON monthly_usage_aggregates(year_month);

-- ====================================================================
-- USAGE LIMITS & ALERTS
-- ====================================================================
CREATE TABLE IF NOT EXISTS usage_limit_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    
    alert_type VARCHAR(50) NOT NULL
        CHECK (alert_type IN ('usage_80', 'usage_100', 'overage', 'limit_exceeded')),
    
    -- Alert details
    current_usage BIGINT NOT NULL,
    limit_value BIGINT NOT NULL,
    percentage_used NUMERIC(5, 2),
    
    -- Notification status
    is_notified BOOLEAN NOT NULL DEFAULT false,
    notified_at TIMESTAMPTZ,
    
    alert_period VARCHAR(20) NOT NULL
        CHECK (alert_period IN ('daily', 'monthly')),
    
    alert_date DATE NOT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS usage_alerts_company_date_idx
    ON usage_limit_alerts(company_id, alert_date);
CREATE INDEX IF NOT EXISTS usage_alerts_notified_idx
    ON usage_limit_alerts(is_notified);

-- ====================================================================
-- BILLING INVOICES
-- ====================================================================
CREATE TABLE IF NOT EXISTS billing_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    subscription_id UUID NOT NULL REFERENCES company_subscriptions(id) ON DELETE RESTRICT,
    
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    
    -- Period
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,
    
    -- Usage
    prompt_tokens_used BIGINT NOT NULL,
    completion_tokens_used BIGINT NOT NULL,
    total_tokens_used BIGINT NOT NULL,
    
    -- Costs
    base_plan_cost_cents INTEGER NOT NULL,
    overage_cost_cents INTEGER NOT NULL DEFAULT 0,
    discount_cents INTEGER NOT NULL DEFAULT 0,
    total_amount_cents INTEGER NOT NULL,
    
    -- Payment
    payment_status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending', 'paid', 'failed', 'cancelled')),
    
    paid_at TIMESTAMPTZ,
    due_date DATE,
    
    notes TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS billing_invoices_company_idx
    ON billing_invoices(company_id);
CREATE INDEX IF NOT EXISTS billing_invoices_status_idx
    ON billing_invoices(payment_status);
CREATE INDEX IF NOT EXISTS billing_invoices_period_idx
    ON billing_invoices(billing_period_start, billing_period_end);

-- ====================================================================
-- PRICING RATES (Historical)
-- ====================================================================
CREATE TABLE IF NOT EXISTS pricing_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    model_name VARCHAR(100) NOT NULL,
    
    -- Cost per 1000 tokens (in cents)
    prompt_token_rate_per_1k INTEGER NOT NULL,
    completion_token_rate_per_1k INTEGER NOT NULL,
    
    -- Effective dates
    effective_date DATE NOT NULL,
    end_date DATE,
    
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INSERT INTO pricing_rates (
--     model_name, prompt_token_rate_per_1k, 
--     completion_token_rate_per_1k, effective_date, is_active
-- ) VALUES 
--     ('gemini-2.5-flash', 1, 4, '2024-01-01', true)
-- ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS pricing_rates_model_active_idx
    ON pricing_rates(model_name, is_active);

-- ====================================================================
-- AUDIT TRAIL
-- ====================================================================
CREATE TABLE IF NOT EXISTS token_audit_trail (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    
    event_type VARCHAR(100) NOT NULL,  -- monthly_reset, manual_adjustment, etc.
    
    description TEXT,
    
    -- Before/after values
    before_prompt_tokens BIGINT,
    before_completion_tokens BIGINT,
    after_prompt_tokens BIGINT,
    after_completion_tokens BIGINT,
    
    -- Who made the change
    modified_by UUID REFERENCES company_users(id) ON DELETE SET NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_trail_company_idx
    ON token_audit_trail(company_id);
CREATE INDEX IF NOT EXISTS audit_trail_event_idx
    ON token_audit_trail(event_type);
