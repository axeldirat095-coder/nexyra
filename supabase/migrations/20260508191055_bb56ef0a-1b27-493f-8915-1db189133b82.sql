INSERT INTO public.capabilities (category_id, category_label, category_icon, title, info, status, priority, position, completed_at)
VALUES
 ('lot12_automation','🔁 Lot 12 — Marketing & automation','workflow','mailchimp_subscribe','Upsert membre audience Mailchimp (BYOK mailchimp_api_key).','done','P1',1, now()),
 ('lot12_automation','🔁 Lot 12 — Marketing & automation','workflow','klaviyo_track','Event analytics Klaviyo server-side (BYOK klaviyo_api_key pk_).','done','P1',2, now()),
 ('lot12_automation','🔁 Lot 12 — Marketing & automation','workflow','discord_webhook','Post message canal Discord via webhook (BYOK discord_webhook_url).','done','P1',3, now()),
 ('lot12_automation','🔁 Lot 12 — Marketing & automation','workflow','notion_db_query','Query base Notion avec filter/sorts (BYOK notion_api_key).','done','P1',4, now()),
 ('lot12_automation','🔁 Lot 12 — Marketing & automation','workflow','airtable_upsert','Upsert records Airtable (BYOK airtable_api_key + base_id).','done','P1',5, now()),
 ('lot12_automation','🔁 Lot 12 — Marketing & automation','workflow','zapier_trigger','Déclenche un Zap via webhook (BYOK zapier_webhook_url).','done','P1',6, now())
ON CONFLICT DO NOTHING;