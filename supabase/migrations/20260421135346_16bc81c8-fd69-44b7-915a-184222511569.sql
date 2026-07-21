-- Déplacer pgvector du schéma public vers extensions (best practice Supabase)
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION vector SET SCHEMA extensions;

-- Mettre extensions dans le search_path par défaut pour que `vector(1536)` reste accessible
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;