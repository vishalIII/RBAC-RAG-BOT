CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id varchar(36) NOT NULL,
  company_id uuid NOT NULL,
  employee_code text NOT NULL UNIQUE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  department text NOT NULL,
  designation text NOT NULL,
  phone text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employees_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES company_users(id)
    ON DELETE CASCADE,
  CONSTRAINT employees_company_id_fkey FOREIGN KEY (company_id)
    REFERENCES companies(id)
    ON DELETE CASCADE,
  CONSTRAINT employees_created_by_fkey FOREIGN KEY (created_by)
    REFERENCES company_users(id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS employees_tenant_id_idx
  ON employees(tenant_id);

CREATE INDEX IF NOT EXISTS employees_company_id_idx
  ON employees(company_id);

CREATE INDEX IF NOT EXISTS employees_user_id_idx
  ON employees(user_id);
