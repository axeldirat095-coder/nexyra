UPDATE public.capabilities
SET status = 'done',
    completed_at = now(),
    info = 'Preview live HTML/CSS/JS dans une iframe sandboxée (sandbox="allow-scripts"). Éditeur 3 onglets (index.html / styles.css / script.js) avec persistance d''état partagée via SandboxContext. Auto-refresh debounced (250ms) + bouton Run pour rebuild manuel + bouton Reset. Console du sandbox ré-émise vers le parent via postMessage (prêt pour devtools). Le bouton "Appliquer" des blocs de code Elena injecte directement dans le bon fichier selon le langage détecté.'
WHERE category_id = 'code-sandbox'
  AND title ILIKE '%preview iframe%';