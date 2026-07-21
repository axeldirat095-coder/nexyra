
UPDATE public.capabilities
   SET status = 'done'::capability_status,
       info = 'Elena lit les requêtes réseau live de la sandbox preview (filtre status/url/method/since). Interception fetch/XHR injectée dans l''iframe → insert dans preview_network_logs côté owner.',
       completed_at = COALESCE(completed_at, now()),
       updated_at = now()
 WHERE id = 'a57ca05c-0f3e-44b3-98e5-c703d3ffa97e';
