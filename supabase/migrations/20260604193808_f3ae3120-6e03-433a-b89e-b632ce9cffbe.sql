
-- 1. Table category_prompts (1 prompt précis et éditable par catégorie)
CREATE TABLE public.category_prompts (
  category_id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_prompts TO authenticated;
GRANT ALL ON public.category_prompts TO service_role;

ALTER TABLE public.category_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_category_prompts" ON public.category_prompts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_write_category_prompts" ON public.category_prompts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER category_prompts_set_updated_at
  BEFORE UPDATE ON public.category_prompts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.category_prompts;

-- 2. Réécriture des 10 cartes preview_sandbox en langage Elena (simple, business)
UPDATE public.capabilities SET info = $$BUG ACTUEL : quand un user importe un projet lourd depuis GitHub (ex: Nexyra clone, ~400 dépendances), le "npm install" dans la sandbox E2B prend 4-5 min et timeout. Résultat : preview KO.

SOLUTION : créer un template E2B "nexyra-vite-preinstalled" qui a déjà toutes les ~400 deps standards installées (TanStack, Vite, React, Tailwind, shadcn). Comme ça, à l'import, on saute le npm install = preview en <10s au lieu de 5min.

LIVRABLE : 1 Dockerfile dans sandbox/Dockerfile.nexyra-vite + template publié sur le compte E2B (via CLI sur la machine du user, pas en sandbox). À la fin : nom du template à utiliser dans Sandbox.create().$$ WHERE id = '91697af0-9277-483e-8798-97a28a34428a';

UPDATE public.capabilities SET info = $$Une fois le template publié, modifier 1 ligne dans e2b-sandbox.server.ts : Sandbox.create("nexyra-vite-preinstalled"). MAIS avec try/catch fallback sur le template "base" actuel si le custom n'existe pas. RÈGLE D'OR : zéro régression. Si template absent → comportement actuel inchangé.$$ WHERE id = '36e76956-6170-4b34-98e2-905841b6fe8a';

UPDATE public.capabilities SET info = $$Aujourd'hui, à chaque ouverture d'un projet, on re-télécharge tous les fichiers depuis GitHub + re-npm install. C'est gâché. SOLUTION : monter un volume E2B persistant par projet (ou snapshot sandbox) → 2e ouverture quasi instantanée. Vérifier le SHA git pour ne re-télécharger QUE si le code a changé.$$ WHERE id = '39a5b46d-13f8-498d-80a3-1461ece08b3d';

UPDATE public.capabilities SET info = $$Lire package.json AVANT de lancer l'install. Si projet lourd (>300 deps) → utiliser template pré-installé. Si projet léger (<50 deps) → npm install standard rapide. Évite de gaspiller des ressources sur les petits projets.$$ WHERE id = '4e80a78b-b0b7-4ef0-8b1e-9cfeca57567f';

UPDATE public.capabilities SET info = $$Aujourd'hui l'user voit juste "Installation..." pendant 4 min sans rien. UX horrible. Streamer le stdout/stderr de npm install dans le WorkspaceTerminal en temps réel → il voit où ça bloque, il comprend ce qui se passe.$$ WHERE id = '2c67d57c-698a-4b50-a0e9-6fd1f3396b38';

UPDATE public.capabilities SET info = $$Si npm install plante (lock désynchronisé, OOM), retry auto : tentative 1 = rm package-lock.json + npm install --legacy-peer-deps. Tentative 2 = fallback bun install. Logger chaque essai pour debug. Aujourd'hui : 1 échec = sandbox morte, user doit tout refaire.$$ WHERE id = '8efc49f1-bd76-4800-958d-32a23d3a814f';

UPDATE public.capabilities SET info = $$L'user a confirmé : SES fichiers exportés vers GitHub sont OK. Le bug n'est PAS dans l'export, c'est dans l'install à la réouverture. Mais documenter quand même : vérifier que l'export inclut package.json + lockfile + .env.example + README. Rassure l'user et facilite l'onboarding nouveaux devs.$$ WHERE id = '7de08d33-b044-4f46-8a6a-3d790b1946e2';

UPDATE public.capabilities SET info = $$Astuce Lovable : Vite peut démarrer dès que les 3 deps critiques (vite, react, react-dom) sont là. Lancer "vite dev" en parallèle du "npm install" du reste. Résultat : preview visible 5x plus vite (hot reload arrive quand les autres deps finissent d'installer).$$ WHERE id = 'b49bdec1-2eea-40f1-8c8e-039c7d397dec';

UPDATE public.capabilities SET info = $$Détecter sandbox "morte" (timeout, OOM, crashed) et la remplacer auto. Aujourd'hui l'user doit fermer/rouvrir le projet. Ajouter endpoint /api/sandbox-health + bouton visible "Redémarrer sandbox" dans WorkspacePreview.$$ WHERE id = 'ecae0ce2-474b-4bf8-99b4-c4dc55d481b5';

UPDATE public.capabilities SET info = $$Une sandbox E2B coûte ~$0.10/h CPU + RAM. Si user laisse 10 projets ouverts toute la nuit = $24/jour de perte. Tracker temps CPU+RAM par projet, afficher dans ProjectBudgetCard, alerter si >$0.50/h. Auto-kill sandbox idle >15min.$$ WHERE id = '8b226fa9-a8d8-467b-a84d-34214f738a4c';

-- 3. Seed du prompt précis pour preview_sandbox
INSERT INTO public.category_prompts (category_id, prompt) VALUES (
  'preview_sandbox',
$$# CHANTIER NEXYRA — Preview / Sandbox E2B
**(Prompt de passation pour Elena — à coller tel quel dans le chat Nexyra)**

## CONTEXTE BUSINESS
Quand un utilisateur importe un projet depuis GitHub dans Nexyra (ex: clone Nexyra lui-même, ~400 dépendances), la sandbox E2B lance "npm install" et timeout au bout de 4-5 minutes. La preview ne s'affiche jamais. C'est LE bug bloquant qui empêche d'utiliser Nexyra sur de vrais projets.

OBJECTIF FINAL : atteindre la parité Lovable.
- 1ʳᵉ preview d'un projet importé : <10 secondes (vs 5 min aujourd'hui)
- Réouvertures suivantes : <3 secondes
- Zéro timeout npm install
- Recovery auto si sandbox crash

## ARCHITECTURE TECHNIQUE
- Sandbox = E2B (https://e2b.dev) — VMs Docker éphémères
- Fichiers concernés :
  - `src/server/e2b-sandbox.server.ts` (création sandbox)
  - `src/lib/github.functions.ts` (import GitHub)
  - `src/routes/api/import-project.ts` (endpoint import)
  - `src/components/workspace/WorkspaceTerminal.tsx` (affichage logs)
  - `src/components/workspace/WorkspacePreview.tsx` (iframe preview)
  - NOUVEAU : `sandbox/Dockerfile.nexyra-vite` (template custom)

## RÈGLE D'OR
**Chaque modif DOIT avoir un fallback sur le comportement actuel.** Si le template custom n'est pas publié, le code retombe sur le template "base" E2B. Aucune régression tolérée.

## CHANTIER EN 4 LOTS (à livrer dans l'ordre)

### LOT 1 — P0 — Template E2B pré-installé (le gros gain)
1. Écrire `sandbox/Dockerfile.nexyra-vite` : Node 20 + npm install de TanStack Start + Vite + React + Tailwind + shadcn (~400 deps standards Nexyra).
2. Demander à l'user de publier le template depuis SA machine (CLI e2b, clé API user déjà en secret). Lui donner la commande exacte à coller dans son terminal.
3. Modifier `e2b-sandbox.server.ts` : `Sandbox.create("nexyra-vite-preinstalled")` dans un try/catch avec fallback sur "base". 1 seule ligne de logique en plus.
4. Tester import projet lourd (Nexyra clone) ET projet léger (vite minimal).

### LOT 2 — P1 — UX install transparente
5. Streamer stdout/stderr de npm install dans WorkspaceTerminal (temps réel, pas un "Installation..." figé).
6. Retry intelligent : si npm install échoue, tentative 2 = rm lockfile + --legacy-peer-deps, tentative 3 = bun install. Logger chaque essai.
7. Détection projets lourds vs légers (lire package.json avant install).
8. Doc export GitHub : check qu'export inclut tout (rassurer user, le bug n'est pas là).

### LOT 3 — P1 — Persistance entre sessions
9. Snapshot E2B ou volume persistant par projet. À la réouverture, recharger fichiers depuis GitHub uniquement si SHA git a changé. Cible : 2e ouverture <3s.

### LOT 4 — P2 — Robustesse & coûts
10. Lazy install : démarrer "vite dev" dès que vite+react+react-dom installés, npm install continue en parallèle.
11. Health check sandbox + bouton "Redémarrer sandbox" dans WorkspacePreview.
12. Monitoring coûts E2B par projet, auto-kill sandbox idle >15min, alerte si >$0.50/h.

## POUR CHAQUE LIGNE LIVRÉE
- Tester avec un projet lourd ET un projet léger (zéro régression).
- Passer la ligne en `status='done'` dans `capabilities` + réécrire son `info` (1 phrase business).
- Pas de nouvelle dépendance npm sans justification écrite.
- Privilégier Lovable Cloud / Lovable AI Gateway avant toute brique externe.

## CRITÈRE DE FIN
Import du clone Nexyra (~400 deps) depuis GitHub → preview visible en <10s à la 1ʳᵉ ouverture, <3s aux suivantes. Sandbox idle auto-kill après 15min. Coût visible dans ProjectBudgetCard.$$
);
