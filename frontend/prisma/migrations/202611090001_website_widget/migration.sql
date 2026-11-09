CREATE TABLE website_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE,
  draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  enabled boolean NOT NULL DEFAULT false,
  published_revision_id uuid,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,user_id)
);
CREATE TABLE widget_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_id uuid NOT NULL,
  user_id text NOT NULL,
  number integer NOT NULL CHECK (number > 0),
  configuration jsonb NOT NULL,
  agent jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(widget_id,user_id) REFERENCES website_widgets(id,user_id) ON DELETE CASCADE,
  UNIQUE(widget_id,number),
  UNIQUE(id,widget_id,user_id)
);
ALTER TABLE website_widgets ADD CONSTRAINT website_widgets_published_revision_fk
  FOREIGN KEY(published_revision_id,id,user_id) REFERENCES widget_revisions(id,widget_id,user_id);
ALTER TABLE agent_conversations ADD COLUMN widget_revision_id uuid REFERENCES widget_revisions(id),
  ADD COLUMN visitor_name text, ADD COLUMN visitor_email text, ADD COLUMN page_origin text,
  ADD COLUMN customer_feedback text CHECK (customer_feedback IN ('helpful','unhelpful'));
CREATE TABLE widget_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_id uuid NOT NULL,
  user_id text NOT NULL,
  conversation_id uuid NOT NULL UNIQUE,
  token_hash text NOT NULL UNIQUE,
  site_origin text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id,user_id),
  FOREIGN KEY(widget_id,user_id) REFERENCES website_widgets(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(conversation_id,user_id) REFERENCES agent_conversations(id,user_id) ON DELETE CASCADE
);
CREATE INDEX widget_sessions_widget_created_idx ON widget_sessions(widget_id,created_at DESC);
CREATE TABLE widget_rate_limits (
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  used integer NOT NULL DEFAULT 1 CHECK (used > 0),
  PRIMARY KEY(bucket,window_start)
);
