-- Run once in Supabase dashboard -> SQL Editor.
-- Minimal profile: only what the timeline needs. Everything else stays in the browser session.

create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  full_name      text not null check (char_length(full_name) between 1 and 100),
  move_in_date   date not null,
  roommate_count smallint not null check (roommate_count between 0 and 10),
  consented_at   timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- New projects don't auto-grant table access to API roles. Signed-in users only; RLS limits them to their own row.
grant select, insert, update on public.profiles to authenticated;

create policy "read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

-- Insert/update only your own row, and only with a umich.edu account (defense in depth; callback also checks).
create policy "insert own profile" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id and (auth.jwt() ->> 'email') like '%@umich.edu');

create policy "update own profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Account deletion: removes the auth user; the profile cascades.
create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
