ALTER TABLE public.integration_catalog
  ADD COLUMN IF NOT EXISTS icon_url text,
  ADD COLUMN IF NOT EXISTS brand_color text;

COMMENT ON COLUMN public.integration_catalog.icon_url IS 'URL publique du logo officiel (PNG/SVG carré). Convention : https://logo.clearbit.com/{domain} pour les marques connues.';
COMMENT ON COLUMN public.integration_catalog.brand_color IS 'Couleur de marque hex (#RRGGBB) pour les fallbacks visuels.';

-- Remplit les logos pour les 30 intégrations VIP existantes (Clearbit fournit des PNG haute déf gratuits par domaine)
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/gmail.com', brand_color = '#EA4335' WHERE slug = 'gmail';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/resend.com', brand_color = '#000000' WHERE slug = 'resend';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/sendgrid.com', brand_color = '#1A82E2' WHERE slug = 'sendgrid';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/mailchimp.com', brand_color = '#FFE01B' WHERE slug = 'mailchimp';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/stripe.com', brand_color = '#635BFF' WHERE slug = 'stripe';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/paypal.com', brand_color = '#003087' WHERE slug = 'paypal';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/lemonsqueezy.com', brand_color = '#FFC233' WHERE slug = 'lemonsqueezy';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/hubspot.com', brand_color = '#FF7A59' WHERE slug = 'hubspot';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/salesforce.com', brand_color = '#00A1E0' WHERE slug = 'salesforce';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/pipedrive.com', brand_color = '#1A1A1A' WHERE slug = 'pipedrive';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/airtable.com', brand_color = '#FCB400' WHERE slug = 'airtable';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/slack.com', brand_color = '#4A154B' WHERE slug = 'slack';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/discord.com', brand_color = '#5865F2' WHERE slug = 'discord';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/telegram.org', brand_color = '#0088CC' WHERE slug = 'telegram';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/twilio.com', brand_color = '#F22F46' WHERE slug = 'twilio';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/notion.so', brand_color = '#000000' WHERE slug = 'notion';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/linear.app', brand_color = '#5E6AD2' WHERE slug = 'linear';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/asana.com', brand_color = '#F06A6A' WHERE slug = 'asana';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/trello.com', brand_color = '#0079BF' WHERE slug = 'trello';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/monday.com', brand_color = '#FF3D57' WHERE slug = 'monday';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/github.com', brand_color = '#181717' WHERE slug = 'github';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/gitlab.com', brand_color = '#FC6D26' WHERE slug = 'gitlab';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/linkedin.com', brand_color = '#0A66C2' WHERE slug = 'linkedin';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/x.com', brand_color = '#000000' WHERE slug IN ('twitter','x');
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/facebook.com', brand_color = '#1877F2' WHERE slug = 'facebook';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/instagram.com', brand_color = '#E4405F' WHERE slug = 'instagram';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/tiktok.com', brand_color = '#000000' WHERE slug = 'tiktok';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/youtube.com', brand_color = '#FF0000' WHERE slug = 'youtube';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/google.com', brand_color = '#4285F4' WHERE slug IN ('google_calendar','google_sheets','google_drive','google_docs');
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/calendly.com', brand_color = '#006BFF' WHERE slug = 'calendly';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/dropbox.com', brand_color = '#0061FF' WHERE slug = 'dropbox';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/posthog.com', brand_color = '#1D4AFF' WHERE slug = 'posthog';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/mixpanel.com', brand_color = '#7856FF' WHERE slug = 'mixpanel';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/segment.com', brand_color = '#52BD94' WHERE slug = 'segment';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/zapier.com', brand_color = '#FF4A00' WHERE slug = 'zapier';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/make.com', brand_color = '#6D00CC' WHERE slug = 'make';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/shopify.com', brand_color = '#7AB55C' WHERE slug = 'shopify';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/zoom.us', brand_color = '#2D8CFF' WHERE slug = 'zoom';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/openai.com', brand_color = '#412991' WHERE slug = 'openai';
UPDATE public.integration_catalog SET icon_url = 'https://logo.clearbit.com/anthropic.com', brand_color = '#D4A574' WHERE slug = 'anthropic';