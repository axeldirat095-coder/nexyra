UPDATE public.capabilities
SET status = 'done',
    completed_at = now(),
    info = 'Connecteur Firecrawl branché via Lovable Connectors (clé FIRECRAWL_API_KEY gérée côté serveur). Endpoint POST /api/scrape proxy les 4 méthodes (scrape, search, map, crawl) avec validation auth Supabase. Panneau "Scraper" dans le header de /dev ouvre une modal de test rapide (URL → markdown, requête → résultats web, URL → sitemap). Clé jamais exposée au client. Inspiration TopChef : 1 action UI = workflow complet.'
WHERE category_id = 'integrations'
  AND (title ILIKE '%Firecrawl%' OR title ILIKE '%scraping%');