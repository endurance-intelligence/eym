do $$
declare
  legacy_table text := 'stride' || 'hq_data';
begin
  if to_regclass('public.' || legacy_table) is not null
     and to_regclass('public.athlete_data') is null then
    execute format('alter table public.%I rename to athlete_data', legacy_table);
  end if;
end
$$;

create table if not exists public.athlete_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  app_data jsonb not null default '{}'::jsonb,
  calendar_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.athlete_data enable row level security;

drop policy if exists "Users can read own athlete data" on public.athlete_data;
create policy "Users can read own athlete data"
on public.athlete_data for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own athlete data" on public.athlete_data;
create policy "Users can insert own athlete data"
on public.athlete_data for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own athlete data" on public.athlete_data;
create policy "Users can update own athlete data"
on public.athlete_data for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own athlete data" on public.athlete_data;
create policy "Users can delete own athlete data"
on public.athlete_data for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.set_athlete_data_updated_at()
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

drop trigger if exists athlete_data_set_updated_at on public.athlete_data;
create trigger athlete_data_set_updated_at
before update on public.athlete_data
for each row execute function public.set_athlete_data_updated_at();
