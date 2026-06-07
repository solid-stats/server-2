-- Phase 16 (SLUG-02): slug column + partial-unique + btree indexes on
-- canonical_players, squads, rotations, replays; immutable slug_base() helper;
-- deterministic order-independent backfill mirroring the TS slugify() in slug.ts.
--
-- migrate.ts contract: runs once in one begin/commit, sha256-checksummed.
-- Backfill is written idempotently (add column if not exists, update where slug
-- is null) so a fresh/recreated DB succeeds and a partial failure rolls back
-- cleanly (no half-state).

-- ─── 1. Columns (idempotent) ────────────────────────────────────────────────

alter table canonical_players add column if not exists slug text;
alter table squads            add column if not exists slug text;
alter table rotations         add column if not exists slug text;
alter table replays           add column if not exists slug text;

-- ─── 2. slug_base() — byte-identical to TS slugify() in slug.ts ─────────────
--
-- Algorithm (MUST match CYRILLIC_TRANSLITERATION order in slug.ts exactly):
--   a. lower(coalesce(input,''))
--   b. Multi-char Cyrillic→Latin via chained replace() — BEFORE translate():
--      ж→zh, ч→ch, ш→sh, щ→shch, ю→yu, я→ya, х→kh, ё→e  (in this order)
--   c. Remove soft/hard signs (ь, ъ produce no Latin char) via replace()
--   d. Single-char Cyrillic→Latin via translate():
--      а→a, б→b, в→v, г→g, д→d, е→e, з→z, и→i, й→j, к→k, л→l, м→m,
--      н→n, о→o, п→p, р→r, с→s, т→t, у→u, ф→f, ц→ts, ы→y, э→e
--      NB: ц→ts is two chars; translate() is 1:1 so we handle ц via replace()
--          before the translate() call (same approach as multi-char above).
--   e. regexp_replace('[^a-z0-9]+', '-', 'g')
--   f. trim(both '-' from ...)

create or replace function slug_base(input text) returns text
language sql immutable as $$
  select
    trim(both '-' from
      regexp_replace(
        translate(
          replace(replace(replace(replace(replace(replace(replace(replace(
            replace(replace(
              lower(coalesce(input, '')),
            -- step b: multi-char sequences (order matters — mirrors CYRILLIC_TRANSLITERATION)
            'ж', 'zh'),   -- ж → zh
            'ч', 'ch'),   -- ч → ch
            'ш', 'sh'),   -- ш → sh (must come before щ→shch because щ starts with ш)
            'щ', 'shch'), -- щ → shch
            'ю', 'yu'),   -- ю → yu
            'я', 'ya'),   -- я → ya
            'х', 'kh'),   -- х → kh
            'ё', 'e'),    -- ё → e
          -- step b-extra: multi-char single-char (ц→ts) via replace before translate
            'ц', 'ts'),   -- ц → ts
          -- step c: soft/hard signs produce no char — remove
            'ь', ''),     -- ь → (empty)
          -- step d: single-char Cyrillic→Latin via translate (remaining letters)
          'абвгдезийклмнопрстуфыэ',
          'abvgdezijklmnoprstufye'
        ),
        '[^a-z0-9]+', '-', 'g'
      )
    )
$$;

-- ─── 3. Deterministic idempotent backfill ───────────────────────────────────
--
-- Collision rule: if slug_base(name) is shared by more than one row (window
-- count > 1), append '-' || suffix to every such row. This is order-independent
-- because every duplicate gets the suffix, not just the "second" one.
-- Empty base → entity-prefix fallback ('p-'/'s-'/'r-'/'replay-' || suffix).
-- Guard: update ... where slug is null (idempotent for fresh DB).

update canonical_players p
set slug = case
  when sg.base = '' then 'p-' || sg.suffix
  when sg.dup     then sg.base || '-' || sg.suffix
  else sg.base
end
from (
  select
    id,
    slug_base(display_name) as base,
    substr(replace(id::text, '-', ''), 1, 6) as suffix,
    count(*) over (partition by slug_base(display_name)) > 1 as dup
  from canonical_players
) sg
where p.id = sg.id and p.slug is null;

update squads p
set slug = case
  when sg.base = '' then 's-' || sg.suffix
  when sg.dup     then sg.base || '-' || sg.suffix
  else sg.base
end
from (
  select
    id,
    slug_base(name) as base,
    substr(replace(id::text, '-', ''), 1, 6) as suffix,
    count(*) over (partition by slug_base(name)) > 1 as dup
  from squads
) sg
where p.id = sg.id and p.slug is null;

update rotations p
set slug = case
  when sg.base = '' then 'r-' || sg.suffix
  when sg.dup     then sg.base || '-' || sg.suffix
  else sg.base
end
from (
  select
    id,
    slug_base(name) as base,
    substr(replace(id::text, '-', ''), 1, 6) as suffix,
    count(*) over (partition by slug_base(name)) > 1 as dup
  from rotations
) sg
where p.id = sg.id and p.slug is null;

update replays p
set slug = case
  when sg.base = '' then 'replay-' || sg.suffix
  when sg.dup     then sg.base || '-' || sg.suffix
  else sg.base
end
from (
  select
    id,
    slug_base(source_system || '-' || source_replay_id) as base,
    substr(replace(id::text, '-', ''), 1, 6) as suffix,
    count(*) over (partition by slug_base(source_system || '-' || source_replay_id)) > 1 as dup
  from replays
) sg
where p.id = sg.id and p.slug is null;

-- ─── 4. Partial-unique indexes (reject duplicate non-null slugs) ─────────────

create unique index if not exists uq_canonical_players_slug
  on canonical_players (slug) where slug is not null;

create unique index if not exists uq_squads_slug
  on squads (slug) where slug is not null;

create unique index if not exists uq_rotations_slug
  on rotations (slug) where slug is not null;

create unique index if not exists uq_replays_slug
  on replays (slug) where slug is not null;

-- ─── 5. Plain btree indexes (fast lookup by slug) ────────────────────────────

create index if not exists idx_canonical_players_slug
  on canonical_players (slug);

create index if not exists idx_squads_slug
  on squads (slug);

create index if not exists idx_rotations_slug
  on rotations (slug);

create index if not exists idx_replays_slug
  on replays (slug);
