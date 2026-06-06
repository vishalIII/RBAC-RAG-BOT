CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ================================================
-- CHAT-SESSIONS

CREATE TABLE IF NOT EXISTS chat_sessions(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

    title TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS  chat_sessions_company_id_idx
ON chat_sessions(company_id);

CREATE INDEX IF NOT EXISTS  chat_sessions_employee_id_idx
ON chat_sessions(employee_id);




CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    session_id UUID NOT NULL
        REFERENCES chat_sessions(id) ON DELETE CASCADE,

    role TEXT NOT NULL
        CHECK (role IN ('user', 'assistant', 'system')),

    content TEXT NOT NULL,

    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_messages_session_id_idx
ON chat_messages(session_id);

CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx
ON chat_messages(created_at);