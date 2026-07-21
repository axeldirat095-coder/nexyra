
-- 1. Corriger les tâches déjà faites mais restées "todo"
UPDATE public.capabilities SET status='done', completed_at=now()
WHERE status='todo' AND title IN (
  'Connexion Google (OAuth)',
  'Mode clair / mode sombre (toggle)',
  'Balises Open Graph (partage Facebook/LinkedIn)',
  'Image de partage (OG image) générée',
  'Sitemap.xml + robots.txt',
  'Données structurées JSON-LD (SoftwareApplication)'
);

-- 2. Ajouter la catégorie "Agent autonome" — LE cœur produit manquant
INSERT INTO public.capabilities (category_id, category_label, category_icon, category_vision, title, info, status, priority, effort, position) VALUES
('agent', 'Agent autonome (Elena qui code)', 'Bot', 'Transformer Elena de chatbot avec mémoire en agent qui écrit, modifie et teste du code tout seul. C''est ce qui différencie Nexyra de ChatGPT et le met au niveau de Lovable / Cursor / v0.', 'Tool calling (function calling) sur tous les modèles', 'Permettre à Elena d''appeler des outils : write_file, read_file, run_command, search_code, etc. Base technique de tout le reste.', 'todo', 'P0', 'L', 1),
('agent', 'Agent autonome (Elena qui code)', 'Bot', NULL, 'Agent loop (pense → agit → observe → recommence)', 'Boucle autonome qui enchaîne plusieurs appels modèle jusqu''à ce que la tâche soit finie. Avec garde-fou anti-boucle infinie.', 'todo', 'P0', 'XL', 2),
('agent', 'Agent autonome (Elena qui code)', 'Bot', NULL, 'Pont chat ↔ sandbox (Elena écrit dans /dev)', 'Connexion entre la conversation Elena et l''arborescence Sandpack. Quand Elena dit "je crée App.tsx", le fichier apparaît vraiment.', 'todo', 'P0', 'L', 3),
('agent', 'Agent autonome (Elena qui code)', 'Bot', NULL, 'Planificateur (décompose une demande en sous-tâches)', 'Avant de coder, Elena génère un plan : étape 1, 2, 3... L''utilisateur peut valider ou modifier le plan.', 'todo', 'P1', 'M', 4),
('agent', 'Agent autonome (Elena qui code)', 'Bot', NULL, 'Outils fichiers (write/read/edit/delete)', 'Set d''outils côté serveur que l''agent peut appeler pour manipuler les fichiers du projet.', 'todo', 'P0', 'M', 5),
('agent', 'Agent autonome (Elena qui code)', 'Bot', NULL, 'Outil run_command (npm install, build, test)', 'Permet à l''agent de lancer des commandes dans le sandbox WebContainer et lire les sorties.', 'todo', 'P1', 'M', 6),
('agent', 'Agent autonome (Elena qui code)', 'Bot', NULL, 'Validation humaine avant action destructive', 'Pour delete, run, déploiement : Elena demande confirmation. Anti-désastre.', 'todo', 'P1', 'S', 7),
('agent', 'Agent autonome (Elena qui code)', 'Bot', NULL, 'Mémoire d''actions (historique des modifications)', 'Log de tout ce que l''agent a fait sur le projet. Permet undo, audit, et apprentissage.', 'todo', 'P1', 'M', 8);

-- 3. Compléter Qualité avec ce qui manque
INSERT INTO public.capabilities (category_id, category_label, category_icon, category_vision, title, info, status, priority, effort, position) VALUES
('quality', 'Qualité & Robustesse', 'Shield', NULL, 'Tests E2E (Playwright) sur parcours critiques', 'Auth, chat Elena, création projet, sandbox. Évite les régressions silencieuses.', 'todo', 'P2', 'L', 10),
('quality', 'Qualité & Robustesse', 'Shield', NULL, 'Monitoring uptime + alertes', 'Ping toutes les 5 min sur les routes clés. Alerte si down.', 'todo', 'P2', 'S', 11),
('quality', 'Qualité & Robustesse', 'Shield', NULL, 'Page de statut publique (status.nexyra.ai)', 'Transparence : afficher les incidents en cours et historique uptime.', 'todo', 'P2', 'M', 12);
