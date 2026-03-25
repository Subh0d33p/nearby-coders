create extension if not exists postgis;

create table if not exists public.profiles (
  account_id bigint generated always as identity primary key,
  id uuid not null unique references auth.users (id) on delete cascade,
  username text,
  avatar_url text,
  github_id text,
  location geography(point, 4326),
  city text,
  country text,
  skills text[] not null default '{}',
  online_status boolean not null default false,
  created_at timestamp with time zone not null default now()
);

create index if not exists profiles_location_gix
  on public.profiles
  using gist (location);

create index if not exists profiles_github_id_idx
  on public.profiles (github_id);

alter table public.profiles enable row level security;

create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);

create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.match_coders(
  user_lat double precision,
  user_long double precision,
  radius_meters integer
)
returns table (
  account_id bigint,
  id uuid,
  username text,
  avatar_url text,
  github_id text,
  city text,
  country text,
  skills text[],
  online_status boolean,
  created_at timestamp with time zone,
  distance_meters double precision
)
language sql
security definer
set search_path = public
as $$
  select
    p.account_id,
    p.id,
    p.username,
    p.avatar_url,
    p.github_id,
    p.city,
    p.country,
    p.skills,
    p.online_status,
    p.created_at,
    st_distance(
      p.location,
      st_setsrid(st_makepoint(user_long, user_lat), 4326)::geography
    ) as distance_meters
  from public.profiles p
  where p.location is not null
    and st_dwithin(
      p.location,
      st_setsrid(st_makepoint(user_long, user_lat), 4326)::geography,
      radius_meters
    )
  order by distance_meters asc;
$$;

grant execute on function public.match_coders(double precision, double precision, integer) to authenticated;
