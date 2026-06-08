---
phase: 16-slug-resolution-history-provenance
plan: "02"
subsystem: db-migration
tags: [migration, slug, indexing, backfill, sql]
dependency_graph:
  requires: [16-01]
  provides: [slug-schema-for-api-01, slug-schema-for-phase-17]
  affects: [canonical_players, squads, rotations, replays]
tech_stack:
  added: []
  patterns: [partial-unique-index, immutable-sql-function, window-count-collision-backfill]
key_files:
  created:
    - src/infra/db/migrations/0006_slug_addressing.sql
  modified: []
decisions:
  - "ц→ts handled via replace() not translate() because translate() is 1:1 codepoint mapping"
  - "ь/ъ removed via replace() before translate() to avoid translate() length mismatch"
  - "Collision suffix applied to ALL duplicates (not just 2nd) for order-independence"
metrics:
  duration: "~10 minutes"
  completed: "2026-06-07"
  tasks_completed: 1
  tasks_total: 1
---

# Phase 16 Plan 02: Slug Addressing Migration Summary

Single shared migration `0006_slug_addressing.sql` adding indexed `slug text` column to 4 tables with immutable `slug_base()` SQL function byte-identical to TS `slugify()` and deterministic order-independent backfill.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | 0006_slug_addressing.sql | 41eb505 | src/infra/db/migrations/0006_slug_addressing.sql |

## What Was Built

**`src/infra/db/migrations/0006_slug_addressing.sql`** — one SQL migration that:

1. Adds `slug text` column (idempotent `if not exists`) to `canonical_players`, `squads`, `rotations`, `replays`.
2. Defines `create or replace function slug_base(input text) returns text language sql immutable` mirroring the TS `slugify()` algorithm from `slug.ts`:
   - Chained `replace()` for multi-char Cyrillic: ж→zh, ч→ch, ш→sh, щ→shch, ю→yu, я→ya, х→kh, ё→e, ц→ts (in that exact order, innermost-first)
   - `replace()` to remove ь and ъ (produce no Latin char)
   - `translate()` for remaining 22 single-char Cyrillic letters
   - `regexp_replace('[^a-z0-9]+', '-', 'g')` then `trim(both '-' from ...)`
3. Deterministic idempotent backfill for all 4 tables using `count(*) over (partition by slug_base(...)) > 1 as dup` for order-independent collision resolution; entity-prefix fallback (`p-`/`s-`/`r-`/`replay-`) when `slug_base()` returns empty.
4. Partial-unique indexes `uq_<table>_slug on <table>(slug) where slug is not null` on all 4 tables.
5. Plain btree indexes `idx_<table>_slug on <table>(slug)` on all 4 tables.

## How slug_base() Mirrors TS slugify()

The TS `slugify()` lowercases the input then iterates `CYRILLIC_TRANSLITERATION` using `replaceAll()` in declared order. The SQL `slug_base()` replicates this as chained `replace()` calls with the innermost being the first TS entry (ж→zh) and outermost being later entries — matching execution order. `ц→ts` requires `replace()` (not `translate()`) because `translate()` is strictly 1-codepoint→1-codepoint. Verified: `select slug_base('Игрок Вася')` → `igrok-vasya`.

## Verification Results

- `pnpm run db:migrate` — clean, no errors
- Re-run — idempotent (checksum guard skips already-applied file)
- `select count(*) filter (where slug is null) from canonical_players` → 0
- `select count(*) filter (where slug is null) from squads` → 0
- `select count(*) filter (where slug is null) from rotations` → 0
- `select count(*) filter (where slug is null) from replays` → 0
- `select slug_base('Игрок Вася')` → `igrok-vasya` (matches TS slugify)
- Partial-unique: duplicate non-null slug correctly rejected; multiple null slugs allowed
- `grep -c "add column if not exists slug"` → 4
- `grep -c "create unique index if not exists uq_"` → 4
- `pnpm test -- migrate` → 400/400 tests pass

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — pure DDL migration; no new network endpoints or auth paths.

## Self-Check: PASSED

- File exists: `src/infra/db/migrations/0006_slug_addressing.sql` ✓
- Commit 41eb505 exists ✓
- All acceptance criteria verified against live DB ✓
- 400 tests pass ✓
