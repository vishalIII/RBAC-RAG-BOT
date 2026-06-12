CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==========================================================
-- DOCUMENTS
-- ==========================================================

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    title VARCHAR(255) NOT NULL,

    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,

    file_size BIGINT,
    mime_type VARCHAR(100),

    document_type VARCHAR(50) NOT NULL DEFAULT 'general',

    tags TEXT[] NOT NULL DEFAULT '{}',

    uploaded_by UUID
        REFERENCES company_users(id)
        ON DELETE SET NULL,

    -- RAG fields
    status VARCHAR(20) NOT NULL DEFAULT 'queued',

    page_count INTEGER,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    embedding_tokens BIGINT NOT NULL DEFAULT 0,
    usage_count BIGINT NOT NULL DEFAULT 0,

    last_used_at TIMESTAMPTZ,

    error_message TEXT,
    processed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT documents_status_check
    CHECK (
        status IN (
            'queued',
            'processing',
            'ready',
            'failed'
        )
    )
);

-- ==========================================================
-- DOCUMENTS ASSIGNED TO DEPARTMENTS
-- ==========================================================

CREATE TABLE IF NOT EXISTS document_departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    document_id UUID NOT NULL
        REFERENCES documents(id)
        ON DELETE CASCADE,

    department_id UUID NOT NULL
        REFERENCES departments(id)
        ON DELETE CASCADE,

    UNIQUE(document_id, department_id)
);

-- ==========================================================
-- INDEXES
-- ==========================================================

CREATE INDEX IF NOT EXISTS documents_company_id_idx
    ON documents(company_id);

CREATE INDEX IF NOT EXISTS documents_uploaded_by_idx
    ON documents(uploaded_by);

CREATE INDEX IF NOT EXISTS documents_status_idx
    ON documents(status);

CREATE INDEX IF NOT EXISTS documents_usage_count_idx
    ON documents(usage_count DESC);

CREATE INDEX IF NOT EXISTS document_departments_department_id_idx
    ON document_departments(department_id);

CREATE INDEX IF NOT EXISTS document_departments_document_id_idx
    ON document_departments(document_id);