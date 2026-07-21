INSERT INTO public.capabilities (category_id, category_label, category_icon, title, info, status, priority, position, completed_at)
VALUES
 ('lot13_payments_data','💳 Lot 13 — Paiements & data','credit-card','lemonsqueezy_checkout','Crée une session checkout Lemon Squeezy (BYOK lemonsqueezy_api_key + store_id).','done','P1',1, now()),
 ('lot13_payments_data','💳 Lot 13 — Paiements & data','credit-card','plaid_link_token','Crée un Plaid link_token pour onboarding banking (BYOK plaid_client_id + secret).','done','P1',2, now()),
 ('lot13_payments_data','💳 Lot 13 — Paiements & data','credit-card','shopify_product_create','Crée un produit Shopify via Admin REST (BYOK shopify_admin_token + shop_domain).','done','P1',3, now()),
 ('lot13_payments_data','💳 Lot 13 — Paiements & data','credit-card','webflow_cms_create','Crée un item Webflow CMS v2 (BYOK webflow_api_token).','done','P1',4, now()),
 ('lot13_payments_data','💳 Lot 13 — Paiements & data','credit-card','pinecone_upsert','Upsert vecteurs dans index Pinecone serverless (BYOK pinecone_api_key + host).','done','P1',5, now()),
 ('lot13_payments_data','💳 Lot 13 — Paiements & data','credit-card','sanity_mutate','Applique mutations Sanity create/patch/delete (BYOK sanity_api_token + project_id).','done','P1',6, now())
ON CONFLICT DO NOTHING;