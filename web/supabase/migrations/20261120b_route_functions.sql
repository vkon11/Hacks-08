-- Per-user route factors (1 commute to my pin, 55 one-seat ride). Computed at request time because they depend on the pin.
-- Estimates are straight-line distance x detour factor at a typical speed; labeled as estimates, never scraped.

create or replace function public.commute_estimates(p_property uuid, p_lat double precision, p_lng double precision)
returns table (mode text, minutes numeric, distance_m numeric, method text)
language sql stable security invoker as $$
  with d as (
    select haversine_m(p.latitude, p.longitude, p_lat, p_lng) as m
    from public.properties p where p.id = p_property and p.latitude is not null
  )
  select v.mode, round((d.m * v.detour / v.m_per_min)::numeric, 1), round(d.m::numeric), 'straight_line_estimate'
  from d cross join (values ('walk', 1.3, 80.0), ('bike', 1.3, 250.0), ('drive', 1.4, 400.0)) as v(mode, detour, m_per_min);
$$;

-- TheRide routes that stop within p_radius_m of both the property and the pin (no transfer needed).
create or replace function public.one_seat_routes(p_property uuid, p_lat double precision, p_lng double precision, p_radius_m double precision default 400)
returns table (route_code text, short_name text, long_name text, home_stop text, home_walk_m numeric, dest_stop text, dest_walk_m numeric)
language sql stable security invoker as $$
  with p as (select latitude, longitude from public.properties where id = p_property and latitude is not null),
  home as (
    select rs.route_id, s.name, haversine_m(p.latitude, p.longitude, s.latitude, s.longitude) as m
    from p, public.transit_stops s join public.transit_route_stops rs on rs.stop_id = s.id
    where haversine_m(p.latitude, p.longitude, s.latitude, s.longitude) <= p_radius_m
  ),
  dest as (
    select rs.route_id, s.name, haversine_m(p_lat, p_lng, s.latitude, s.longitude) as m
    from public.transit_stops s join public.transit_route_stops rs on rs.stop_id = s.id
    where haversine_m(p_lat, p_lng, s.latitude, s.longitude) <= p_radius_m
  ),
  best_home as (select distinct on (route_id) route_id, name, m from home order by route_id, m),
  best_dest as (select distinct on (route_id) route_id, name, m from dest order by route_id, m)
  select r.route_code, r.short_name, r.long_name, h.name, round(h.m::numeric), d.name, round(d.m::numeric)
  from best_home h join best_dest d using (route_id) join public.transit_routes r on r.id = h.route_id
  order by h.m + d.m;
$$;

grant execute on function public.commute_estimates(uuid, double precision, double precision) to anon, authenticated;
grant execute on function public.one_seat_routes(uuid, double precision, double precision, double precision) to anon, authenticated;
