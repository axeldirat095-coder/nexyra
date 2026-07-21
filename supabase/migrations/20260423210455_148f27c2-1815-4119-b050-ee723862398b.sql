-- Sync /capabilities après Vagues 1+2 (et préparation Vague 3)
-- Vague 1 (Survie) : routing intelligent + image_edit + onboarding + ask_user + snapshots logiques
-- Vague 2 (Confort) : auto-retry build (déjà présent), diff preview (déjà présent), ui_signals frontend, build_check tool
-- Vague 3 (Polish — partiel) : inspiration_lookup tool (patterns UI premium internes)

UPDATE public.capabilities
SET status = 'done', completed_at = now()
WHERE id IN (
  'bf1b3e6d-d012-4885-bd39-c17c2de6e9dc', -- Auto-retry sur erreur de build
  '221ac637-2c0c-41d3-816c-7c58a9ba1dd4', -- Streaming live des étapes
  '170fa819-61b5-4f8f-96e9-1d0443f53a7d', -- Undo / rollback session agent
  '215744ac-50f2-491c-afa9-2f25d0d944b7', -- Auto-bascule mode React/Vanilla
  '60448cf8-cc8d-46d0-b6f4-458d0cbe2556', -- Diff preview avant application
  '92d72065-821b-4293-aee1-92cdc45eca43', -- Onboarding projet (questions guidées)
  'db9fdd27-4e48-4588-930b-611720a7d8cc', -- Snapshot automatique après chaque tour agent
  '70e02cd4-6928-42df-ae7d-c6ae8d3bf359', -- Fallback automatique provider down
  '6f25c7ca-52be-41ea-8e2c-a79dc21da2cd'  -- Auto-sync tableau /capabilities
);

-- Vague 3 partiellement livrée (inspiration_lookup tool dispo, variants pas encore intégrés en UI)
UPDATE public.capabilities
SET status = 'in_progress', started_at = COALESCE(started_at, now())
WHERE id IN (
  '73523bd8-ed45-4ecb-b572-9cbf670ca3c6', -- Variants premium auto sur shadcn
  '26a0c92d-1765-4f9c-a09b-67edbe2b2b4f'  -- Auto-QA visuelle en fin de génération
);