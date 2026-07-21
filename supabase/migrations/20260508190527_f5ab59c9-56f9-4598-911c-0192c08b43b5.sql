INSERT INTO public.capabilities (category_id, category_label, category_icon, title, info, status, priority)
SELECT v.category_id, v.category_label, v.category_icon, v.title, v.info, v.status::capability_status, v.priority::capability_priority
FROM (VALUES
  ('lot11', 'LOT 11 — CRM, scheduling, analytics, dev-ops', 'workflow', 'HubSpot CRM contact', 'Outil hubspot_contact_create : crée/upsert contacts HubSpot (BYOK hubspot_private_token).', 'done', 'P1'),
  ('lot11', 'LOT 11 — CRM, scheduling, analytics, dev-ops', 'workflow', 'Calendly event types', 'Outil calendly_event_types : liste les URLs de réservation Calendly (BYOK calendly_api_key).', 'done', 'P1'),
  ('lot11', 'LOT 11 — CRM, scheduling, analytics, dev-ops', 'workflow', 'PostHog analytics capture', 'Outil posthog_capture : envoi event analytics (BYOK posthog_api_key, opt posthog_host).', 'done', 'P1'),
  ('lot11', 'LOT 11 — CRM, scheduling, analytics, dev-ops', 'workflow', 'Slack message', 'Outil slack_send_message : poste message via chat.postMessage (BYOK slack_bot_token).', 'done', 'P1'),
  ('lot11', 'LOT 11 — CRM, scheduling, analytics, dev-ops', 'workflow', 'GitHub PR auto', 'Outil github_pr_create : ouvre une Pull Request GitHub (BYOK github_token, scope repo).', 'done', 'P1'),
  ('lot11', 'LOT 11 — CRM, scheduling, analytics, dev-ops', 'workflow', 'Vercel env vars', 'Outil vercel_env_set : upsert variable env Vercel (BYOK vercel_api_token).', 'done', 'P1')
) AS v(category_id, category_label, category_icon, title, info, status, priority)
WHERE NOT EXISTS (
  SELECT 1 FROM public.capabilities c WHERE c.category_id = v.category_id AND c.title = v.title
);