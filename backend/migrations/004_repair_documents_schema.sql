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

    document_type VARCHAR(50) DEFAULT 'general',

    tags TEXT[] NOT NULL DEFAULT '{}',

    uploaded_by UUID
        REFERENCES company_users(id)
        ON DELETE SET NULL,

    -- RAG fields
    status VARCHAR(20) NOT NULL DEFAULT 'ready',
    page_count INTEGER,
    chunk_count INTEGER DEFAULT 0,
    embedding_tokens BIGINT DEFAULT 0,
    usage_count BIGINT DEFAULT 0,
    last_used_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================================
-- SAFE MIGRATION FOR EXISTING DATABASES
-- ==========================================================

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS file_size BIGINT,
    ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS document_type VARCHAR(50) DEFAULT 'general',
    ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS uploaded_by UUID,
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ready',
    ADD COLUMN IF NOT EXISTS page_count INTEGER,
    ADD COLUMN IF NOT EXISTS chunk_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS embedding_tokens BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS usage_count BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE documents
    ALTER COLUMN document_type SET DEFAULT 'general',
    ALTER COLUMN tags SET DEFAULT '{}';

UPDATE documents
SET tags = '{}'
WHERE tags IS NULL;

ALTER TABLE documents
    ALTER COLUMN tags SET NOT NULL;

-- ==========================================================
-- DOCUMENT STATUS VALIDATION
-- ==========================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'documents_status_check'
    ) THEN
        ALTER TABLE documents
        ADD CONSTRAINT documents_status_check
        CHECK (
            status IN (
                'uploaded',
                'processing',
                'embedding',
                'ready',
                'failed'
            )
        );
    END IF;
END $$;

-- ==========================================================
-- UPLOADED BY FK
-- ==========================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'documents'::regclass
          AND conname = 'documents_uploaded_by_fkey'
    ) THEN
        ALTER TABLE documents
            ADD CONSTRAINT documents_uploaded_by_fkey
            FOREIGN KEY (uploaded_by)
            REFERENCES company_users(id)
            ON DELETE SET NULL;
    END IF;
END $$;

-- ==========================================================
-- DOCUMENT DEPARTMENTS
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