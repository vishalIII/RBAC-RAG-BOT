CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS no_answer_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

    question TEXT NOT NULL,

    reason VARCHAR(100) NOT NULL, -- no_documents, no_relevant_documents, empty_context

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS no_answer_logs_company_id_idx
ON no_answer_logs(company_id);

CREATE INDEX IF NOT EXISTS no_answer_logs_employee_id_idx
ON no_answer_logs(employee_id);

CREATE INDEX IF NOT EXISTS no_answer_logs_created_at_idx
ON no_answer_logs(created_at);