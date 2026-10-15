create or replace function public.country_counts() returns table(code text,name text,lat double precision,lng double precision,count bigint) language sql stable security invoker set search_path='' as $$select n.code,n.name,n.lat,n.lng,count(c.id) from public.countries n left join public.channels c on c.country=n.code and exists(select 1 from public.streams s where s.channel_id=c.id) group by n.code order by n.name$$;
-- Prevent public feedback clients from changing immutable fields, even for administrator sessions.
revoke update on public.feedback from authenticated;
grant update(status) on public.feedback to authenticated;
