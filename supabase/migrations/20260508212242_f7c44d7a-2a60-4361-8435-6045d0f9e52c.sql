UPDATE public.capabilities
   SET status = 'done'::capability_status,
       completed_at = COALESCE(completed_at, now()),
       updated_at = now()
 WHERE id = 'b44e9641-cc2b-4bbc-b7e0-0bc482b90977';