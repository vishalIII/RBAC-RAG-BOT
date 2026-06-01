CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(36) NOT NULL UNIQUE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(36) NOT NULL,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'manager',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE companies
  ALTER COLUMN tenant_id TYPE varchar(36)
  USING tenant_id::text;

ALTER TABLE company_users
  ALTER COLUMN tenant_id TYPE varchar(36)
  USING tenant_id::text;

ALTER TABLE company_users
  ADD COLUMN IF NOT EXISTS company_id uuid;

UPDATE company_users cu
SET company_id = c.id
FROM companies c
WHERE cu.company_id IS NULL
  AND cu.tenant_id = c.tenant_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'company_users_company_id_fkey'
  ) THEN
    ALTER TABLE company_users
      ADD CONSTRAINT company_users_company_id_fkey
      FOREIGN KEY (company_id)
      REFERENCES companies(id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM company_users
    WHERE company_id IS NULL
  ) THEN
    ALTER TABLE company_users
      ALTER COLUMN company_id SET NOT NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS platform_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'platform_admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'companies_created_by_fkey'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_created_by_fkey
      FOREIGN KEY (created_by)
      REFERENCES company_users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS company_users_tenant_id_idx
  ON company_users(tenant_id);

CREATE INDEX IF NOT EXISTS company_users_company_id_idx
  ON company_users(company_id);



CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title varchar(255) NOT NULL,
  file_name varchar(255) NOT NULL,
  file_path text NOT NULL,
  created_by uuid REFERENCES company_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_company_id_idx
  ON documents(company_id);

CREATE INDEX IF NOT EXISTS documents_created_by_idx
  ON documents(created_by);