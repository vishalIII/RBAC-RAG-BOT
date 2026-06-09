CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
-- Example query to fetch all Phase 1 Stats for a specific company
WITH dashboard_stats AS (
    SELECT
        -- 1. Questions Asked
        (SELECT COUNT(*) 
         FROM chat_messages m 
         JOIN chat_sessions s ON m.session_id = s.id 
         WHERE s.company_id = 'YOUR_COMPANY_ID_HERE' 
           AND m.role = 'user') as "questionsAsked",

        -- 2. Active Users (Last 30 days)
        (SELECT COUNT(DISTINCT s.employee_id) 
         FROM chat_messages m 
         JOIN chat_sessions s ON m.session_id = s.id 
         WHERE s.company_id = 'YOUR_COMPANY_ID_HERE' 
           AND m.created_at >= NOW() - INTERVAL '30 days') as "activeUsers",

        -- 3. Documents Uploaded
        (SELECT COUNT(*) 
         FROM documents 
         WHERE company_id = 'YOUR_COMPANY_ID_HERE') as "documentsUploaded",

        -- 4. Storage Used (Converted to MB)
        (SELECT COALESCE(SUM(file_size), 0) / (1024.0 * 1024.0) 
         FROM documents 
         WHERE company_id = 'YOUR_COMPANY_ID_HERE') as "storageUsedMB",

        -- 5. Input Tokens
        (SELECT COALESCE(SUM(prompt_tokens), 0) 
         FROM token_usage_logs 
         WHERE company_id = 'YOUR_COMPANY_ID_HERE') as "inputTokens",

        -- 6. Output Tokens
        (SELECT COALESCE(SUM(completion_tokens), 0) 
         FROM token_usage_logs 
         WHERE company_id = 'YOUR_COMPANY_ID_HERE') as "outputTokens",

        -- 7. Estimated Cost (From cents to dollars)
        (SELECT COALESCE(SUM(total_cost_cents), 0) / 100.0 
         FROM token_usage_logs 
         WHERE company_id = 'YOUR_COMPANY_ID_HERE') as "estimatedCost",

        -- 8. Average Response Time
        (SELECT COALESCE(AVG(response_time_ms), 0) 
         FROM rag_request_logs 
         WHERE company_id = 'YOUR_COMPANY_ID_HERE') as "avgResponseTimeMs"
)
SELECT json_build_object(
    'questionsAsked', "questionsAsked",
    'activeUsers', "activeUsers",
    'documentsUploaded', "documentsUploaded",
    'storageUsedMB', ROUND("storageUsedMB"::numeric, 2),
    'inputTokens', "inputTokens",
    'outputTokens', "outputTokens",
    'estimatedCost', ROUND("estimatedCost"::numeric, 2),
    'avgResponseTimeMs', ROUND("avgResponseTimeMs"::numeric, 0)
) FROM dashboard_stats;

    uploaded_by UUID
        REFERENCES company_users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS file_size BIGINT,
    ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS document_type VARCHAR(50) DEFAULT 'general',
    ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS uploaded_by UUID,
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



-- =======================================================================
-- -- DOCUMENTS ASSIGNED TO DEPARTMENTS
-- =========================
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


CREATE INDEX IF NOT EXISTS documents_company_id_idx
ON documents(company_id);

CREATE INDEX IF NOT EXISTS documents_uploaded_by_idx
ON documents(uploaded_by);

CREATE INDEX IF NOT EXISTS document_departments_department_id_idx
ON document_departments(department_id);

CREATE INDEX IF NOT EXISTS document_departments_document_id_idx
ON document_departments(document_id);
