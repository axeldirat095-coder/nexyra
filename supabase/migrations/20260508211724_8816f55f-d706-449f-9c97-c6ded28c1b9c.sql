UPDATE public.capabilities
SET status='in_progress', started_at=COALESCE(started_at, now()), updated_at=now()
WHERE id='61371a63-ba29-4f46-acfc-030903886d87';