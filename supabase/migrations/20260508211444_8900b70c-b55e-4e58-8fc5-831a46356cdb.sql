DO $$ BEGIN
  CREATE TYPE public.pilot_owner_mode AS ENUM ('auto','elena','human');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.pilot_steps
  ADD COLUMN IF NOT EXISTS owner_mode public.pilot_owner_mode NOT NULL DEFAULT 'auto';

UPDATE public.capabilities
SET status='done', completed_at=now(), updated_at=now()
WHERE id='ad81be9c-0b28-43cf-9085-7c1d98301f0f';