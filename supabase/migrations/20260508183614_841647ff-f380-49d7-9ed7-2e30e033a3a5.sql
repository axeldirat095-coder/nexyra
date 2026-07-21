UPDATE public.capabilities
SET status = 'done'::capability_status,
    completed_at = COALESCE(completed_at, now()),
    info = COALESCE(info,'') || E'\n\n— LOT 6 livré : outil exposé à Elena via src/server/sandbox-tools.server.ts.',
    updated_at = now()
WHERE id IN (
  '22d793b0-57f3-4afa-aed0-a0d668542fb7',
  'eafd1bc4-a728-419d-9ff3-95f53a1d5c98',
  'eba22e2e-1f08-4dcd-8cdf-35f1a05c311f',
  '83db04f6-fc27-4932-855a-3adcfa1961d1'
);