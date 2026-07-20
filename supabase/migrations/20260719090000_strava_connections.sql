create table if not exists public.strava_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  athlete jsonb,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.strava_connections enable row level security;

-- OAuth tokens are server-only. The browser roles receive no direct table access.
revoke all on table public.strava_connections from anon, authenticated;
