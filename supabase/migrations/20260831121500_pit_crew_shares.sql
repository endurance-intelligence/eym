create table if not exists public.pit_crew_shares (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  race_key text not null,
  token_hash text not null unique,
  race jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  expires_at timestamptz not null default (now() + interval '45 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id, race_key)
);

alter table public.pit_crew_shares enable row level security;
revoke all on table public.pit_crew_shares from anon, authenticated;

create index if not exists pit_crew_shares_owner_idx on public.pit_crew_shares(owner_user_id);
create index if not exists pit_crew_shares_expires_idx on public.pit_crew_shares(expires_at);
