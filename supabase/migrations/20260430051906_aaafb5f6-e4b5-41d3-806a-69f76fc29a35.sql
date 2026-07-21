
-- Mapping slug -> domaine officiel pour Google Favicons (haute résolution)
WITH domains(slug, domain) AS (VALUES
  ('gmail','gmail.com'),
  ('outlook','outlook.com'),
  ('resend','resend.com'),
  ('sendgrid','sendgrid.com'),
  ('mailchimp','mailchimp.com'),
  ('stripe','stripe.com'),
  ('paypal','paypal.com'),
  ('square','squareup.com'),
  ('hubspot','hubspot.com'),
  ('salesforce','salesforce.com'),
  ('pipedrive','pipedrive.com'),
  ('airtable','airtable.com'),
  ('slack','slack.com'),
  ('discord','discord.com'),
  ('telegram','telegram.org'),
  ('whatsapp','whatsapp.com'),
  ('teams','microsoft.com'),
  ('notion','notion.so'),
  ('google_sheets','sheets.google.com'),
  ('google_docs','docs.google.com'),
  ('google_drive','drive.google.com'),
  ('dropbox','dropbox.com'),
  ('onedrive','onedrive.live.com'),
  ('google_calendar','calendar.google.com'),
  ('calendly','calendly.com'),
  ('cal_com','cal.com'),
  ('twitter','twitter.com'),
  ('linkedin','linkedin.com'),
  ('facebook','facebook.com'),
  ('instagram','instagram.com'),
  ('youtube','youtube.com'),
  ('tiktok','tiktok.com'),
  ('zapier','zapier.com'),
  ('make','make.com'),
  ('n8n','n8n.io'),
  ('shopify','shopify.com'),
  ('woocommerce','woocommerce.com'),
  ('google_analytics','analytics.google.com'),
  ('mixpanel','mixpanel.com'),
  ('amplitude','amplitude.com'),
  ('posthog','posthog.com'),
  ('intercom','intercom.com'),
  ('zendesk','zendesk.com'),
  ('freshdesk','freshdesk.com'),
  ('asana','asana.com'),
  ('trello','trello.com'),
  ('linear','linear.app'),
  ('jira','atlassian.com'),
  ('github','github.com'),
  ('gitlab','gitlab.com')
)
UPDATE public.integration_catalog c
SET icon_url = 'https://www.google.com/s2/favicons?sz=128&domain=' || d.domain
FROM domains d
WHERE c.slug = d.slug;

-- Pour tout slug non listé, fallback générique sur le slug.com
UPDATE public.integration_catalog
SET icon_url = 'https://www.google.com/s2/favicons?sz=128&domain=' || replace(slug,'_','') || '.com'
WHERE icon_url IS NULL OR icon_url LIKE '%clearbit%';
