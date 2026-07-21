UPDATE public.capabilities
   SET status = 'done'::capability_status,
       completed_at = COALESCE(completed_at, now()),
       updated_at = now()
 WHERE id IN (
   'ede21b77-04d8-496f-8e83-725c2055841b',
   'ed4db059-3eb3-4128-9c27-b7609a98cd82',
   'b26ddf98-037f-4e21-9793-2939d666f546'
 );