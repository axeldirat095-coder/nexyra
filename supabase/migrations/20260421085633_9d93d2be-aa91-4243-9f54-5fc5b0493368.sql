CREATE OR REPLACE FUNCTION public.increment_msg_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
     SET messages_since_summary = messages_since_summary + 1
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_msg_count ON public.messages;
CREATE TRIGGER trg_msg_count
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.increment_msg_count();