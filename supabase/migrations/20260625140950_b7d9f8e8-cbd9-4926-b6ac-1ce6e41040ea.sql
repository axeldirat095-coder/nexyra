UPDATE public.projects
SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{vercel_project_name}', '"leya-three"', true)
WHERE id = '270717cf-ae35-4327-ba17-efa18a111c2f';