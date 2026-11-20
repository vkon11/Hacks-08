-- The matcher publishes rows for a specific saved questionnaire revision.
create table if not exists public.housing_recommendations (
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null,
  preferences_updated_at timestamptz not null,
  rank integer not null check (rank > 0),
  title text not null,
  listing_url text not null,
  reason text not null,
  primary key (user_id, profile_id, preferences_updated_at, rank)
);
alter table public.housing_recommendations enable row level security;
revoke all on public.housing_recommendations from anon, authenticated;
grant select on public.housing_recommendations to authenticated;
drop policy if exists "read own matches" on public.housing_recommendations;
create policy "read own matches" on public.housing_recommendations
  for select to authenticated using ((select auth.uid()) = user_id);
