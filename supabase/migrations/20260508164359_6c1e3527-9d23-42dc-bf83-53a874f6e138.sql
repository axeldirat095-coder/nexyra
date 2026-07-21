REVOKE EXECUTE ON FUNCTION public.set_external_key(text, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_external_key_decrypted(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mark_external_key_used(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_external_key(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_external_key_used(uuid, text) TO authenticated;
-- get_external_key_decrypted reste réservée au service_role / SECURITY DEFINER côté backend