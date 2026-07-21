
-- Axe F : ajoute DeepSeek au enum ai_provider (compatible OpenAI API)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'ai_provider'::regtype AND enumlabel = 'deepseek') THEN
    ALTER TYPE ai_provider ADD VALUE 'deepseek';
  END IF;
END $$;

UPDATE public.capabilities
SET status = 'done', completed_at = now(), updated_at = now()
WHERE category_id = 'elena-v3'
  AND title IN (
    'Axe F — Multi-provider (Claude Sonnet + DeepSeek)',
    'Axe G — PII redaction middleware'
  );
