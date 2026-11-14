-- Chronicle VTT v0.2: campaign-scoped homebrew library and character selections.
-- Additive migration. Existing campaigns and characters remain intact.

create table public.homebrew_definitions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('species', 'class', 'background', 'feature')),
  name text not null check (char_length(trim(name)) between 2 and 100),
  summary text not null default '' check (char_length(summary) <= 320),
  description text not null default '' check (char_length(description) <= 12000),
  config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(config) = 'object' and octet_length(config::text) <= 20000),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index homebrew_unique_name_ci on public.homebrew_definitions(campaign_id, kind, lower(name));
create index homebrew_by_campaign on public.homebrew_definitions(campaign_id, kind, status);

create table public.homebrew_feature_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  parent_definition_id uuid not null references public.homebrew_definitions(id) on delete cascade,
  feature_definition_id uuid not null references public.homebrew_definitions(id) on delete cascade,
  unlock_level integer not null default 1 check (unlock_level between 1 and 20),
  created_at timestamptz not null default now(),
  constraint homebrew_feature_no_self_link check (parent_definition_id <> feature_definition_id),
  unique (parent_definition_id, feature_definition_id)
);
create index homebrew_links_campaign_idx on public.homebrew_feature_links(campaign_id);

alter table public.characters
  add column species_id uuid references public.homebrew_definitions(id) on delete set null,
  add column class_id uuid references public.homebrew_definitions(id) on delete set null,
  add column background_id uuid references public.homebrew_definitions(id) on delete set null;
create index characters_species_ref on public.characters(species_id) where species_id is not null;
create index characters_class_ref on public.characters(class_id) where class_id is not null;

-- A published definition may be selected by a character. Existing selections must remain
-- available to players: prevent reverting an actively selected definition to draft.
create function private.guard_homebrew_definition()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.campaign_id is distinct from old.campaign_id
      or new.kind is distinct from old.kind
      or new.created_by is distinct from old.created_by then
      raise exception 'Homebrew identity and campaign cannot be changed';
    end if;
    if old.status = 'published' and new.status = 'draft' and exists (
      select 1 from public.characters c
      where c.species_id = old.id or c.class_id = old.id or c.background_id = old.id
    ) then
      raise exception 'This entry is assigned to characters and cannot be unpublished';
    end if;
    new.updated_at = now();
  end if;
  return new;
end;
$$;
create trigger homebrew_identity_guard before update on public.homebrew_definitions
for each row execute function private.guard_homebrew_definition();

-- A link can only connect a species/class/background with a feature in the SAME campaign.
create function private.validate_feature_link()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare p public.homebrew_definitions; f public.homebrew_definitions;
begin
  select * into p from public.homebrew_definitions where id = new.parent_definition_id;
  select * into f from public.homebrew_definitions where id = new.feature_definition_id;
  if p.id is null or f.id is null or p.kind = 'feature' or f.kind <> 'feature'
    or p.campaign_id <> f.campaign_id or new.campaign_id <> p.campaign_id then
    raise exception 'Feature links require a parent and feature in the same campaign';
  end if;
  return new;
end;
$$;
create trigger homebrew_link_guard before insert or update on public.homebrew_feature_links
for each row execute function private.validate_feature_link();

-- Prevent forged character selection IDs even if a malicious client bypasses our UI.
create function private.validate_character_homebrew()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare selected_id uuid; selected_kind text; selected_campaign uuid; selected_status text; expected_kind text;
begin
  foreach expected_kind in array array['species','class','background'] loop
    selected_id := case expected_kind when 'species' then new.species_id
      when 'class' then new.class_id else new.background_id end;
    if selected_id is not null then
      select kind, campaign_id, status into selected_kind, selected_campaign, selected_status
      from public.homebrew_definitions where id=selected_id;
      if selected_kind is distinct from expected_kind
        or selected_campaign is distinct from new.campaign_id
        or selected_status is distinct from 'published' then
        raise exception 'Selected homebrew entry is not published in this campaign';
      end if;
    end if;
  end loop;
  return new;
end;
$$;
create trigger character_homebrew_validate before insert or update of
  campaign_id, species_id, class_id, background_id on public.characters
for each row execute function private.validate_character_homebrew();

alter table public.homebrew_definitions enable row level security;
alter table public.homebrew_feature_links enable row level security;
revoke all on public.homebrew_definitions, public.homebrew_feature_links from anon, authenticated;
grant select, insert, update, delete on public.homebrew_definitions to authenticated;
grant select, insert, delete on public.homebrew_feature_links to authenticated;

-- Players see published rules; DMs also see drafts. Only DMs can write.
create policy "members read published homebrew and DMs read drafts"
on public.homebrew_definitions for select to authenticated
using (private.is_campaign_dm(campaign_id)
  or (status = 'published' and private.is_campaign_member(campaign_id)));

create policy "DM creates homebrew"
on public.homebrew_definitions for insert to authenticated
with check (created_by = (select auth.uid()) and private.is_campaign_dm(campaign_id));

create policy "DM edits homebrew"
on public.homebrew_definitions for update to authenticated
using (private.is_campaign_dm(campaign_id))
with check (private.is_campaign_dm(campaign_id));

create policy "DM removes homebrew"
on public.homebrew_definitions for delete to authenticated
using (private.is_campaign_dm(campaign_id));

-- Both the parent and the feature must be visible to the reader. RLS on the
-- definitions table handles status and membership; these queries cannot expose drafts.
create policy "members read allowed feature grants"
on public.homebrew_feature_links for select to authenticated
using (exists (select 1 from public.homebrew_definitions d where d.id = parent_definition_id)
  and exists (select 1 from public.homebrew_definitions f where f.id = feature_definition_id));

create policy "DM adds feature grants"
on public.homebrew_feature_links for insert to authenticated
with check (private.is_campaign_dm(campaign_id));

create policy "DM removes feature grants"
on public.homebrew_feature_links for delete to authenticated
using (private.is_campaign_dm(campaign_id));

comment on table public.homebrew_definitions is 'Campaign-scoped v0.2 reusable species, classes, backgrounds and features';
comment on table public.homebrew_feature_links is 'Level-based feature grants; drafts are visible only to campaign DMs';
