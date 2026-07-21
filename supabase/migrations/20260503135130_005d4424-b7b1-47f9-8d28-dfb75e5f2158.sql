UPDATE public.capabilities
SET status = 'done', completed_at = now(), updated_at = now(),
    info = 'Catalogue VIP de 30 services pré-cablés (Gmail, Stripe, Notion, Slack, LinkedIn, Calendar, Sheets, HubSpot, Discord, Telegram, Resend, Airtable, Twilio, Drive, Outlook, Calendly, Salesforce, PayPal, Asana, Trello, Pipedrive, Mixpanel, Twitter, Instagram, Facebook, Linear, PostHog, Google Analytics, Teams, Dropbox) avec icon_url Clearbit + brand_color hex. Elena utilise integration_browse pour explorer, integration_setup pour OAuth/API key, integration_call pour exécuter. Page /integrations affiche cartes premium avec logos couleur.'
WHERE id = '99718cc9-8486-49f5-b22e-341bc97eb160';

UPDATE public.capabilities
SET status = 'done', completed_at = now(), updated_at = now(),
    info = 'Tool universel call_external_api({url, method, body, headers, auth_from_slug, bearer_token}) ajouté dans integration-tools.server.ts. Permet à Elena d appeler N IMPORTE QUELLE API REST publique sans intégration manuelle (10000+ APIs). Auth flexible : réutilise un token déjà connecté via auth_from_slug, accepte un bearer inline pour test, ou call public sans auth. Sécurisé : anti-SSRF (bloque IPs privées/localhost), timeout 25s, body 64KB max, réponse tronquée à 8KB. Auto-inclus dans le pool de tools dès iter > 0.'
WHERE id = 'a4b494f6-ddc6-4b12-9c00-28124a1d87c3';