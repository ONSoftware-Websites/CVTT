-- CVTT v0.1 patch: allow a newly-created campaign owner to read the row
-- immediately, including during INSERT ... RETURNING id.
-- The after-insert membership trigger runs later than the INSERT RLS check,
-- so relying exclusively on campaign_members can block creation.
-- Existing members retain their previous read access.
alter policy "members read campaigns"
on public.campaigns
using (
  owner_id = (select auth.uid())
  or private.is_campaign_member(id)
);
