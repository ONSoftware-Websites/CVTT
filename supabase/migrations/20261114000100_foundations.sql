-- Chronicle VTT v0.1. Run this only in a NEW, dedicated Supabase project.
-- No dependency on existing ONSoftware services.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 100),
  description text not null default '' check (char_length(description) <= 3000),
  created_at timestamptz not null default now()
);

create table public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'player' check (role in ('dm','player')),
  joined_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
create index campaign_members_user_idx on public.campaign_members(user_id);

-- Invitation secrets are NOT on the campaigns table, so ordinary members
-- cannot obtain codes simply by reading their campaign record.
create table public.campaign_invites (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
  created_at timestamptz not null default now()
);

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  species_name text not null default 'Human' check (char_length(species_name) <= 100),
  class_name text not null default 'Adventurer' check (char_length(class_name) <= 100),
  level int not null default 1 check (level between 1 and 20),
  max_hp int not null default 10 check (max_hp between 1 and 10000),
  current_hp int not null default 10 check (current_hp between 0 and max_hp),
  notes text not null default '' check (char_length(notes) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index characters_campaign_idx on public.characters(campaign_id);

-- Security definer helpers avoid recursive RLS policies across campaigns/members.
-- The functions are in a schema not exposed through Supabase Data API.
create function private.is_campaign_member(p_campaign uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
 select exists (select 1 from public.campaigns c where c.id = p_campaign and c.owner_id = (select auth.uid()))
 or exists (select 1 from public.campaign_members m where m.campaign_id = p_campaign and m.user_id = (select auth.uid()));
$$;

create function private.is_campaign_dm(p_campaign uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
 select exists (select 1 from public.campaigns c where c.id = p_campaign and c.owner_id = (select auth.uid()))
 or exists (select 1 from public.campaign_members m where m.campaign_id = p_campaign and m.user_id = (select auth.uid()) and m.role = 'dm');
$$;

revoke all on function private.is_campaign_member(uuid) from public;
revoke all on function private.is_campaign_dm(uuid) from public;
grant execute on function private.is_campaign_member(uuid) to authenticated;
grant execute on function private.is_campaign_dm(uuid) to authenticated;

-- Always create the founding DM membership + private invite atomically.
create function private.initialise_campaign()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.campaign_members(campaign_id,user_id,role) values (new.id,new.owner_id,'dm');
  insert into public.campaign_invites(campaign_id) values (new.id);
  return new;
end;
$$;
create trigger campaign_initialise after insert on public.campaigns
for each row execute function private.initialise_campaign();

-- Prevent ownership and campaign membership moving through a character UPDATE.
create function private.guard_character_identity()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.created_by is distinct from old.created_by or new.campaign_id is distinct from old.campaign_id then
    raise exception 'Character ownership and campaign cannot be changed';
  end if;
  new.updated_at = now();
  return new;
end;
$$;
create trigger character_identity before update on public.characters
for each row execute function private.guard_character_identity();

-- RLS plus explicit Data API grants (no public anonymous reads).
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.campaign_invites enable row level security;
alter table public.characters enable row level security;

revoke all on public.campaigns, public.campaign_members, public.campaign_invites, public.characters from anon, authenticated;
grant select, insert, update, delete on public.campaigns to authenticated;
grant select on public.campaign_members to authenticated;
grant select on public.campaign_invites to authenticated;
grant select, insert, update, delete on public.characters to authenticated;

create policy "members read campaigns" on public.campaigns for select to authenticated
 using (private.is_campaign_member(id));
create policy "users create their campaigns" on public.campaigns for insert to authenticated
 with check (owner_id = (select auth.uid()));
create policy "owners edit campaigns" on public.campaigns for update to authenticated
 using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owners delete campaigns" on public.campaigns for delete to authenticated
 using (owner_id = (select auth.uid()));

create policy "members read roster" on public.campaign_members for select to authenticated
 using (private.is_campaign_member(campaign_id));
create policy "DM reads invite" on public.campaign_invites for select to authenticated
 using (private.is_campaign_dm(campaign_id));

create policy "members read character roster" on public.characters for select to authenticated
 using (private.is_campaign_member(campaign_id));
create policy "members create own characters" on public.characters for insert to authenticated
 with check (created_by = (select auth.uid()) and private.is_campaign_member(campaign_id));
create policy "owners or DM edit characters" on public.characters for update to authenticated
 using ((created_by = (select auth.uid()) or private.is_campaign_dm(campaign_id)) and private.is_campaign_member(campaign_id))
 with check ((created_by = (select auth.uid()) or private.is_campaign_dm(campaign_id)) and private.is_campaign_member(campaign_id));
create policy "owners or DM delete characters" on public.characters for delete to authenticated
 using ((created_by = (select auth.uid()) or private.is_campaign_dm(campaign_id)) and private.is_campaign_member(campaign_id));

-- Joining via an unguessable code, without revealing private invitations.
create function public.join_campaign(p_code text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_campaign uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to join a campaign'; end if;
  select ci.campaign_id into v_campaign
    from public.campaign_invites ci where ci.code = upper(trim(p_code)) limit 1;
  if v_campaign is null then raise exception 'Invalid invitation code'; end if;
  insert into public.campaign_members(campaign_id,user_id,role)
    values (v_campaign, auth.uid(), 'player') on conflict(campaign_id,user_id) do nothing;
  return v_campaign;
end;
$$;
revoke all on function public.join_campaign(text) from public, anon;
grant execute on function public.join_campaign(text) to authenticated;

comment on schema private is 'Security helper functions; exclude this schema from exposed API schemas';
