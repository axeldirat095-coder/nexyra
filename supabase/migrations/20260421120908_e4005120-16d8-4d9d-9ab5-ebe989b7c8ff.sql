UPDATE public.capabilities
SET status = 'done',
    completed_at = now(),
    info = 'Clé Hugging Face stockée chiffrée (table api_keys, RPC set_api_key/get_api_key_decrypted). UI Settings → Clés API : ajout, test (ping /api/whoami-v2), suppression. Intégrée au système de fallback comme provider optionnel. Idéal pour modèles open-source à la demande sans coût fixe.'
WHERE category_id = 'integrations'
  AND title ILIKE '%Hugging%';

UPDATE public.capabilities
SET status = 'done',
    completed_at = now(),
    info = 'Clé Replicate stockée chiffrée (table api_keys, RPC set_api_key/get_api_key_decrypted). UI Settings → Clés API : ajout, test (ping /v1/account), suppression. Disponible pour générations image/vidéo à la seconde GPU via /api/test-provider-key. Pas de coût fixe — paiement à l''usage.'
WHERE category_id = 'integrations'
  AND title ILIKE '%Replicate%';