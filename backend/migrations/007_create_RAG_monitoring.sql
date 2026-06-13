CREATE EXTENSION IF NOT EXISTS pgcrypto;


CREATE TABLE IF NOT EXISTS rag_request_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    employee_id UUID
        REFERENCES employees(id)
        ON DELETE SET NULL,

    session_id UUID
        REFERENCES chat_sessions(id)
        ON DELETE SET NULL,

    question TEXT NOT NULL,

    response_time_ms INTEGER NOT NULL,

    retrieval_time_ms INTEGER,

    llm_time_ms INTEGER,

    chunks_retrieved INTEGER DEFAULT 0,

    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,

    estimated_cost NUMERIC(12,6) DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rag_request_logs_company_id_idx 
ON rag_request_logs(company_id);

CREATE INDEX IF NOT EXISTS rag_request_logs_employee_id_idx 
ON rag_request_logs(employee_id);

CREATE INDEX IF NOT EXISTS rag_request_logs_session_id_idx 
ON rag_request_logs(session_id);

CREATE INDEX IF NOT EXISTS rag_request_logs_created_at_idx 
ON rag_request_logs(created_at);

                                                                                    

CREATE TABLE IF NOT EXISTS document_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    request_log_id UUID NOT NULL
        REFERENCES rag_request_logs(id)
        ON DELETE CASCADE,

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    document_id UUID NOT NULL
        REFERENCES documents(id)
        ON DELETE CASCADE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS document_usage_logs_request_log_id_idx 
ON document_usage_logs(request_log_id);

CREATE INDEX IF NOT EXISTS document_usage_logs_company_id_idx 
ON document_usage_logs(company_id); 




-- CREATE TABLE IF NOT EXISTS message_feedback (
--     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

--     company_id UUID NOT NULL
--         REFERENCES companies(id)
--         ON DELETE CASCADE,

--     message_id UUID NOT NULL
--         REFERENCES chat_messages(id)
--         ON DELETE CASCADE,

--     employee_id UUID
--         REFERENCES employees(id)
--         ON DELETE SET NULL,

--     rating SMALLINT NOT NULL
--         CHECK (rating IN (-1, 1)),



    
--     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );

CREATE TABLE IF NOT EXISTS  message_feedback(
    id UUID PRIMARY KEY  DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

        employee_id UUID
        REFERENCES employees(id)
        ON DELETE SET NULL,

    question_message_id UUID NOT NULL,
    answer_message_id UUID NOT NULL,

    rating SMALLINT NOT NULL
        CHECK (rating IN (-1, 1)),
    comment TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE INDEX IF NOT EXISTS message_feedback_company_id_idx 
ON message_feedback(company_id);

CREATE INDEX IF NOT EXISTS message_feedback_message_id_idx 
ON message_feedback(answer_message_id);

CREATE INDEX IF NOT EXISTS message_feedback_employee_id_idx 
ON message_feedback(employee_id);
