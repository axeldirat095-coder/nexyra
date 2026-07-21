UPDATE public.capabilities
SET status = 'done',
    completed_at = now(),
    info = 'Audit a11y initial : aria-label sur navigation admin, aria-current="page" sur l''item actif, role="status" + aria-label sur les loaders Suspense. Base solide pour navigation clavier + lecteurs d''écran. Audits Lighthouse a11y à itérer sur chaque nouvelle route.'
WHERE category_id = 'quality'
  AND title ILIKE '%accessibilit%';

UPDATE public.capabilities
SET status = 'done',
    completed_at = now(),
    info = 'Code-splitting des routes lourdes : /dev (DevWorkspace + sandpack + jszip) et /admin (5 sections charts/tables) chargées en lazy() + Suspense. Bundle initial allégé → premier paint plus rapide sur landing/auth/capabilities. Loaders accessibles (role=status, aria-label).'
WHERE category_id = 'quality'
  AND title ILIKE '%performance%';