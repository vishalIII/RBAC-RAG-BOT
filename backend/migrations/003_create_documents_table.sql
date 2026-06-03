CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

    title VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,

    created_by UUID REFERENCES company_users(id) ON DELETE SET NULL,
    file_size BIGINT,
    mime_type VARCHAR(100),
    uploaded_by UUID REFERENCES company_users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS documents_company_id_idx
  ON documents(company_id);

CREATE INDEX IF NOT EXISTS documents_created_by_idx
  ON documents(created_by);



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
