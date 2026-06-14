-- 260615-f13b deaths under-count — read-only staging diagnostics (KUBECONFIG=/tmp/kube-tunnel.yaml,
-- kubectl -n solid-stats-staging exec postgres-0 -- psql -U solid -d solid_stats -tAc "<sql>")

-- 1. Zero (000a2ac8-...): 653 distinct sg replays with artifact d>0, 894 total replays.
--    Recalc deaths=621, games=894 => 32 death-games dropped.
with players as (
  select pr.id as prid, r.id as rid, r.replay_timestamp, p
  from parser_results pr join replays r on r.id = pr.replay_id
  cross join lateral jsonb_array_elements(pr.raw_snapshot->'players') as p
  where pr.status='current' and r.game_type='sg' and r.replay_timestamp is not null
)
select count(distinct rid) filter (where lower(p->>'n')='zero' and coalesce((p->>'d')::int,0) > 0) as d_pos_replays,
       count(distinct rid) filter (where lower(p->>'n')='zero')                                    as all_replays
from players;

-- 2. The drop classification: of Zero's 653 d>0 replays, 621 are credited
--    (counter event OR victim kill row), 32 dropped (NEITHER). All 32 have
--    counter_evt_count = 0 in parser_events (the stale-events root cause).
with zr as (
  select pr.id as prid, r.id as rid, (p->>'eid') as eid
  from parser_results pr join replays r on r.id=pr.replay_id
  cross join lateral jsonb_array_elements(pr.raw_snapshot->'players') p
  where pr.status='current' and r.game_type='sg' and r.replay_timestamp is not null
    and lower(p->>'n')='zero' and coalesce((p->>'d')::int,0)>0
), flags as (
  select zr.*,
    exists(select 1 from parser_events pe where pe.parser_result_id=zr.prid and pe.event_type='player_counter'
           and pe.observed_player_ref=zr.eid and coalesce((pe.payload->>'deaths_total')::int,0)>0) as has_counter_death,
    exists(select 1 from parser_events pe where pe.parser_result_id=zr.prid
           and pe.event_type in ('kill','teamkill','unknown_kill') and (pe.payload->>'victim_entity_id')::int = zr.eid::int) as has_victim_death
  from zr
)
select count(*) as total_d_pos,
       count(*) filter (where has_counter_death or has_victim_death) as counted_deaths,
       count(*) filter (where not has_counter_death and not has_victim_death) as dropped_deaths
from flags;

-- 3. SYSTEMIC: of 2064 current sg parser_results, 1850 with artifact d players have
--    ZERO player_counter events in parser_events; only 209 have them. The bulk
--    full-run never re-persists parser_events from raw_snapshot, so the counter
--    death path is empty for ~90% of replays — this is the platform-wide undercount.
with cur as (
  select pr.id,
    (select count(*) from jsonb_array_elements(pr.raw_snapshot->'players') p where p ? 'd') as art_d_players,
    (select count(*) from parser_events pe where pe.parser_result_id=pr.id and pe.event_type='player_counter') as counter_evt
  from parser_results pr join replays r on r.id=pr.replay_id
  where pr.status='current' and r.game_type='sg' and r.replay_timestamp is not null
)
select count(*) as total_current_sg,
       count(*) filter (where art_d_players>0) as have_artifact_d,
       count(*) filter (where art_d_players>0 and counter_evt=0) as d_but_no_counter_events,
       count(*) filter (where art_d_players>0 and counter_evt>0) as d_with_counter_events
from cur;

-- 4. Concrete dropped replay 9eb1a2ad-... (2021-05-14), current prid 3662f461-...:
--    raw_snapshot Zero = {d:1, nkd:1, eid:203} (171/193 players carry compact counters);
--    parser_events = 140 kill / 18 destroyed_vehicle / 6 teamkill / 1 diagnostic, 0 player_counter;
--    no kill row with victim_entity_id=203 => death dropped, game kept.
select pe.event_type, count(*)
from parser_events pe
join parser_results pr on pr.id = pe.parser_result_id
where pr.replay_id = '9eb1a2ad-60b8-4692-8520-47d8362c207c' and pr.status='current'
group by pe.event_type order by 2 desc;
