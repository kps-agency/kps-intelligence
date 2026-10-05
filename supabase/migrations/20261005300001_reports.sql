-- Phase 21 (Dashboard & reports, section 56). Les métriques sont agrégées
-- en SQL, en une fonction paramétrée par la période (une vue ne prend pas
-- de paramètre) : l'API ne recalcule rien, elle transmet.
--
-- Les jours sont découpés au fuseau de l'agence (Europe/Zurich) : une
-- demande reçue à 23 h 30 appartient à ce jour-là, pas au lendemain UTC.
--
-- Deux familles de chiffres :
--   * sur la période  : demandes créées entre p_from et p_to (inclus) ;
--   * état courant    : à qualifier, opportunités ouvertes, missions
--                       actives, répartition du pipeline et des missions.

create function report_overview(p_from date, p_to date)
returns jsonb
language sql
stable
as $$
with period_requests as (
  select
    r.id,
    r.status,
    r.source,
    r.country,
    r.created_at,
    (r.created_at at time zone 'Europe/Zurich')::date as day,
    s.name as service_name,
    -- Première qualification : l'événement fait foi (le statut courant a
    -- pu avancer bien au-delà de QUALIFIED).
    (select min(e.created_at) from events e
      where e.request_id = r.id and e.type = 'REQUEST_QUALIFIED') as qualified_at
  from requests r
  left join services s on s.id = r.detected_service_id
  where (r.created_at at time zone 'Europe/Zurich')::date between p_from and p_to
),
funnel as (
  select
    count(*) as requests,
    count(*) filter (where pr.qualified_at is not null) as qualified,
    count(*) filter (where exists (select 1 from opportunities o where o.request_id = pr.id)) as opportunities,
    count(*) filter (where exists (
      select 1 from opportunities o where o.request_id = pr.id and o.status = 'WON')) as won,
    avg(extract(epoch from (pr.qualified_at - pr.created_at)) / 3600.0)
      filter (where pr.qualified_at is not null) as avg_hours
  from period_requests pr
),
days as (
  select d::date as day from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
)
select jsonb_build_object(
  'kpis', jsonb_build_object(
    'requestsToday', (select count(*) from requests r
      where (r.created_at at time zone 'Europe/Zurich')::date = (now() at time zone 'Europe/Zurich')::date),
    'requestsInPeriod', (select requests from funnel),
    'newProspects', (select count(*) from clients c
      where c.status = 'PROSPECT'
        and (c.created_at at time zone 'Europe/Zurich')::date between p_from and p_to),
    'toQualify', (select count(*) from requests r where r.status in (
      'NEW', 'RECEIVED', 'AI_ANALYZING', 'ANALYZED', 'FORM_PENDING', 'FORM_SENT',
      'WAITING_CLIENT', 'RESPONSE_RECEIVED', 'QUALIFYING')),
    'qualifiedInPeriod', (select qualified from funnel),
    'openOpportunities', (select count(*) from opportunities o where o.status not in ('WON', 'LOST')),
    'activeMissions', (select count(*) from missions m where m.status in ('IN_PROGRESS', 'BLOCKED')),
    'qualificationRate', (select case when requests = 0 then null
      else round(qualified::numeric / requests, 4) end from funnel),
    'avgHoursToQualify', (select round(avg_hours::numeric, 1) from funnel)
  ),
  'requestsByDay', coalesce((
    select jsonb_agg(jsonb_build_object('date', d.day, 'count', coalesce(c.n, 0)) order by d.day)
    from days d
    left join (select day, count(*) as n from period_requests group by day) c on c.day = d.day
  ), '[]'::jsonb),
  'requestsByService', coalesce((
    select jsonb_agg(jsonb_build_object('label', label, 'count', n) order by n desc, label)
    from (select coalesce(service_name, 'Non identifié') as label, count(*) as n
          from period_requests group by 1) t
  ), '[]'::jsonb),
  'requestsBySource', coalesce((
    select jsonb_agg(jsonb_build_object('label', label, 'count', n) order by n desc, label)
    from (select source::text as label, count(*) as n from period_requests group by 1) t
  ), '[]'::jsonb),
  'requestsByCountry', coalesce((
    select jsonb_agg(jsonb_build_object('label', label, 'count', n) order by n desc, label)
    from (select coalesce(nullif(trim(country), ''), 'Non renseigné') as label, count(*) as n
          from period_requests group by 1) t
  ), '[]'::jsonb),
  'funnel', (select jsonb_build_object(
    'requests', requests, 'qualified', qualified, 'opportunities', opportunities, 'won', won) from funnel),
  'opportunitiesByStage', coalesce((
    select jsonb_agg(jsonb_build_object('label', status::text, 'count', n))
    from (select status, count(*) as n from opportunities group by status) t
  ), '[]'::jsonb),
  'missionsByStatus', coalesce((
    select jsonb_agg(jsonb_build_object('label', status::text, 'count', n))
    from (select status, count(*) as n from missions group by status) t
  ), '[]'::jsonb)
);
$$;

insert into permissions (key, description) values
  ('reports.read', 'Consulter les rapports et indicateurs d''activité.');

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = 'reports.read'
where r.key <> 'TEAM_MEMBER';
