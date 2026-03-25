# Nearby Coders

Production-oriented starter for a VS Code sidebar extension that lets developers sign in with GitHub, save a location-based profile, and discover nearby coders using Supabase + PostGIS.

## Step 1: Scaffold the VS Code extension

Files created:

- `package.json`: extension manifest, commands, sidebar contributions, build scripts
- `tsconfig.extension.json`: Node/CommonJS build for the VS Code extension host
- `tsconfig.webview.json`: browser/ES module build for the sidebar webview
- `tsconfig.json`: lightweight project reference entrypoint
- `media/nearby-coders.svg`: activity bar icon

Why this matters:

- `WebviewViewProvider` is the right fit for a persistent sidebar experience
- strict TypeScript keeps extension and webview contracts reliable
- separate TS configs avoid mixing extension-host CommonJS output with browser-side webview output
- explicit `contributes.viewsContainers` and `contributes.views` register the sidebar in the Activity Bar

## Step 2: Organize the extension backend

Files created:

- `src/extension.ts`
- `src/config.ts`
- `src/auth.ts`
- `src/supabaseClient.ts`
- `src/api/location.ts`
- `src/panels/SidebarProvider.ts`
- `src/types.ts`

Responsibilities:

- `extension.ts` wires activation, commands, and sidebar registration
- `config.ts` reads typed extension settings from `nearbyCoders.*`
- `auth.ts` uses `vscode.authentication.getSession("github")`, fetches the GitHub user, and then calls a secure backend exchange endpoint for a Supabase session
- `supabaseClient.ts` is the repository layer for profile reads, upserts, and RPC calls
- `location.ts` geocodes a city with Nominatim
- `SidebarProvider.ts` coordinates webview messages, auth, profile save, and nearby search
- `types.ts` keeps extension/webview contracts centralized

Important production note:

- A raw GitHub access token cannot safely be treated as a Supabase session inside the extension.
- The starter uses an `exchangeGithubForSupabase` step that expects a secure Supabase Edge Function or backend endpoint.
- That backend should verify the GitHub token server-side, map it to a Supabase user, and mint a short-lived Supabase session or equivalent trusted token flow.

## Step 3: Build the sidebar UI

Files created:

- `webview/index.html`
- `webview/main.ts`
- `webview/style.css`

UI includes:

- Login button
- Profile form
- Location input
- Skills input
- Nearby coders list
- Refresh button

Theme support:

- The UI uses VS Code theme variables like `--vscode-button-background`, `--vscode-sideBar-background`, and `--vscode-foreground`
- This keeps the sidebar aligned with the active editor theme without hardcoding light/dark palettes

## Step 4: Message passing between extension and webview

Webview to extension:

- `ready`
- `login`
- `logout`
- `saveProfile`
- `refreshNearby`

Extension to webview:

- `state`
- `loading`
- `toast`

Flow:

1. Webview loads and posts `ready`
2. Extension responds with the current state
3. User clicks buttons or submits the form
4. Webview posts typed messages to the extension
5. Extension performs GitHub auth, geocoding, Supabase writes, or RPC reads
6. Extension posts updated `state` and UI feedback back to the webview

This separation is future-ready because:

- chat can become a new command + message type
- groups can become new repository methods + new view state fields
- map support can live either in the same webview or in a dedicated panel using the same message contract patterns

## Step 5: Set up Supabase and PostGIS

File created:

- `supabase/migrations/001_nearby_coders.sql`

This migration does all of the following:

- enables `postgis`
- creates `public.profiles`
- uses `account_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`
- keeps `account_id` sequential starting from 1
- stores `location` as `geography(point, 4326)`
- enables RLS
- allows authenticated reads
- allows insert/update only for the authenticated owner
- creates the `match_coders` RPC function
- adds a GiST index for efficient geospatial queries

### SQL migration

```sql
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
```

## Step 6: Add the nearby coders RPC

The same migration also creates:

```sql
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
```

Why this is production-friendly:

- distance sorting happens in PostgreSQL/PostGIS, not in the client
- the GiST index keeps radius filtering fast
- the function is reusable for future map and discovery screens

## Step 7: Configure extension settings

File created:

- `.env.example`

Recommended VS Code settings:

- `nearbyCoders.supabaseUrl`
- `nearbyCoders.supabaseAnonKey`
- `nearbyCoders.supabaseExchangeUrl`
- `nearbyCoders.defaultRadiusMeters`

`.env.example` is included as a convenience for local development conventions, but the extension code reads runtime values from VS Code configuration because that is more realistic for production packaging.

The exchange URL should point to a secure backend endpoint that converts the validated GitHub identity into a Supabase-authenticated session.

## Step 8: How location storage works

1. User types a city name in the sidebar
2. `src/api/location.ts` calls OpenStreetMap Nominatim
3. The first match returns `lat`, `lon`, `city`, and `country`
4. The extension upserts the profile with:

```text
SRID=4326;POINT(longitude latitude)
```

5. Supabase stores it in the `geography(point, 4326)` column

This keeps distance calculations accurate in meters.

## Step 9: Future-ready architecture

Why this starter scales well:

- auth logic is isolated from repository logic
- geocoding is isolated from profile persistence
- sidebar state is centralized in one provider
- message types are explicit and typed
- the `profiles` table can be joined later with:
  - `messages`
  - `groups`
  - `friendships`
  - `meetups`
  - `map_pins`

Recommended next additions:

1. Add a Supabase Edge Function for the GitHub-to-Supabase exchange
2. Bundle the webview separately with esbuild or Vite for production packaging
3. Add schema validation with Zod for all webview messages and backend payloads
4. Add tests for geocoding, repository methods, and state transitions
5. Add pagination and radius controls to the nearby search UI

## Project tree

```text
.
├── .env.example
├── .vscodeignore
├── media/
│   └── nearby-coders.svg
├── package.json
├── readme.md
├── src/
│   ├── api/
│   │   └── location.ts
│   ├── auth.ts
│   ├── extension.ts
│   ├── panels/
│   │   └── SidebarProvider.ts
│   ├── supabaseClient.ts
│   └── types.ts
├── supabase/
│   └── migrations/
│       └── 001_nearby_coders.sql
├── tsconfig.json
└── webview/
    ├── index.html
    ├── main.ts
    └── style.css
```

## Local run checklist

1. Run `npm install`
2. Run `npm run build`
3. Open the folder in VS Code
4. Press `F5` to launch the Extension Development Host
5. Create the Supabase schema from the migration
6. Configure the extension settings before testing login

## One implementation caveat to address next

This starter intentionally treats the GitHub-to-Supabase exchange as a backend concern rather than faking it inside the extension. That is the safer production path. If you want, the next step can be building the Supabase Edge Function that verifies the GitHub token and returns a trusted session for this extension.
