-- Store invited email on membership so pending invites show before user logs in
alter table memberships add column if not exists invited_email text;

-- Allow owners to read profiles of all members in their scope
create policy "Profiles: owners can read scope members" on profiles
  for select using (
    exists (
      select 1 from memberships m
      where m.user_id = auth.uid()
        and m.role = 'owner'
        and m.accepted_at is not null
        and exists (
          select 1 from memberships m2
          where m2.user_id = profiles.id
            and m2.scope = m.scope
        )
    )
  );
