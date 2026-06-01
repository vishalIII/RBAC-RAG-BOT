CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  tenant_id varchar(36),
  company_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documents_company_id_fkey FOREIGN KEY (company_id)
    REFERENCES companies(id)
    ON DELETE CASCADE,
  CONSTRAINT documents_created_by_fkey FOREIGN KEY (created_by)
    REFERENCES company_users(id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS documents_tenant_id_idx
  ON documents(tenant_id);

CREATE INDEX IF NOT EXISTS documents_company_id_idx
  ON documents(company_id);

CREATE INDEX IF NOT EXISTS documents_created_by_idx
  ON documents(created_by);
