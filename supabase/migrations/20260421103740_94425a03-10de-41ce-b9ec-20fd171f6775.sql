UPDATE public.capabilities
SET status = 'done',
    completed_at = now(),
    info = 'Drawer "Déployer" intégré dans la barre Preview : 3 cibles 1-clic (Netlify Drop recommandé, Vercel, Cloudflare Pages). Génère automatiquement un ZIP avec config SPA dédiée par plateforme (netlify.toml, vercel.json, _redirects) puis ouvre la page de déploiement de la plateforme. Mode React inclut un DEPLOY.md avec instructions de build. Aucun OAuth requis, aucun token utilisateur — fonctionne immédiatement.'
WHERE category_id = 'sandbox-generation'
  AND title ILIKE '%déploiement 1-clic%';