UPDATE public.capabilities
SET status = 'done', completed_at = now()
WHERE title = 'Outil run_command (npm install, build, test)';