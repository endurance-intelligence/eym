create table if not exists public.intervals_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  api_key_ciphertext text not null,
  athlete_id text not null default '0',
  connected_at timestamptz not null default now(),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.intervals_connections enable row level security;

revoke all on table public.intervals_connections from anon, authenticated;
grant select, insert, update, delete on table public.intervals_connections to service_role;

create or replace function public.set_intervals_connections_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists intervals_connections_set_updated_at on public.intervals_connections;
create trigger intervals_connections_set_updated_at
before update on public.intervals_connections
for each row execute function public.set_intervals_connections_updated_at();
