REVOKE EXECUTE ON FUNCTION public.tool_get_effective_state(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.tool_get_effective_state(text) TO authenticated;