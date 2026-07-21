INSERT INTO public.capabilities (category_id, category_label, category_icon, title, info, status, priority)
SELECT v.category_id, v.category_label, v.category_icon, v.title, v.info, v.status::capability_status, v.priority::capability_priority
FROM (VALUES
  ('lot10', 'LOT 10 — Sync, messaging, search, storage', 'plug', 'Notion sync', 'Outil notion_create_page : crée pages dans Notion (BYOK notion_api_key).', 'done', 'P1'),
  ('lot10', 'LOT 10 — Sync, messaging, search, storage', 'plug', 'Linear issues', 'Outil linear_create_issue : crée des issues Linear via GraphQL (BYOK linear_api_key).', 'done', 'P1'),
  ('lot10', 'LOT 10 — Sync, messaging, search, storage', 'plug', 'Twilio SMS/WhatsApp', 'Outil twilio_send_sms : envoi SMS et WhatsApp (BYOK twilio_account_sid + twilio_auth_token).', 'done', 'P1'),
  ('lot10', 'LOT 10 — Sync, messaging, search, storage', 'plug', 'Resend emails transactionnels', 'Outil resend_email : envoi email transac via Resend (BYOK resend_api_key).', 'done', 'P1'),
  ('lot10', 'LOT 10 — Sync, messaging, search, storage', 'plug', 'Algolia search index', 'Outil algolia_index : indexe objets dans Algolia (BYOK algolia_app_id + algolia_admin_key).', 'done', 'P1'),
  ('lot10', 'LOT 10 — Sync, messaging, search, storage', 'plug', 'Cloudflare R2 storage', 'Outil r2_upload : upload S3 SigV4 vers Cloudflare R2 (BYOK r2_endpoint + r2_access_key_id + r2_secret_access_key).', 'done', 'P1')
) AS v(category_id, category_label, category_icon, title, info, status, priority)
WHERE NOT EXISTS (
  SELECT 1 FROM public.capabilities c WHERE c.category_id = v.category_id AND c.title = v.title
);