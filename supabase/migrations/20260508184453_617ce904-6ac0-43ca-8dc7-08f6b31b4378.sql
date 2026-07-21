UPDATE public.capabilities
SET status = 'done'::capability_status,
    completed_at = COALESCE(completed_at, now()),
    info = COALESCE(info,'') || E'\n\n— LOT 8 livré : outil exposé à Elena via src/server/lot8-tools.server.ts.',
    updated_at = now()
WHERE id IN (
  'ab59c90d-44b5-430a-801e-8c8c4f95e147',
  'ff37e9b2-0ded-461b-8ecb-3e890ddb5999',
  'ccc88ed9-443a-4103-84a6-ae95abfb0122',
  'f90b491a-d659-49f9-96a5-20681ac30743',
  '1e0d2c0c-613f-4a14-876d-0611d1595c6a'
);