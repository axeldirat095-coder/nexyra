UPDATE public.capabilities
SET status = 'done'::capability_status,
    completed_at = COALESCE(completed_at, now()),
    info = COALESCE(info,'') || E'\n\n— LOT 7 livré : outil exposé à Elena via src/server/lot7-tools.server.ts.',
    updated_at = now()
WHERE id IN (
  'a6d44b0c-a066-460c-adfe-5df111ce9c45',
  'c0900d09-6691-467a-8f2f-7100b491c8cd',
  '088fbb19-b18f-4768-a7c8-37375178fd0c',
  '29f154f3-11b2-4a2d-bbd6-04f0e9ca148f'
);