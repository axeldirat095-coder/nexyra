-- RPC pour capture auto d'idées utilisateur en capabilities (admin only)
CREATE OR REPLACE FUNCTION public.capability_capture_idea(
  _title text,
  _info text,
  _priority capability_priority DEFAULT 'P1'::capability_priority
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing uuid;
  _next_pos integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden — admin role required';
  END IF;

  -- Évite les doublons (même titre dans la catégorie ideas)
  SELECT id INTO _existing
  FROM public.capabilities
  WHERE category_id = 'ideas_capture' AND lower(title) = lower(_title)
  LIMIT 1;

  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  SELECT COALESCE(MAX(position), 0) + 1 INTO _next_pos
  FROM public.capabilities
  WHERE category_id = 'ideas_capture';

  INSERT INTO public.capabilities (
    category_id, category_label, category_icon, category_vision,
    title, info, status, priority, position
  )
  VALUES (
    'ideas_capture',
    '💡 Idées capturées',
    'lightbulb',
    'Idées d''amélioration capturées automatiquement par Elena depuis le chat — à trier et lancer',
    _title, _info, 'todo', _priority, _next_pos
  )
  RETURNING id INTO _existing;

  RETURN _existing;
END;
$$;