-- =====================================================================
-- Migration 0010: flight options with one change of plane.
-- A connecting option is one row: airline 'IndiGo + Emirates', flight_no '6E 1461 + EK 501',
-- depart_time from the first flight and arrive_time from the second.
-- =====================================================================

alter table lead_flight_options add column if not exists via_code text;                 -- where you change planes; null = direct
alter table lead_flight_options add column if not exists layover_min integer;           -- minutes on the ground at via_code
alter table lead_flight_options add column if not exists arrive_day_offset smallint not null default 0;  -- 1 = lands the next day
