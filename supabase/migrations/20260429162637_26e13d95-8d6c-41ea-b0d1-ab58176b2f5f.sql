UPDATE public.pilot_steps
SET status = 'done', completed_at = now()
WHERE id IN (
  'd02da356-903c-495f-8811-2eb931bee785',
  'e7180551-bd9f-4386-85ab-0f4de32bb1cf',
  'b43779f4-169d-4ef3-ba2e-b4156d5fa1a7',
  '33448235-dfc7-4af9-b922-e27cd28bcbf0',
  '9bcdb5c5-9983-4234-a655-df913d73b420'
);