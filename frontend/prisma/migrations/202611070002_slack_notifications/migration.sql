ALTER TABLE ai_agents ADD COLUMN slack_notifications boolean NOT NULL DEFAULT false;
ALTER TABLE ai_agents ADD COLUMN slack_test_delivery boolean NOT NULL DEFAULT false;
ALTER TABLE ai_agents ADD CONSTRAINT ai_agents_slack_test_permission CHECK (NOT slack_test_delivery OR slack_notifications);
ALTER TABLE agent_conversations ADD COLUMN escalation_cycle integer NOT NULL DEFAULT 1 CHECK (escalation_cycle > 0);

CREATE TABLE slack_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  destination text NOT NULL CHECK (length(destination) BETWEEN 1 AND 100),
  secret text,
  enabled boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  verified_at timestamptz,
  last_sent_at timestamptz,
  last_error text,
  next_send_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,user_id)
);

CREATE TABLE notification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  connection_id uuid NOT NULL,
  connection_version integer NOT NULL,
  conversation_id uuid,
  agent_id uuid,
  agent_name text NOT NULL,
  cycle integer NOT NULL DEFAULT 1,
  kind text NOT NULL CHECK (kind IN ('escalation','connection_test')),
  mode text NOT NULL CHECK (mode IN ('simulation','delivery')),
  source text NOT NULL CHECK (source IN ('test','live')),
  status text NOT NULL CHECK (status IN ('simulated','queued','sending','sent','failed','unknown','cancelled')),
  question text NOT NULL,
  reason text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  explicit_delivery boolean NOT NULL DEFAULT false,
  run_after timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  lease_token uuid,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(connection_id,user_id) REFERENCES slack_connections(id,user_id),
  FOREIGN KEY(conversation_id,user_id) REFERENCES agent_conversations(id,user_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX notification_escalation_dedupe ON notification_jobs(conversation_id,cycle,mode) WHERE kind='escalation';
CREATE INDEX notification_jobs_queue_idx ON notification_jobs(status,run_after);
CREATE INDEX notification_jobs_owner_created_idx ON notification_jobs(user_id,created_at DESC);

CREATE TABLE notification_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES notification_jobs(id) ON DELETE CASCADE,
  number integer NOT NULL,
  status text NOT NULL,
  http_status integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(job_id,number)
);
