
-- 1) Enum rôle
CREATE TYPE public.org_role AS ENUM ('owner', 'admin', 'member');

-- 2) Tables
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL,
  is_personal BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role public.org_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX idx_org_members_org ON public.organization_members(org_id);

-- 3) Fonction security definer (évite récursion RLS)
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND org_id = _org_id
  )
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_user_id uuid, _org_id uuid, _role public.org_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND org_id = _org_id AND role = _role
  )
$$;

-- 4) Activation RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- 5) Policies organizations
CREATE POLICY "members_select_org"
  ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), id));

CREATE POLICY "owner_insert_org"
  ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owner_update_org"
  ON public.organizations FOR UPDATE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "owner_delete_org"
  ON public.organizations FOR DELETE TO authenticated
  USING (owner_id = auth.uid() AND is_personal = false);

-- 6) Policies organization_members
CREATE POLICY "members_select_self_org"
  ON public.organization_members FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "owner_insert_member"
  ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (
    public.has_org_role(auth.uid(), org_id, 'owner')
    OR user_id = auth.uid()
  );

CREATE POLICY "owner_update_member"
  ON public.organization_members FOR UPDATE TO authenticated
  USING (public.has_org_role(auth.uid(), org_id, 'owner'));

CREATE POLICY "owner_delete_member"
  ON public.organization_members FOR DELETE TO authenticated
  USING (public.has_org_role(auth.uid(), org_id, 'owner'));

-- 7) Trigger : créer org perso à chaque nouvel utilisateur
CREATE OR REPLACE FUNCTION public.create_personal_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
BEGIN
  INSERT INTO public.organizations (name, owner_id, is_personal)
  VALUES ('Mon espace', NEW.id, true)
  RETURNING id INTO new_org_id;

  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_org ON auth.users;
CREATE TRIGGER on_auth_user_created_org
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_personal_org();

-- 8) Backfill : 1 org perso par utilisateur déjà existant
INSERT INTO public.organizations (name, owner_id, is_personal)
SELECT 'Mon espace', u.id, true
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.organizations o
  WHERE o.owner_id = u.id AND o.is_personal = true
);

INSERT INTO public.organization_members (org_id, user_id, role)
SELECT o.id, o.owner_id, 'owner'
FROM public.organizations o
WHERE o.is_personal = true
  AND NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.org_id = o.id AND m.user_id = o.owner_id
  );

-- 9) Ajout colonne org_id sur tables existantes
ALTER TABLE public.projects ADD COLUMN org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.conversations ADD COLUMN org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD COLUMN org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 10) Backfill org_id depuis owner_id (org perso de chaque user)
UPDATE public.projects p
SET org_id = (
  SELECT o.id FROM public.organizations o
  WHERE o.owner_id = p.owner_id AND o.is_personal = true
  LIMIT 1
);

UPDATE public.conversations c
SET org_id = (
  SELECT o.id FROM public.organizations o
  WHERE o.owner_id = c.owner_id AND o.is_personal = true
  LIMIT 1
);

UPDATE public.messages m
SET org_id = (
  SELECT o.id FROM public.organizations o
  WHERE o.owner_id = m.owner_id AND o.is_personal = true
  LIMIT 1
);

-- 11) Rendre org_id obligatoire + index
ALTER TABLE public.projects ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.conversations ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.messages ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX idx_projects_org ON public.projects(org_id);
CREATE INDEX idx_conversations_org ON public.conversations(org_id);
CREATE INDEX idx_messages_org ON public.messages(org_id);

-- 12) Refonte RLS : owner_id -> appartenance org
DROP POLICY IF EXISTS owner_select_projects ON public.projects;
DROP POLICY IF EXISTS owner_insert_projects ON public.projects;
DROP POLICY IF EXISTS owner_update_projects ON public.projects;
DROP POLICY IF EXISTS owner_delete_projects ON public.projects;

CREATE POLICY "org_members_select_projects"
  ON public.projects FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "org_members_insert_projects"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id) AND owner_id = auth.uid());
CREATE POLICY "org_members_update_projects"
  ON public.projects FOR UPDATE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "org_members_delete_projects"
  ON public.projects FOR DELETE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

DROP POLICY IF EXISTS owner_select_conv ON public.conversations;
DROP POLICY IF EXISTS owner_insert_conv ON public.conversations;
DROP POLICY IF EXISTS owner_update_conv ON public.conversations;
DROP POLICY IF EXISTS owner_delete_conv ON public.conversations;

CREATE POLICY "org_members_select_conv"
  ON public.conversations FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "org_members_insert_conv"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id) AND owner_id = auth.uid());
CREATE POLICY "org_members_update_conv"
  ON public.conversations FOR UPDATE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "org_members_delete_conv"
  ON public.conversations FOR DELETE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

DROP POLICY IF EXISTS owner_select_msg ON public.messages;
DROP POLICY IF EXISTS owner_insert_msg ON public.messages;
DROP POLICY IF EXISTS owner_delete_msg ON public.messages;

CREATE POLICY "org_members_select_msg"
  ON public.messages FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "org_members_insert_msg"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id) AND owner_id = auth.uid());
CREATE POLICY "org_members_delete_msg"
  ON public.messages FOR DELETE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
