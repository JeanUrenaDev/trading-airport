-- Trading Pet / Goku. Ejecutar en el editor SQL de Supabase.
-- Cada usuario solo lee y escribe sus filas. El progreso sale de las sesiones,
-- y recompute_unlocks impide duplicar una pieza al recargar.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  position integer not null,
  text text not null,
  kind text not null check (kind in ('yesno', 'tri')),
  custom boolean not null default false,
  unique (user_id, position)
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_date date not null,
  status text not null check (status in ('rest', 'completed')),
  result text check (result in ('win', 'loss', 'breakeven')),
  learned text not null default '',
  note text not null default '',
  answers jsonb not null default '[]'::jsonb,
  disciplined boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, session_date)
);

create table if not exists public.unlocks (
  user_id uuid not null references auth.users (id) on delete cascade,
  accessory_id integer not null check (accessory_id >= 1),
  session_date date not null,
  primary key (user_id, accessory_id),
  unique (user_id, session_date)
);

alter table public.profiles enable row level security;
alter table public.rules enable row level security;
alter table public.sessions enable row level security;
alter table public.unlocks enable row level security;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.rules to authenticated;
grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, update, delete on public.unlocks to authenticated;

drop policy if exists profiles_own on public.profiles;
create policy profiles_own on public.profiles
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists rules_own on public.rules;
create policy rules_own on public.rules
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists sessions_own on public.sessions;
create policy sessions_own on public.sessions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists unlocks_own on public.unlocks;
create policy unlocks_own on public.unlocks
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.recompute_unlocks()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.unlocks where user_id = auth.uid();
  insert into public.unlocks (user_id, accessory_id, session_date)
  select auth.uid(), row_number() over (order by session_date)::integer, session_date
  from public.sessions
  where user_id = auth.uid()
    and status = 'completed'
    and disciplined = true
  order by session_date
end;
$$;

revoke all on function public.recompute_unlocks() from public;
grant execute on function public.recompute_unlocks() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  insert into public.rules (user_id, position, text, kind, custom)
  select new.id, v.position, v.text, v.kind, false
  from (
    values
      (1, '¿Acepté el riesgo antes de entrar?', 'yesno'),
      (2, '¿Respeté mi estrategia?', 'yesno'),
      (3, '¿Operé pasivo en un nivel?', 'tri'),
      (4, '¿Respeté mi stop loss?', 'yesno'),
      (5, '¿Evité operar por venganza o por FOMO?', 'yesno'),
      (6, '¿Respeté mi límite diario?', 'yesno'),
      (7, '¿Acepté el resultado sin intentar recuperar?', 'yesno')
  ) as v(position, text, kind)
  where not exists (select 1 from public.rules r where r.user_id = new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
