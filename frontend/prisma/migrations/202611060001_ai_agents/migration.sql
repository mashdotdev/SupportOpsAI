CREATE UNIQUE INDEX knowledge_documents_id_user_key ON public.knowledge_documents(id, user_id);

CREATE TABLE public.ai_agents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    model_id text NOT NULL CHECK (model_id = 'openrouter/free' OR model_id LIKE '%:free'),
    instructions text NOT NULL CHECK (char_length(btrim(instructions)) BETWEEN 1 AND 10000),
    authority jsonb NOT NULL CHECK (jsonb_typeof(authority) = 'object'),
    knowledge_mode text NOT NULL DEFAULT 'all' CHECK (knowledge_mode IN ('all','selected')),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    updated_at timestamptz(6) NOT NULL DEFAULT now(),
    CONSTRAINT ai_agents_id_user_key UNIQUE (id, user_id)
);
CREATE INDEX ai_agents_user_updated_idx ON public.ai_agents(user_id, updated_at DESC);

CREATE TABLE public.ai_agent_documents (
    agent_id uuid NOT NULL,
    document_id uuid NOT NULL,
    user_id text NOT NULL,
    PRIMARY KEY (agent_id, document_id),
    FOREIGN KEY (agent_id, user_id) REFERENCES public.ai_agents(id, user_id) ON DELETE CASCADE,
    FOREIGN KEY (document_id, user_id) REFERENCES public.knowledge_documents(id, user_id) ON DELETE CASCADE
);
CREATE INDEX ai_agent_documents_document_user_idx ON public.ai_agent_documents(document_id, user_id);
