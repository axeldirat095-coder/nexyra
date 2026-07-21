CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.github_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  github_user_id BIGINT NOT NULL,
  github_username TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX idx_github_connections_user ON public.github_connections(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.github_connections TO authenticated;
GRANT ALL ON public.github_connections TO service_role;

ALTER TABLE public.github_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own github connection"
  ON public.github_connections FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own github connection"
  ON public.github_connections FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own github connection"
  ON public.github_connections FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete their own github connection"
  ON public.github_connections FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_github_connections_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_github_connections_updated_at
  BEFORE UPDATE ON public.github_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_github_connections_updated_at();

-- OAuth state table (CSRF protection for the OAuth flow)
CREATE TABLE public.github_oauth_states (
  state TEXT NOT NULL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '15 minutes')
);

CREATE INDEX idx_github_oauth_states_user ON public.github_oauth_states(user_id);
CREATE INDEX idx_github_oauth_states_expires ON public.github_oauth_states(expires_at);

GRANT SELECT, INSERT, DELETE ON public.github_oauth_states TO authenticated;
GRANT ALL ON public.github_oauth_states TO service_role;

ALTER TABLE public.github_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own oauth states"
  ON public.github_oauth_states FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
