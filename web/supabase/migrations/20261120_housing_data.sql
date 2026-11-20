-- Housing data model: properties, floor plans, offers, and per-attribute evidence with provenance.
-- Run once in Supabase SQL Editor after schema.sql. Idempotent where practical.
-- Design: one evidence table (extracted_attributes) instead of separate amenities/unit_features/policies
-- tables, so every value carries the same provenance columns. Scope says what the evidence covers.

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- Core entities ----------

create table if not exists public.properties (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  normalized_address text not null unique,          -- dedupe key, see normalizeAddress()
  street             text,
  city               text not null default 'Ann Arbor',
  state              text not null default 'MI',
  zip                text,
  latitude           double precision,
  longitude          double precision,
  official_website   text,
  property_type      text check (property_type in ('apartment','house','condominium','co_op','university','townhouse','duplex','other','unknown')),
  description        text,
  building_count     int,
  floor_count        int,
  management_company text,
  phone              text,
  email              text,
  leasing_contact    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Maps each source's own id to our property, so re-imports never duplicate.
create table if not exists public.property_aliases (
  property_id uuid not null references public.properties(id) on delete cascade,
  source      text not null,
  external_id text not null,
  primary key (source, external_id)
);

create table if not exists public.floor_plans (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references public.properties(id) on delete cascade,
  name            text not null,
  normalized_name text not null,
  bedrooms        numeric,      -- 0 = studio; null = unknown
  bathrooms       numeric,
  square_feet     int,
  floor_plan_url  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists floor_plans_dedupe
  on public.floor_plans (property_id, normalized_name, coalesce(bedrooms, -1), coalesce(bathrooms, -1));

create table if not exists public.scraping_jobs (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('import','discover','scrape_property','refresh','compute_routes')),
  status      text not null default 'pending' check (status in ('pending','running','completed','partially_completed','failed')),
  property_id uuid references public.properties(id) on delete set null,
  input       jsonb not null default '{}',
  progress    jsonb not null default '{}',   -- e.g. {"urls_done": [...], "errors": [...]} for resume
  error       text,
  attempts    int not null default 0,
  started_at  timestamptz,
  finished_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One row per fetched page version. content_hash lets refreshes skip unchanged pages.
create table if not exists public.scraped_sources (
  id           uuid primary key default gen_random_uuid(),
  url          text not null,
  page_title   text,
  source_kind  text not null check (source_kind in ('official_property','university','government','aggregator','journalism','community','dataset')),
  source_tier  int not null check (source_tier between 1 and 5),  -- DATA_SOURCES.md hierarchy, 1 = most authoritative
  content_hash text not null,
  page_type    text,     -- homepage, floor_plans, amenities, pricing, policies, faq, contact, listing, dataset
  markdown     text,
  job_id       uuid references public.scraping_jobs(id) on delete set null,
  fetched_at   timestamptz not null default now(),
  unique (url, content_hash)
);

-- Append-only offers: a new observation is a new row, so price history is preserved.
create table if not exists public.listings (
  id                uuid primary key default gen_random_uuid(),
  property_id       uuid not null references public.properties(id) on delete cascade,
  floor_plan_id     uuid references public.floor_plans(id) on delete set null,
  unit_identifier   text,
  rent_min          numeric,
  rent_max          numeric,
  pricing_basis     text not null default 'unknown' check (pricing_basis in ('per_person','per_unit','per_bed','unknown')),
  pricing_frequency text not null default 'unknown' check (pricing_frequency in ('monthly','installment','semester','annual','unknown')),
  price_type        text not null default 'unknown' check (price_type in ('advertised_starting','available_unit','range','unknown')),
  available_date    date,
  lease_start       date,
  lease_end         date,
  lease_term_months numeric,
  status            text,
  raw_text          text,
  source_id         uuid not null references public.scraped_sources(id),
  observed_at       timestamptz not null default now(),
  created_at        timestamptz not null default now()
);
create unique index if not exists listings_dedupe
  on public.listings (source_id, property_id, coalesce(floor_plan_id, '00000000-0000-0000-0000-000000000000'::uuid),
                      coalesce(unit_identifier, ''), coalesce(rent_min, -1), coalesce(rent_max, -1));
create index if not exists listings_property_observed on public.listings (property_id, observed_at desc);

-- ---------- The 61 factors ----------

create table if not exists public.factor_catalog (
  key             text primary key,
  number          int not null unique,
  label           text not null,
  category        text not null,
  value_kind      text not null check (value_kind in ('boolean','numeric','categorical')),
  acquisition     text not null check (acquisition in ('extractable','calculated','floor_plan','manual_verification','unsupported')),
  -- Evidence scopes allowed to CONFIRM this factor. Evidence at other scopes is stored but never resolves to TRUE/FALSE
  -- (e.g. a building advertising A/C does not confirm a unit has it).
  confirm_scopes  text[] not null,
  freshness_days  int not null default 180,
  notes           text
);

create table if not exists public.extracted_attributes (
  id                  uuid primary key default gen_random_uuid(),
  property_id         uuid not null references public.properties(id) on delete cascade,
  floor_plan_id       uuid references public.floor_plans(id) on delete cascade,
  listing_id          uuid references public.listings(id) on delete cascade,
  bedroom_label       text,
  attribute_key       text not null,                                    -- factor key or supporting attribute (e.g. application_fee)
  factor_key          text references public.factor_catalog(key),       -- set when the attribute maps to one of the 61
  scope               text not null check (scope in ('building','unit','floor_plan','bedroom','listing','house','route')),
  value_state         text check (value_state in ('true','false','unknown')),  -- three-state for booleans
  value_numeric       numeric,
  value_text          text,                                             -- normalized category, e.g. laundry 'in_unit'
  value_json          jsonb,
  unit_of_measure     text,
  raw_text            text,                                             -- original wording, always kept
  evidence_text       text,                                             -- supporting passage
  source_id           uuid references public.scraped_sources(id),
  source_url          text not null,
  source_title        text,
  extraction_method   text not null check (extraction_method in ('firecrawl_json','import_umich','import_hawc','import_seed','import_special','computed','manual')),
  confidence          numeric not null check (confidence between 0 and 1),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','auto_accepted','needs_review','verified','rejected')),
  extracted_at        timestamptz not null default now(),
  created_at          timestamptz not null default now()
);
create unique index if not exists extracted_attributes_dedupe
  on public.extracted_attributes (property_id, attribute_key, scope,
     coalesce(floor_plan_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(bedroom_label, ''),
     source_url, md5(coalesce(raw_text, '') || coalesce(value_state, '') || coalesce(value_text, '') || coalesce(value_numeric::text, '')));
create index if not exists extracted_attributes_factor on public.extracted_attributes (factor_key, property_id);

create table if not exists public.verification_queue (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties(id) on delete cascade,
  attribute_key text not null,
  reason        text not null check (reason in ('low_confidence','conflict','critical_missing','ambiguous_text','accessibility_claim')),
  attribute_ids uuid[] not null default '{}',
  details       jsonb not null default '{}',
  status        text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
create unique index if not exists verification_queue_open
  on public.verification_queue (property_id, attribute_key, reason) where status = 'open';

-- ---------- Location and transit (factors 1, 54–58) ----------

create table if not exists public.external_locations (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('grocery','library','rec_facility','campus_hub','other')),
  name        text not null,
  address     text,
  latitude    double precision not null,
  longitude   double precision not null,
  source_url  text not null,
  observed_at timestamptz not null default now(),
  unique (kind, name)
);

create table if not exists public.transit_stops (
  id         uuid primary key default gen_random_uuid(),
  agency     text not null check (agency in ('theride','umich')),
  stop_code  text not null,      -- GTFS stop_id
  name       text not null,
  latitude   double precision not null,
  longitude  double precision not null,
  source_url text not null,
  unique (agency, stop_code)
);

create table if not exists public.transit_routes (
  id         uuid primary key default gen_random_uuid(),
  agency     text not null check (agency in ('theride','umich')),
  route_code text not null,      -- GTFS route_id
  short_name text,
  long_name  text,
  source_url text not null,
  unique (agency, route_code)
);

create table if not exists public.transit_route_stops (
  route_id uuid not null references public.transit_routes(id) on delete cascade,
  stop_id  uuid not null references public.transit_stops(id) on delete cascade,
  primary key (route_id, stop_id)
);

create table if not exists public.route_calculations (
  id               uuid primary key default gen_random_uuid(),
  property_id      uuid not null references public.properties(id) on delete cascade,
  destination_kind text not null,          -- 'pin', 'grocery', 'library', 'rec_facility', 'bus_stop'
  destination_id   uuid,                   -- external_locations / transit_stops id when applicable
  dest_latitude    double precision not null,
  dest_longitude   double precision not null,
  mode             text not null check (mode in ('walk','bike','drive','transit')),
  minutes          numeric,
  distance_m       numeric,
  transfers        int,
  reference_time   timestamptz,
  method           text not null check (method in ('straight_line_estimate','gtfs_schedule','routing_api')),
  source           text not null,
  computed_at      timestamptz not null default now()
);
create index if not exists route_calculations_property on public.route_calculations (property_id, destination_kind, mode);

-- Great-circle distance in meters (no PostGIS needed at this scale).
create or replace function public.haversine_m(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)));
$$;

-- ---------- Resolved factor view ----------
-- Per property x factor: TRUE/FALSE only from evidence at a confirming scope; both present = conflict.
-- building_claim marks properties where only a building-level (non-confirming) TRUE exists.
create or replace view public.property_factor_status
with (security_invoker = true) as
select
  p.id  as property_id,
  f.key as factor_key,
  f.number,
  f.acquisition,
  case
    when bool_or(a.value_state = 'true'  and a.scope = any(f.confirm_scopes))
     and bool_or(a.value_state = 'false' and a.scope = any(f.confirm_scopes)) then 'conflict'
    when bool_or(a.value_state = 'true'  and a.scope = any(f.confirm_scopes)) then 'true'
    when bool_or(a.value_state = 'false' and a.scope = any(f.confirm_scopes)) then 'false'
    else 'unknown'
  end as state,
  coalesce(bool_or(a.value_state = 'true' and not (a.scope = any(f.confirm_scopes))), false) as building_claim,
  max(a.value_numeric) filter (where a.scope = any(f.confirm_scopes)) as max_numeric,
  (array_agg(a.value_text order by a.confidence desc) filter (where a.value_text is not null and a.scope = any(f.confirm_scopes)))[1] as best_text,
  max(a.extracted_at) as last_evidence_at,
  count(a.id) as evidence_count
from public.properties p
cross join public.factor_catalog f
left join public.extracted_attributes a
  on a.property_id = p.id and a.factor_key = f.key and a.verification_status <> 'rejected'
group by p.id, f.key, f.number, f.acquisition;

-- ---------- updated_at triggers ----------
drop trigger if exists properties_updated on public.properties;
create trigger properties_updated before update on public.properties for each row execute function public.set_updated_at();
drop trigger if exists floor_plans_updated on public.floor_plans;
create trigger floor_plans_updated before update on public.floor_plans for each row execute function public.set_updated_at();
drop trigger if exists scraping_jobs_updated on public.scraping_jobs;
create trigger scraping_jobs_updated before update on public.scraping_jobs for each row execute function public.set_updated_at();

-- ---------- Access ----------
-- Public listing data is readable by anyone; all writes go through the server-side secret key (bypasses RLS).
-- Jobs, raw sources, and the verification queue are server-only.
do $$
declare t text;
begin
  foreach t in array array['properties','property_aliases','floor_plans','listings','factor_catalog','extracted_attributes',
                           'external_locations','transit_stops','transit_routes','transit_route_stops','route_calculations',
                           'scraped_sources','scraping_jobs','verification_queue'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['properties','floor_plans','listings','factor_catalog','extracted_attributes',
                           'external_locations','transit_stops','transit_routes','transit_route_stops','route_calculations'] loop
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;
grant select on public.property_factor_status to anon, authenticated;
grant all on all tables in schema public to service_role;
