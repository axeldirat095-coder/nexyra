-- Roadmap V2 : 10 capabilities pour piloter cette session
-- (Catégorie "agent-v2" = boost Elena niveau Lovable)
INSERT INTO public.capabilities (
  category_id, category_label, category_icon, category_vision,
  title, info, status, priority, effort, files, position
) VALUES
('agent-v2', 'Roadmap V2 — Elena Lovable-grade', 'rocket',
 'Pousser Elena au niveau Lovable : multi-providers, RAG auto, mémoire enrichie, workspace split, import projets externes.',
 'Provider Codex câblé',
 'Ajouter Codex (OpenAI Codex via abonnement) dans Settings + serveur agent. Permet à l''utilisateur d''utiliser ses crédits Codex sans repasser par OpenAI standard.',
 'in_progress', 'P0', 'S',
 ARRAY['src/components/settings/sections.tsx','src/routes/api/elena-agent.ts'], 1),

('agent-v2', 'Roadmap V2 — Elena Lovable-grade', 'rocket', NULL,
 'Boost perfs Elena (gpt-5.2 + reasoning auto)',
 'Détection automatique de complexité de la demande. Si tâche complexe → escalade vers gpt-5.2 avec reasoning effort=high. Sinon reste sur gpt-5-mini économique.',
 'in_progress', 'P0', 'M',
 ARRAY['src/routes/api/elena-agent.ts'], 2),

('agent-v2', 'Roadmap V2 — Elena Lovable-grade', 'rocket', NULL,
 'Auto-RAG project_docs',
 'Avant chaque réponse Elena, recherche sémantique automatique dans project_docs (RAG). Le contexte projet pertinent est injecté dans le prompt système. Améliore drastiquement la pertinence.',
 'in_progress', 'P0', 'M',
 ARRAY['src/routes/api/elena-agent.ts','src/server/embeddings.server.ts'], 3),

('agent-v2', 'Roadmap V2 — Elena Lovable-grade', 'rocket', NULL,
 'Layout /dev split 40/60 Lovable-like',
 'Refonte du DevWorkspace : chat Elena permanent à gauche (40%), preview live à droite (60%), resizable. Fini le toggle, tout est visible en permanence.',
 'in_progress', 'P0', 'L',
 ARRAY['src/components/DevWorkspace.tsx'], 4),

('agent-v2', 'Roadmap V2 — Elena Lovable-grade', 'rocket', NULL,
 'Import projet externe (ZIP)',
 'Drag-drop d''un fichier ZIP (export TopChef ou autre projet Lovable). Parsing automatique → extraction structure + fichiers clés → indexation dans project_docs. Elena comprend le projet importé.',
 'in_progress', 'P1', 'M',
 ARRAY['src/components/sandbox/ImportProjectDialog.tsx','src/routes/api/import-project.ts'], 5),

('agent-v2', 'Roadmap V2 — Elena Lovable-grade', 'rocket', NULL,
 'Import projet externe (URL GitHub)',
 'Coller une URL de repo GitHub public → fetch tarball → indexation automatique dans project_docs. Alternative au ZIP pour les repos open-source.',
 'in_progress', 'P1', 'M',
 ARRAY['src/components/sandbox/ImportProjectDialog.tsx','src/routes/api/import-project.ts'], 6),

('agent-v2', 'Roadmap V2 — Elena Lovable-grade', 'rocket', NULL,
 'Mémoire seed Nexyra + TopChef',
 'Pré-remplir project_docs du projet Nexyra avec : vision (B2B boîte à pizza clé en main), modules TopChef (recettes, prospection, FDJ, Vinted, agents IA), philosophie produit. Elena démarre déjà au courant.',
 'in_progress', 'P1', 'S',
 ARRAY['src/routes/api/seed-memory.ts'], 7),

('agent-v2', 'Roadmap V2 — Elena Lovable-grade', 'rocket', NULL,
 'Outils Elena : web_search + read_url',
 'Ajouter 2 nouveaux outils à l''agent : web_search (via Lovable AI Gateway) pour recherches en temps réel, et read_url (via Firecrawl déjà connecté) pour lire/scraper une URL précise.',
 'in_progress', 'P1', 'M',
 ARRAY['src/server/agent-tools.server.ts','src/routes/api/elena-agent.ts'], 8),

('agent-v2', 'Roadmap V2 — Elena Lovable-grade', 'rocket', NULL,
 'Mémoire user enrichie',
 'Mettre à jour mem://~user.md avec la philosophie captée (mâcher le travail, marges faibles × volume, anti-frictions, anti-surconsommation, modularité). Persiste entre sessions.',
 'in_progress', 'P2', 'S',
 ARRAY['mem://~user.md'], 9),

('agent-v2', 'Roadmap V2 — Elena Lovable-grade', 'rocket', NULL,
 'Tableau de pilotage Roadmap V2',
 'Cette section "agent-v2" elle-même : visible dans /capabilities pour suivre l''avancement de cette refonte. Permet de voir d''un coup d''œil ce qui est fait/à faire.',
 'done', 'P0', 'S',
 ARRAY['src/routes/capabilities.tsx'], 0);