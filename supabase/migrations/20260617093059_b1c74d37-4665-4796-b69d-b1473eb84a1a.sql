DROP POLICY IF EXISTS "owner_insert_member" ON public.organization_members;

CREATE POLICY "owner_insert_member"
  ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(auth.uid(), org_id, 'owner'));