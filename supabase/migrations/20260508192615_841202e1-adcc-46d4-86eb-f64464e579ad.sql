-- Seed integration_catalog with missing API-key services used by lots 6-13
-- Idempotent via ON CONFLICT (slug)

INSERT INTO public.integration_catalog (slug, name, description, category, auth_type, required_secrets, docs_url, homepage_url, icon_url, brand_color, is_active, popularity)
VALUES
  ('openai', 'OpenAI', 'GPT, DALL·E, embeddings, gpt-image-1.', 'other', 'api_key', ARRAY['openai_api_key'], 'https://platform.openai.com/docs', 'https://openai.com', 'https://logo.clearbit.com/openai.com', '#10A37F', true, 95),
  ('mailchimp', 'Mailchimp', 'Email marketing, audiences, campagnes.', 'marketing', 'api_key', ARRAY['mailchimp_api_key'], 'https://mailchimp.com/developer/marketing/api/', 'https://mailchimp.com', 'https://logo.clearbit.com/mailchimp.com', '#FFE01B', true, 60),
  ('klaviyo', 'Klaviyo', 'Email + SMS automation pour e-commerce.', 'marketing', 'api_key', ARRAY['klaviyo_api_key'], 'https://developers.klaviyo.com', 'https://klaviyo.com', 'https://logo.clearbit.com/klaviyo.com', '#FF5800', true, 55),
  ('replicate', 'Replicate', 'Modèles IA hébergés (image, vidéo, audio).', 'other', 'api_key', ARRAY['replicate_api_token'], 'https://replicate.com/docs', 'https://replicate.com', 'https://logo.clearbit.com/replicate.com', '#000000', true, 50),
  ('fal', 'fal.ai', 'Génération image/vidéo IA ultra-rapide.', 'other', 'api_key', ARRAY['fal_api_key'], 'https://fal.ai/docs', 'https://fal.ai', 'https://logo.clearbit.com/fal.ai', '#7C3AED', true, 50),
  ('ideogram', 'Ideogram', 'Génération d''images IA (typographie excellente).', 'other', 'api_key', ARRAY['ideogram_api_key'], 'https://developer.ideogram.ai', 'https://ideogram.ai', 'https://logo.clearbit.com/ideogram.ai', '#EC4899', true, 40),
  ('cohere', 'Cohere', 'LLM + embeddings + rerank.', 'other', 'api_key', ARRAY['cohere_api_key'], 'https://docs.cohere.com', 'https://cohere.com', 'https://logo.clearbit.com/cohere.com', '#39594D', true, 40),
  ('mistral', 'Mistral AI', 'LLM open-weight européens.', 'other', 'api_key', ARRAY['mistral_api_key'], 'https://docs.mistral.ai', 'https://mistral.ai', 'https://logo.clearbit.com/mistral.ai', '#FA520F', true, 50),
  ('pinecone', 'Pinecone', 'Vector database managée pour RAG.', 'other', 'api_key', ARRAY['pinecone_api_key', 'pinecone_index_host'], 'https://docs.pinecone.io', 'https://pinecone.io', 'https://logo.clearbit.com/pinecone.io', '#1C17FF', true, 55),
  ('algolia', 'Algolia', 'Search-as-a-service haute performance.', 'other', 'api_key', ARRAY['algolia_app_id', 'algolia_admin_key'], 'https://www.algolia.com/doc/', 'https://algolia.com', 'https://logo.clearbit.com/algolia.com', '#003DFF', true, 50),
  ('apify', 'Apify', 'Scraping & automation cloud.', 'other', 'api_key', ARRAY['apify_api_token'], 'https://docs.apify.com', 'https://apify.com', 'https://logo.clearbit.com/apify.com', '#00B050', true, 35),
  ('exa', 'Exa', 'API de recherche web sémantique pour LLM.', 'other', 'api_key', ARRAY['exa_api_key'], 'https://docs.exa.ai', 'https://exa.ai', 'https://logo.clearbit.com/exa.ai', '#1F1F1F', true, 35),
  ('lemonsqueezy', 'Lemon Squeezy', 'Merchant of Record pour SaaS (paiements + TVA).', 'payment', 'api_key', ARRAY['lemonsqueezy_api_key', 'lemonsqueezy_store_id'], 'https://docs.lemonsqueezy.com', 'https://lemonsqueezy.com', 'https://logo.clearbit.com/lemonsqueezy.com', '#FFC233', true, 50),
  ('plaid', 'Plaid', 'Connexion comptes bancaires (Open Banking).', 'payment', 'api_key', ARRAY['plaid_client_id', 'plaid_secret'], 'https://plaid.com/docs', 'https://plaid.com', 'https://logo.clearbit.com/plaid.com', '#000000', true, 45),
  ('shopify_admin', 'Shopify Admin', 'API Admin Shopify (produits, commandes, clients).', 'other', 'api_key', ARRAY['shopify_admin_token', 'shopify_shop_domain'], 'https://shopify.dev/docs/api/admin', 'https://shopify.com', 'https://logo.clearbit.com/shopify.com', '#96BF48', true, 60),
  ('webflow', 'Webflow', 'CMS + sites no-code.', 'other', 'api_key', ARRAY['webflow_api_token'], 'https://developers.webflow.com', 'https://webflow.com', 'https://logo.clearbit.com/webflow.com', '#146EF5', true, 45),
  ('sanity', 'Sanity', 'Headless CMS structuré.', 'other', 'api_key', ARRAY['sanity_api_token', 'sanity_project_id', 'sanity_dataset'], 'https://www.sanity.io/docs', 'https://sanity.io', 'https://logo.clearbit.com/sanity.io', '#F03E2F', true, 40),
  ('vercel', 'Vercel', 'Déploiement frontend & serverless.', 'other', 'api_key', ARRAY['vercel_api_token'], 'https://vercel.com/docs/rest-api', 'https://vercel.com', 'https://logo.clearbit.com/vercel.com', '#000000', true, 70),
  ('github', 'GitHub', 'Repos, issues, PRs, Actions.', 'other', 'api_key', ARRAY['github_token'], 'https://docs.github.com/en/rest', 'https://github.com', 'https://logo.clearbit.com/github.com', '#181717', true, 80),
  ('sentry', 'Sentry', 'Monitoring d''erreurs applicatives.', 'analytics', 'api_key', ARRAY['sentry_dsn'], 'https://docs.sentry.io', 'https://sentry.io', 'https://logo.clearbit.com/sentry.io', '#362D59', true, 55),
  ('pagespeed', 'PageSpeed Insights', 'Audit perf Google (Core Web Vitals).', 'analytics', 'api_key', ARRAY['pagespeed_api_key'], 'https://developers.google.com/speed/docs/insights/v5/get-started', 'https://pagespeed.web.dev', 'https://logo.clearbit.com/google.com', '#4285F4', true, 35),
  ('cloudflare_r2', 'Cloudflare R2', 'Storage S3-compatible, zero egress fee.', 'storage', 'api_key', ARRAY['r2_endpoint', 'r2_access_key_id', 'r2_secret_access_key'], 'https://developers.cloudflare.com/r2/', 'https://www.cloudflare.com/products/r2/', 'https://logo.clearbit.com/cloudflare.com', '#F38020', true, 45),
  ('zapier', 'Zapier', 'Automatisations multi-apps via webhooks.', 'productivity', 'api_key', ARRAY['zapier_webhook_url'], 'https://zapier.com/help/create/code-webhooks/trigger-zaps-from-webhooks', 'https://zapier.com', 'https://logo.clearbit.com/zapier.com', '#FF4F00', true, 55),
  ('discord_webhook', 'Discord Webhook', 'Envoi de messages dans un channel Discord.', 'communication', 'api_key', ARRAY['discord_webhook_url'], 'https://support.discord.com/hc/en-us/articles/228383668', 'https://discord.com', 'https://logo.clearbit.com/discord.com', '#5865F2', true, 50)
ON CONFLICT (slug) DO UPDATE SET
  description = EXCLUDED.description,
  required_secrets = EXCLUDED.required_secrets,
  icon_url = COALESCE(public.integration_catalog.icon_url, EXCLUDED.icon_url),
  brand_color = COALESCE(public.integration_catalog.brand_color, EXCLUDED.brand_color),
  is_active = true,
  updated_at = now();

-- RPC : liste unifiée pour Elena (catalogue + statut clés user)
CREATE OR REPLACE FUNCTION public.list_user_integrations_unified()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _result jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'slug', c.slug,
    'name', c.name,
    'category', c.category,
    'auth_type', c.auth_type,
    'required_secrets', c.required_secrets,
    'docs_url', c.docs_url,
    'icon_url', c.icon_url,
    'brand_color', c.brand_color,
    'connected', EXISTS (
      SELECT 1 FROM public.external_keys ek
      WHERE ek.owner_id = _uid AND ek.is_active = true
        AND ek.service = ANY(c.required_secrets)
    ) OR EXISTS (
      SELECT 1 FROM public.project_integrations pi
      WHERE pi.owner_id = _uid AND pi.catalog_id = c.id
        AND pi.status IN ('connected','active')
    )
  ) ORDER BY c.popularity DESC, c.name)
  INTO _result
  FROM public.integration_catalog c
  WHERE c.is_active = true;

  RETURN COALESCE(_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_user_integrations_unified() TO authenticated;