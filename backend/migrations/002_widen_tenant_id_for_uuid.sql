ALTER TABLE companies
  ALTER COLUMN tenant_id TYPE varchar(36);

ALTER TABLE company_users
  ALTER COLUMN tenant_id TYPE varchar(36);
