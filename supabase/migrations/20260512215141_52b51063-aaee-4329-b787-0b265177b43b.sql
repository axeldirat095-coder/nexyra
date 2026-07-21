-- Section (ELENA = moteur agent, NEXYRA = produit commercial)
-- Priority (P0 = à faire maintenant, P1 = ensuite, gel = parking)

CREATE TYPE pilot_section AS ENUM ('elena', 'nexyra');
CREATE TYPE pilot_priority AS ENUM ('P0', 'P1', 'gel');

ALTER TABLE public.pilot_categories
  ADD COLUMN section pilot_section NOT NULL DEFAULT 'elena',
  ADD COLUMN priority pilot_priority NOT NULL DEFAULT 'P1';

ALTER TABLE public.pilot_steps
  ADD COLUMN priority pilot_priority NOT NULL DEFAULT 'P1';

CREATE INDEX idx_pilot_categories_section_priority
  ON public.pilot_categories (project_id, section, priority, position);
