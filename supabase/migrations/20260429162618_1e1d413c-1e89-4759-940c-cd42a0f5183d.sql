CREATE OR REPLACE FUNCTION public.seed_default_pilot_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_categories jsonb;
  v_cat jsonb;
  v_pos int := 0;
BEGIN
  -- Pas de seed si déjà des catégories (évite double-insertion)
  IF EXISTS (SELECT 1 FROM public.pilot_categories WHERE project_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_categories := CASE NEW.type::text
    WHEN 'mobile' THEN jsonb_build_array(
      jsonb_build_object('title', '🎯 Vision & cadrage', 'icon', '🎯', 'description', 'Définir le pourquoi et les utilisateurs cibles de l''app mobile.'),
      jsonb_build_object('title', '🎨 Design mobile', 'icon', '🎨', 'description', 'Maquettes, design system, navigation native iOS/Android.'),
      jsonb_build_object('title', '⚙️ Build', 'icon', '⚙️', 'description', 'Implémentation des écrans, navigation, intégration backend.'),
      jsonb_build_object('title', '🚀 Lancement', 'icon', '🚀', 'description', 'Tests, soumission stores, marketing de lancement.')
    )
    WHEN 'webapp' THEN jsonb_build_array(
      jsonb_build_object('title', '🎯 Vision & cadrage', 'icon', '🎯', 'description', 'Définir le problème résolu et les utilisateurs cibles.'),
      jsonb_build_object('title', '🎨 Design produit', 'icon', '🎨', 'description', 'Wireframes, design system, parcours utilisateur.'),
      jsonb_build_object('title', '⚙️ Build', 'icon', '⚙️', 'description', 'Pages, composants, base de données, authentification.'),
      jsonb_build_object('title', '🚀 Lancement', 'icon', '🚀', 'description', 'Tests, déploiement, onboarding, monitoring.')
    )
    ELSE jsonb_build_array(  -- website
      jsonb_build_object('title', '🎯 Vision & cadrage', 'icon', '🎯', 'description', 'Définir le message clé, le public cible et l''objectif business du site.'),
      jsonb_build_object('title', '🎨 Design & contenu', 'icon', '🎨', 'description', 'Maquettes, design system, copy des sections principales, visuels.'),
      jsonb_build_object('title', '⚙️ Build', 'icon', '⚙️', 'description', 'Construction des pages, formulaires, intégrations (analytics, CRM).'),
      jsonb_build_object('title', '🚀 Lancement', 'icon', '🚀', 'description', 'Tests, SEO de base, déploiement, partage.')
    )
  END;

  FOR v_cat IN SELECT * FROM jsonb_array_elements(v_categories)
  LOOP
    INSERT INTO public.pilot_categories (project_id, org_id, owner_id, title, description, icon, position, status)
    VALUES (
      NEW.id,
      NEW.org_id,
      NEW.owner_id,
      v_cat->>'title',
      v_cat->>'description',
      v_cat->>'icon',
      v_pos,
      'todo'::pilot_status
    );
    v_pos := v_pos + 1;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_pilot_categories ON public.projects;
CREATE TRIGGER trg_seed_pilot_categories
AFTER INSERT ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.seed_default_pilot_categories();