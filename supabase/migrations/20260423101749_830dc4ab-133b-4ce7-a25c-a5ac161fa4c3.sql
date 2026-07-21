ALTER TABLE public.pilot_categories
  ADD COLUMN estimated_cost_usd numeric(10, 4);

ALTER TABLE public.pilot_steps
  ADD COLUMN estimated_cost_usd numeric(10, 4);

COMMENT ON COLUMN public.pilot_categories.estimated_cost_usd IS 'Estimation coût API totale pour la catégorie (USD). NULL = non estimé.';
COMMENT ON COLUMN public.pilot_steps.estimated_cost_usd IS 'Estimation coût API pour cette étape (USD). NULL = non estimé.';