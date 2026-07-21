-- Registry des serveurs MCP par projet
CREATE TABLE public.project_mcp_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  auth_kind text NOT NULL DEFAULT 'none' CHECK (auth_kind IN ('none','bearer','header')),
  auth_header_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','error')),
  last_error text,
  last_tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  tools_count int NOT NULL DEFAULT 0,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

CREATE INDEX idx_mcp_servers_project ON public.project_mcp_servers(project_id);

ALTER TABLE public.project_mcp_servers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own MCP servers"
ON public.project_mcp_servers
FOR ALL
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

CREATE TRIGGER mcp_servers_set_updated_at
BEFORE UPDATE ON public.project_mcp_servers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Table séparée pour les jetons (isolation des secrets)
CREATE TABLE public.project_mcp_tokens (
  server_id uuid PRIMARY KEY REFERENCES public.project_mcp_servers(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_mcp_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own MCP tokens"
ON public.project_mcp_tokens
FOR ALL
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

CREATE TRIGGER mcp_tokens_set_updated_at
BEFORE UPDATE ON public.project_mcp_tokens
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Marque la capacité comme done
UPDATE public.capabilities
SET status = 'done',
    completed_at = now(),
    info = 'Client MCP Streamable HTTP embarqué côté serveur Elena. Registry par projet (project_mcp_servers + project_mcp_tokens isolés). 4 tools : mcp_connect (enregistre + handshake initialize/tools/list), mcp_list_servers (vue projet), mcp_list_tools (schémas exposés), mcp_call (exécute JSON-RPC tools/call). Auth flexible : bearer token ou header custom. Sécurisé : anti-SSRF, timeout 25s, réponse tronquée 8KB, signaux UI émis. Elena peut se brancher à NIMPORTE QUEL serveur MCP (Notion, Linear, Sentry, Supabase, custom) — ouvre l ecosystème MCP au projet.'
WHERE id = '3c4610c6-b2fa-4ef6-a1b7-ade67cfa1b0a';