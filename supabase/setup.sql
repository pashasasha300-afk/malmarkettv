-- First-time setup only. Transactional: existing tables cause a rollback instead of overwriting data.
BEGIN;
create table public.countries(code text primary key,name text not null,lat double precision not null,lng double precision not null);
create table public.channels(id text primary key,name text not null,country text references public.countries(code),languages text[] not null default '{}',categories text[] not null default '{}',logo text,website text,is_nsfw boolean not null default false,hidden boolean not null default false,manual_name text,source text not null default 'iptv-org',updated_at timestamptz not null default now());
create table public.streams(id text primary key,channel_id text not null references public.channels(id) on delete cascade,url text not null,labels text[] not null default '{}',source text not null,active boolean not null default true,disabled boolean not null default false,official_verified boolean not null default false,server_status text not null default 'unchecked',checked_at timestamptz,last_seen_at timestamptz not null default now(),unique(channel_id,url));
create table public.favorites(user_id uuid references auth.users(id) on delete cascade,channel_id text references public.channels(id) on delete cascade,primary key(user_id,channel_id));
create table public.watch_history(user_id uuid references auth.users(id) on delete cascade,channel_id text references public.channels(id) on delete cascade,watched_at timestamptz not null default now(),primary key(user_id,channel_id));
create table public.feedback(id bigint generated always as identity primary key,channel_id text references public.channels(id),message text not null check(length(message) between 10 and 4000),status text not null default 'open',created_at timestamptz not null default now());
create table public.sync_logs(id bigint generated always as identity primary key,started_at timestamptz not null default now(),finished_at timestamptz,status text not null,details jsonb);
create index channels_country on public.channels(country);
create index streams_channel on public.streams(channel_id);
create index streams_check on public.streams(checked_at nulls first) where active and not disabled;
create index history_time on public.watch_history(user_id,watched_at desc);
create index channels_languages on public.channels using gin(languages);
create index channels_categories on public.channels using gin(categories);
create index feedback_open on public.feedback(status,created_at);
alter table public.countries enable row level security;
alter table public.channels enable row level security;
alter table public.streams enable row level security;
alter table public.favorites enable row level security;
alter table public.watch_history enable row level security;
alter table public.feedback enable row level security;
alter table public.sync_logs enable row level security;
revoke all on public.countries,public.channels,public.streams,public.favorites,public.watch_history,public.feedback,public.sync_logs from anon,authenticated;
grant select on public.countries,public.channels,public.streams to anon,authenticated;
grant select,insert,delete on public.favorites to authenticated;
grant select,insert,update,delete on public.watch_history to authenticated;
grant insert(message,channel_id) on public.feedback to anon,authenticated;
grant usage on sequence public.feedback_id_seq to anon,authenticated;
create policy countries_read on public.countries for select using(true);
create policy channels_read on public.channels for select using(not hidden and not is_nsfw);
create policy streams_read on public.streams for select using(active and not disabled and exists(select 1 from public.channels c where c.id=channel_id and not c.hidden and not c.is_nsfw));
create policy favorites_own on public.favorites for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy history_own on public.watch_history for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy feedback_submit on public.feedback for insert to anon,authenticated with check(status='open');
create function public.search_channels(q text default '',country_code text default '',category_filter text default '',language_filter text default '',ids text[] default null) returns jsonb language sql stable security invoker set search_path='' as $$
select coalesce(jsonb_agg(row_to_json(t)), '[]') from (select c.id,coalesce(c.manual_name,c.name) name,c.country,c.languages,c.categories,c.logo,c.website,c.updated_at,(select jsonb_agg(s order by s.official_verified desc,s.id) from public.streams s where s.channel_id=c.id) streams from public.channels c join public.countries n on n.code=c.country where (country_code='' or c.country=country_code) and (q='' or c.name ilike '%'||q||'%' or c.manual_name ilike '%'||q||'%' or n.name ilike '%'||q||'%' or c.country ilike q or exists(select 1 from unnest(c.languages||c.categories) x where x ilike '%'||q||'%')) and (category_filter='' or category_filter=any(c.categories)) and (language_filter='' or language_filter=any(c.languages)) and (ids is null or c.id=any(ids)) and exists(select 1 from public.streams s where s.channel_id=c.id) order by c.name limit 200) t;
$$;
create function public.country_counts() returns table(code text,name text,lat double precision,lng double precision,count bigint) language sql stable security invoker set search_path='' as $$select n.code,n.name,n.lat,n.lng,count(c.id) from public.countries n join public.channels c on c.country=n.code where exists(select 1 from public.streams s where s.channel_id=c.id) group by n.code order by n.name$$;
revoke all on function public.search_channels(text,text,text,text,text[]),public.country_counts() from public;
grant execute on function public.search_channels(text,text,text,text,text[]),public.country_counts() to anon,authenticated;
-- Admin access only through trusted app_metadata, set via server-side Admin API / SQL.
create function public.is_admin() returns boolean language sql stable security invoker set search_path='' as $$ select coalesce((auth.jwt()->'app_metadata'->>'role')='admin',false) $$;
create policy admin_channels on public.channels for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy admin_streams on public.streams for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy admin_feedback on public.feedback for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy admin_logs on public.sync_logs for select to authenticated using(public.is_admin());
grant update(hidden,manual_name) on public.channels to authenticated;
grant update(disabled,official_verified) on public.streams to authenticated;
grant select,update on public.feedback to authenticated;
grant select on public.sync_logs to authenticated;

create or replace function public.country_counts() returns table(code text,name text,lat double precision,lng double precision,count bigint) language sql stable security invoker set search_path='' as $$select n.code,n.name,n.lat,n.lng,count(c.id) from public.countries n left join public.channels c on c.country=n.code and exists(select 1 from public.streams s where s.channel_id=c.id) group by n.code order by n.name$$;
-- Prevent public feedback clients from changing immutable fields, even for administrator sessions.
revoke update on public.feedback from authenticated;
grant update(status) on public.feedback to authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
