# Phase 17: Replay Surface - Context

**Gathered:** 2026-06-07
**Status:** Ready for planning
**Source:** Autonomous discuss (grey areas auto-decided per /gsd:autonomous; cross-app boundary respected)

<domain>
## Phase Boundary

Deliver the public replay read surface on `server-2` so `web` can build its replay
pages: list (filtered + cursor-paginated), detail (map best-effort, rotation, date,
per-side summary, participants, provenance), paginated event timeline, and an SEO
sitemap. All work is additive pattern reuse on the shipped `public-stats` module —
**zero new runtime dependencies**, **no cross-app contract changes**.

Out of scope: parsing OCAP (lives in `replay-parser-2`), ingest/crawl (lives in
`replays-fetcher`), any write to business tables, any new parser-contract field.
</domain>

<decisions>
## Implementation Decisions (LOCKED)

### Data sources (grounded in live schema — confirmed empty-DB inspection 2026-06-07)
- `replays` columns to expose: `id`, `slug`, `rotation_id`, `replay_timestamp`,
  `source_system`, `source_replay_id`, `created_at`, `status`. There is **no map column**.
- Events live in `parser_events` and have **no `replay_id`** — they join through
  `parser_results` (`parser_events.parser_result_id = parser_results.id`,
  `parser_results.replay_id = replays.id`, `parser_results.status = 'current'`).
- Per-side / participant / map data come from `parser_results.raw_snapshot` (jsonb),
  shape per `ParserArtifact` in `src/modules/statistics/parser-artifact.ts`
  (`players[]`, `side_facts.{commanders,outcome}`, opaque `replay`).

### REPLAY-01 — List
- Filters for v1: **`rotationId` and date range only** (both backed by the real
  `idx_replays_rotation_timestamp` index). Cursor keyset over
  `(replay_timestamp DESC NULLS LAST, id DESC)` reusing the Phase 14 keyset helpers.
- **Map filter is DEFERRED** (documented v1 limitation). Reason: no `map` column
  exists and `raw_snapshot.replay` is an opaque, untyped object the parser contract
  does not guarantee. Adding `replays.map_name` is a cross-app data-model change
  requiring `replay-parser-2` / `replays-fetcher` coordination — out of bounds for an
  autonomous backend session per AGENTS.md. Carry forward as a follow-up.

### REPLAY-02 — Detail
- Shape: `{ id, slug, rotation:{id,slug,name}|null, replayTimestamp:string|null,
  map:string|null, sides:[...perSideSummary], participants:[...], provenance:{lastUpdatedAt} }`.
- `map`: best-effort `string | null` — a defensive extractor reads the opaque
  `raw_snapshot.replay` for the first string among candidate keys
  (`mission`, `missionName`, `world`, `worldName`, `map`, `mapName`); `null` when absent.
  Read-only surfacing of whatever the parser already wrote — invents no write contract.
- Per-side summary derives from `side_facts`: `{ side, outcome (winner_side/status from
  side_facts.outcome), commander (masked actor reference), participantCount }`, grouping
  `players[]` by their side field where present.
- Participants: `{ player:{id,slug,displayName} (canonical-resolved when `sid` maps,
  else raw observed name + null id/slug), steamId: masked-last-4 | null, kills, deaths,
  teamkills, ... }`. **No full Steam64 anywhere** — route through the existing
  `maskSteamId` choke point.
- `provenance.lastUpdatedAt` computed at the mapper boundary via `maxTimestamp` over the
  actual returned rows (parser_result.created_at, replay timestamps), never `now()`.
- Resolve `:id` slug-or-uuid via the `looksLikeUuid` branch (never cast a slug to `::uuid`).

### REPLAY-03 — Event timeline
- Keyset cursor `(occurred_at ASC NULLS FIRST, id ASC)` via the existing nullable keyset
  path (`buildKeysetPredicate`). Deterministic for legacy NULL `occurred_at` rows
  (NULLS FIRST groups them at the head, `id` tiebreaks).
- **Hard max page size: 200** (clamp requested limit; default 50).
- Add index in a new migration `0007` on `parser_events (parser_result_id, occurred_at, id)`
  to back the join + keyset order.
- Event item: `{ id, eventType, occurredAt:string|null, actor (masked/canonical ref),
  payload (jsonb passthrough, scrubbed of any Steam64) }`.

### REPLAY-04 — Sitemap
- Sitemap **index** at `/sitemap.xml` listing **child** sitemaps; each child
  (`/sitemap-replays-<n>.xml`, flat path, `<n>` 0-based) enumerates ≤ **50,000** replay URLs.
- URLs use `replays.slug` under `PUBLIC_BASE_URL` (env-configured base; the replay page
  path on `web`). Rows with null slug are skipped.
- Hand-serialized XML (sitemaps.org 0.9 protocol), correct `application/xml`
  content-type. **No gzip for v1.**

### Cross-cutting (reuse, do not reinvent)
- Read-model contract dual-declaration: every new method appears in BOTH
  `routes/models.ts` interface AND `empty-read-model.ts` stub AND the test double in
  `routes/tests/fixtures.ts` (boot-without-DB must not break).
- Extend the Steam64 leak-guard test (`src/test/integration/steamid-leak-guard.test.ts`)
  to cover `/replays`, `/replays/:id`, `/replays/:id/events` (and the sitemap routes).
- OpenAPI must regenerate clean (`pnpm run openapi:check`); 100% reachable-source
  coverage gate holds.

### Claude's Discretion
- Exact TypeBox schema field ordering, helper file names, SQL formatting, and test
  layout — follow established `public-stats` conventions.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Replay surface research
- `.planning/phases/17-replay-surface/17-RESEARCH.md` — implementation-ready research
  (schema, patterns, pitfalls, grey-area options).

### Patterns to mirror (this repo)
- `src/modules/public-stats/repository.ts` — read-model + keyset + slug-or-uuid + masking.
- `src/modules/public-stats/routes/routes.ts` / `routes/schemas.ts` — route + TypeBox.
- `src/modules/public-stats/routes/models.ts` + `empty-read-model.ts` + `routes/tests/fixtures.ts` — read-model contract.
- `src/modules/public-stats/routes/pagination/*` — Phase 14 keyset/cursor helpers.
- `src/modules/public-stats/routes/provenance.ts` + `slug.ts` — provenance + slug helpers.
- `src/modules/statistics/parser-artifact.ts` — `ParserArtifact` / `raw_snapshot` shape.
- `src/test/integration/steamid-leak-guard.test.ts` — leak guard route list.
- `src/infra/db/migrations/*.sql` — migration style (sequential, idempotent, checksummed).

</canonical_refs>

<specifics>
## Specific Ideas

- Event query template: `from parser_events e join parser_results pr on pr.id =
  e.parser_result_id where pr.replay_id = $1 and pr.status = 'current'` ordered by the
  keyset. Resolve `:id` (slug-or-uuid) to the replay UUID first.
- Sitemap counting: `select count(*) from replays where slug is not null` to compute the
  number of child sitemaps (ceil / 50000).
</specifics>

<deferred>
## Deferred Ideas

- **Map filter + reliable map field** (REPLAY-01/02): needs a cross-app decision on
  populating `replays.map_name` (or a guaranteed `raw_snapshot.replay.<key>`) in
  `replay-parser-2` / `replays-fetcher`. v1 ships map as best-effort nullable in detail
  and omits the map list-filter.
- Sitemap gzip / lastmod / changefreq enrichment — v1 ships minimal valid sitemaps.
- Approximate total/count endpoints — current pattern is cursor-only, no COUNT.
</deferred>

---

*Phase: 17-replay-surface*
*Context gathered: 2026-06-07 via autonomous discuss (grey areas auto-decided)*
