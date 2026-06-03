CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- DEPARTMENTS
-- =========================
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

    name VARCHAR(100) NOT NULL,

    CONSTRAINT unique_department_per_company
        UNIQUE (company_id, name),

    description TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS  departments_company_id_idx
ON departments(company_id);

-- =======================================================================================
-- EMPLOYEES
-- =========================
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

    user_id UUID NOT NULL UNIQUE
        REFERENCES company_users(id) ON DELETE CASCADE,

    REFERENCES company_users(id)
    ON DELETE CASCADE,

    manager_id UUID
    REFERENCES employees(id)
    ON DELETE SET NULL,

    employment_status VARCHAR(20)
    NOT NULL DEFAULT 'active'
    CHECK (
        employment_status IN (
            'active',
            'inactive'
        )
    ),

    joining_date DATE,

    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,

    employee_code VARCHAR(50) NOT NULL,
    CONSTRAINT unique_employee_code_per_company
    UNIQUE (company_id, employee_code),

    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,

    designation VARCHAR(100) NOT NULL,
    phone VARCHAR(20),

    created_by UUID REFERENCES company_users(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS  employees_company_id_idx
ON employees(company_id);

CREATE INDEX IF NOT EXISTS  employees_department_id_idx
ON employees(department_id);
