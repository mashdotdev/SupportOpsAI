CREATE TABLE public.knowledge_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    filename text NOT NULL,
    media_type text NOT NULL,
    byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 20971520),
    storage_key text NOT NULL,
    staging_key text NOT NULL,
    checksum text,
    status text NOT NULL DEFAULT 'awaiting_upload'
      CHECK (status IN ('awaiting_upload','queued','indexing','ready','failed','deleting','deleted')),
    index_generation uuid,
    active_generation uuid,
    chunk_count integer NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
    error text,
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    updated_at timestamptz(6) NOT NULL DEFAULT now(),
    CHECK (status <> 'ready' OR active_generation IS NOT NULL)
);
CREATE UNIQUE INDEX knowledge_documents_storage_key_key ON public.knowledge_documents(storage_key);
CREATE UNIQUE INDEX knowledge_documents_staging_key_key ON public.knowledge_documents(staging_key);
CREATE INDEX knowledge_documents_user_created_idx ON public.knowledge_documents(user_id, created_at DESC);
CREATE INDEX knowledge_documents_status_created_idx ON public.knowledge_documents(status, created_at);

CREATE TABLE public.knowledge_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
    operation text NOT NULL CHECK (operation IN ('ingest','delete')),
    generation uuid NOT NULL,
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    run_after timestamptz(6) NOT NULL DEFAULT now(),
    lease_until timestamptz(6),
    lease_token uuid,
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    updated_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX knowledge_jobs_document_operation_generation_key ON public.knowledge_jobs(document_id,operation,generation);
CREATE INDEX knowledge_jobs_status_run_after_idx ON public.knowledge_jobs(status,run_after);
