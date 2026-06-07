# Phase 18: API Ergonomics, Admin & Winner-Fix - Pattern Map

**Mapped:** 2026-06-07
**Files analyzed:** 9 (3 modify, ~4 new in `src/modules/admin/`, 1 test extend, 1 app-wiring)
**Analogs found:** 9 / 9 (every work item has a same-repo analog)

> All line numbers are as-of this mapping. New files in `src/modules/admin/` follow the
> WRITE-route module shape (handlers take `pool: Pool` + `auth` options directly) — the
> public-stats READ-model triplet (`models.ts` interface + `empty-read-model.ts` stub +
> `routes/tests/fixtures.ts` double) does **NOT** apply to write routes. Auth via
> `requireRole` / `requireAnyRole` from `src/modules/auth/routes/authorization.ts`.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/modules/public-stats/repository.ts` (`mapBounty` + `BountyRow` + `listBounty` SELECT) | repository (mapper) | transform / CRUD-read | self — `mapCommanderPlayer` (1658-1665), `mapBounty` (1667-1676) | exact (in-file) |
| `src/modules/public-stats/routes/schemas.ts` (`BountySummaryResponse` +breakdown) | schema (TypeBox) | request-response | self — `CommanderSideResponse` (404-411), existing `BountySummaryResponse` (412-417) | exact (in-file) |
| `src/modules/public-stats/repository.ts` (`listCommanderSides` +`side`) | repository | CRUD-read (filtered list) | self — `listCommanderSides` (452-476), `rotationWhere` (1317-1333) | exact (in-file) |
| `src/modules/public-stats/routes/filters.ts` (`rotationFilters` → add `side`) | utility (filter builder) | transform | self — `rotationFilters` (124-126), `replayListFilters` (137-145) | exact (in-file) |
| `src/modules/admin/routes/rotations.ts` (NEW write routes) | controller (Fastify plugin) | CRUD-write (request-response) | `auth/routes/role-routes.ts` (admin `PUT /admin/users/:id/roles`, 59-85) + `requests/.../audit-patches/audit-patches.ts` (validation/error/422) | role-match (strong) |
| `src/modules/admin/routes/rotation-repository.ts` (NEW write data-access) | repository | CRUD-write (transactional) | `requests/routes/workflow-applier.ts` (`withClient` begin/commit/rollback, 76-91; param-bound SQL) | role-match (strong) |
| `src/modules/admin/routes/models.ts` (NEW options + types) | types | — | `requests/routes/models.ts` `RequestRouteOptions` (197-208) | role-match |
| `src/app.ts` (register admin routes + inject Pool) | config (wiring) | — | `app.ts` request-module wiring (91-106, 123-136) | exact (in-file) |
| `src/test/integration/steamid-leak-guard.test.ts` (extend route list) | test | — | self — `PUBLIC_DETAIL_ROUTES` (51-62), real-pg sweep blocks | exact (in-file) |
| `src/modules/admin/routes/tests/*.test.ts` + winner-fix verify tests | test | — | `requests/routes/workflows/tests/index.test.ts`, `requests/routes/workflow-applier.test.ts` | role-match |

---

## Pattern Assignments

### API-02 — Bounty breakdown (`repository.ts` mapper + `schemas.ts`)

**Source of truth for the inputs shape (READ-ONLY):** `src/modules/statistics/bounty/bounty.ts:25-53`

```typescript
export interface BountyPointRow {
  inputs: {
    base_score: 1;
    events: BountyPointEventEvidence[];
    total_points: number;
    version: 1;
  };
  playerId: string;
  points: number;
}

export type BountyPointEventEvidence =
  | { excluded_reason: "missing_victim" | "non_enemy_kill" | "teamkill";
      event_type: BountyEventType; points: 0; replay_id: string;
      victim_player_id?: string; victim_squad_id?: string; }
  | { event_type: "kill"; player_factor: number; points: number;
      replay_id: string; squad_factor: number;
      victim_player_id: string; victim_squad_id?: string; };
```

> The counted-kill arm carries `player_factor` + `squad_factor`; the excluded arm carries
> `excluded_reason` + `points: 0`. Discriminate on `event_type === "kill"` (the counted arm
> is the only one with `player_factor`/`squad_factor`).

**Current `BountyRow` (repository.ts:176-182) — must ADD `inputs`:**
```typescript
interface BountyRow {
  display_name: string;
  id: string;
  player_id: string;
  points: string;
  rotation_id: string;
}
```

**Current `listBounty` SELECT (repository.ts:494-503) — must ADD `bounty.inputs`** (it is NOT selected today):
```typescript
result = await this.pool.query<BountyRow>(
  `
    select bounty.id, bounty.rotation_id, bounty.points,
      players.id as player_id, players.display_name
    from bounty_points bounty
    join canonical_players players on players.id = bounty.player_id
    ${whereClause}
    order by ${seek.orderBySql}
    limit $${String(values.length)}
  `,
  values,
);
```
> Add `bounty.inputs` to the column list so `mapBounty` can read it. `getLeaderboards`
> (511-534) reuses `listBounty`, so the breakdown flows to `/stats/leaderboards` for free —
> no second query change.

**Mapper analog — `mapBounty` (repository.ts:1667-1676), the function to extend:**
```typescript
function mapBounty(row: BountyRow): BountySummary {
  return {
    player: { displayName: row.display_name, id: row.player_id },
    points: Number(row.points),
    rotationId: row.rotation_id,
  };
}
```
> Defensive-null pattern to mirror: `mapCommanderPlayer` (1658-1665) returns `null` on a
> null discriminator. Apply the same shape: `inputs == null || inputs.version !== 1`
> → `breakdown: null`. Fold `inputs.events` once: for each `event_type === "kill"` entry
> `countedKills++; victimEffectiveness += player_factor; squadEffectiveness += squad_factor`;
> `baseScore = inputs.base_score * countedKills`. NO recompute, NO Steam64 in the aggregate.

**Schema analog — extend `BountySummaryResponse` (schemas.ts:412-417):**
```typescript
BountySummaryResponse = Type.Object({
  player: PlayerReferenceResponse,
  points: Type.Number(),
  rotationId: Type.String({ format: "uuid" }),
}),
```
> Add an **optional/nullable** `breakdown: Type.Union([Type.Object({ countedKills,
> victimEffectiveness, squadEffectiveness, baseScore: Type.Number() }), Type.Null()])`.
> Because `BountyListResponse`/`LeaderboardsResponse` (417-423) wrap `BountySummaryResponse`,
> the breakdown auto-propagates to the leaderboard contract.

**Domain-type mirror — `BountySummary` (routes/models.ts:391-395):** add the matching
`breakdown` field (TypeBox schema and the TS interface are kept in lockstep — see how
`CommanderSideSummary` 382-389 mirrors `CommanderSideResponse` 404-411).

---

### API-03 — Commander-side `side` filter (`repository.ts` + `filters.ts`)

**Filter type — `RotationFilters` (routes/models.ts:147-149):** add `side?: string`. (Mirror
how `PlayerListFilters`/`SquadListFilters` 151-157 extend it with `search?`.)

**Filter builder analog — `rotationFilters` (filters.ts:124-126) + the spread pattern in
`replayListFilters` (137-145):**
```typescript
export function rotationFilters(query: RotationFilters): RotationFilters {
  return query.rotationId === undefined ? {} : { rotationId: query.rotationId };
}

export function replayListFilters(query: ReplayListQueryType): ReplayListFilters {
  return {
    ...rotationFilters(query),
    ...(query.fromDate === undefined ? {} : { fromDate: query.fromDate }),
    ...(query.toDate === undefined ? {} : { toDate: query.toDate }),
  };
}
```
> Follow the exact `...(x === undefined ? {} : { x })` conditional-spread idiom for the new
> optional `side`. Add the `side` query field to the commander-side query schema in
> `schemas.ts` alongside `rotationId`.

**Query analog — `listCommanderSides` (repository.ts:452-476) + `rotationWhere` helper
(1317-1333):**
```typescript
public async listCommanderSides(filters: RotationFilters): Promise<CommanderSideSummary[]> {
  const condition = rotationWhere(filters, "commander.rotation_id"),
    result = await this.pool.query<CommanderSideRow>(
      `
        select commander.rotation_id, commander.side, commander.known_wins,
          commander.known_losses, commander.unknown_outcomes,
          players.id as player_id, players.display_name
        from commander_side_stats commander
        left join canonical_players players on players.id = commander.player_id
        ${condition.sql}
        order by commander.rotation_id desc, commander.side, players.display_name nulls last
      `,
      condition.values,
    );
  // ...maps to CommanderSideSummary
}
```
```typescript
function rotationWhere(filters: RotationFilters, columnName: string): RotationWhereClause {
  if (filters.rotationId === undefined) {
    return { sql: "", sqlWith: (extra) => `where ${extra}`, values: [] };
  }
  return {
    sql: `where ${columnName} = $1`,
    sqlWith: (extra) => `where ${columnName} = $1 and ${extra}`,
    values: [filters.rotationId],
  };
}
```
> Compose `commander.side = $n::text` alongside the rotation predicate using the
> `sqlWith(extra)` combinator already on `RotationWhereClause` (note the `::text` cast idiom
> used elsewhere). Bind the side value as the next `$n` (append to `condition.values`). Keep
> the existing `order by commander.rotation_id desc, commander.side, players.display_name
> nulls last`. No pagination change — full filtered set, as today.
>
> **`unknownOutcomes` is already exposed** (`CommanderSideRow.unknown_outcomes` 173 →
> `CommanderSideResponse.unknownOutcomes` schemas.ts:410). API-03's "explicit unknown"
> requirement is satisfied — verify with a test, do not duplicate the field.

---

### API-04 — Admin rotation CRUD (NEW `src/modules/admin/`)

**Auth guard analog — `role-routes.ts` (admin-only write, the closest CRUD shape):**
```typescript
export function registerRoleRoutes(app: FastifyInstance, options: AuthRouteOptions): void {
  app.put<{ Body: RolesBodyType; Params: UserIdParametersType }>(
    "/admin/users/:id/roles",
    {
      schema: {
        body: RolesBody,
        params: UserIdParameters,
        response: { 200: UserResponse, 401: AuthErrorResponse,
                    403: AuthErrorResponse, 404: NotFoundResponse },
        tags: ["admin"],
      },
      preHandler: requireRole(options, "admin"),
    },
    async (request, reply) => {
      const user = await options.users.setUserRoles(request.params.id, request.body.roles);
      return user ?? reply.code(NOT_FOUND).send({ message: "user not found" });
    },
  );
}
```
> Mirror exactly: `tags: ["admin"]`, `preHandler: requireRole(options.auth, "admin")`
> (admin only — NOT moderator), TypeBox `body` + `params` with `id: Type.String({ format:
> "uuid" })`, `{ message }` error bodies, `response` map enumerating every status code.
> `requireRole`/`requireAnyRole` source: `auth/routes/authorization.ts:25-47` (it already
> handles 401 unauth + 403 missing-role before your handler runs).

**Status-code + business-validation analog — `audit-patches.ts:9-108`** (the 422/404 pattern):
```typescript
const NOT_FOUND = 404, UNPROCESSABLE = 422;
// ...
if (parentRequest === null) {
  return reply.code(NOT_FOUND).send({ message: "request not found" });
}
if (parentRequest.type !== "stats_correction" || parentRequest.status !== "approved") {
  return reply.code(UNPROCESSABLE).send({ message: "request must be an approved stats correction" });
}
```
> Use named status constants (`const CREATED = 201, CONFLICT = 409, NOT_FOUND = 404,
> UNPROCESSABLE = 422`) as in `routes.ts:13-16` and `audit-patches.ts:9-10`. Routes:
> `POST /admin/rotations` → 201, `PUT /admin/rotations/:id` → 200, `DELETE` → 204.

**Transaction + param-bound SQL analog — `workflow-applier.ts` `withClient` (76-91):**
```typescript
private async withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await this.pool.connect();
  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
```
> The admin rotation repository takes `private readonly pool: Pool` (constructor-injected,
> same as `PgRequestWorkflowApplier` 31-35) and runs each write inside `withClient`. All
> values bound as `$n` — never interpolated (every `client.query` in the applier binds an
> array, e.g. lines 104-117).

**Slug generation (server-side, never client-supplied) — `slug_base()` SQL from migration
`0006_slug_addressing.sql:32-62`:**
```sql
create or replace function slug_base(input text) returns text
language sql immutable as $$ ... $$;
```
> On create: `insert into rotations (name, starts_at, ends_at, slug) values ($1,$2,$3,
> slug_base($1)) returning id, name, slug, starts_at, ends_at`. On name change in update:
> regenerate `slug = slug_base($newName)`. The collision-suffix backfill in 0006 (72-134) is
> a one-shot migration concern; for live writes rely on the `uq_rotations_slug` partial-unique
> index (0006:144-145) — a slug collision surfaces as `23505`.

**Constraint → HTTP mapping (DDL from `0001_v1_domain_schema.sql:94-101`):**
```sql
create table rotations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
```
> Map `name` UNIQUE violation `23505` → **409**; `ends_at > starts_at` CHECK violation
> `23514` → **422**. Catch the `pg` error `code` in the repository or handler and translate
> to the `{ message }` shape. Unknown id → **404**; non-admin → **403** (from `requireRole`).

**DELETE safety pre-check (LOCKED, one transaction) — bind `$1`, refuse non-empty:**
```sql
select 1 from replays where rotation_id=$1
union all select 1 from commander_side_stats where rotation_id=$1
union all select 1 from bounty_points where rotation_id=$1
limit 1
```
> If any row → **409 Conflict** with a clear message; else `delete from rotations where id=$1`
> in the same `withClient` transaction. (`commander_side_stats`/`bounty_points` FKs are NOT
> NULL — cascading would silently destroy derived stats.)

**Options + types analog — `requests/routes/models.ts` `RequestRouteOptions` (197-208):**
```typescript
export interface RequestRouteOptions {
  auth: AuthRouteOptions;
  moderation: RequestModerationRepository;
  // ...other repos
}
```
> Define `AdminRouteOptions { auth: AuthRouteOptions; rotations: AdminRotationRepository }`
> (a thin contract `type` + a `Pg…` impl taking `Pool`, per conventions §B factory/contract
> rule). `register…Routes(app, options)` async-plugin signature as in every analog
> (`registerRequestWorkflowRoutes` workflows.ts:52, `registerAuditPatchRoutes`
> audit-patches.ts:49).

**App wiring analog — `app.ts:91-106` (register) + `123-136` (default options):**
```typescript
await registerRequestWorkflowRoutes(app, { auth, ...requests });
```
> Add `await registerAdminRoutes(app, { auth, rotations: <PgRotationRepo from pool> })`.
> Follow `createDefaultRequestOptions` (123-136) for an in-memory/noop default so `buildApp()`
> with no DB still constructs; the real `Pool`-backed impl is injected the same way
> `PgPublicStatsReadModel(pool)` is injected in tests (see leak-guard 258-259).

---

### HIST-04 — Winner-fix verify-and-freeze (`workflows.ts` + `workflow-applier.ts`)

**Route (DO NOT REBUILD) — `workflows.ts:58-104`:** `POST /moderation/requests/:id/workflows`,
`preHandler: requireAnyRole(options.auth, ["admin","moderator"])` (workflows.ts:56), body
`{ action, payload }` with `action` literal `"legacy_winner_fix"` (24-29), 404/422 guards,
`tags: ["moderation"]`. The `workflowMatchesRequest` gate (131-142) requires
`requestType === "stats_correction"` for `legacy_winner_fix`.

**Applier (DO NOT REBUILD) — `workflow-applier.ts:94-122`:**
```typescript
async function applyLegacyWinnerFix(client: PoolClient, input: ApplyRequestWorkflowInput) {
  const replayId = requiredString(input.payload, "replayId"),
    winnerSide = requiredString(input.payload, "winnerSide"),
    winnerSideJson = { state: "present", value: winnerSide };
  const result = await client.query<ParserResultIdRow>(
    `
      update parser_results
      set raw_snapshot = jsonb_set(
        jsonb_set(raw_snapshot, '{side_facts,outcome,status}', '"known"', true),
        '{side_facts,outcome,winner_side}', $2::jsonb, true
      )
      where replay_id = $1 and status = 'current'
      returning id::text
    `,
    [replayId, JSON.stringify(winnerSideJson)],
  );
  return { parserResultIds: result.rows.map((row) => row.id), status: "legacy_winner_applied" };
}
```
> Downstream recalc: `applyWorkflowAction` (37-64) calls
> `recalculateCommanderSideStatsForParserResult(parserResultId)` per returned id (66-74).
> The audit/workflow-action row is written by `options.workflows.createWorkflowAction(input)`
> after the applier runs (workflows.ts:102).

**Test analog — `requests/routes/workflows/tests/index.test.ts` + `workflow-applier.test.ts`:**
add/confirm integration coverage that FREEZES current behavior (no endpoint change unless a
gap is found): (1) non-admin/non-moderator → rejected (role guard 401/403); (2) approved
`stats_correction` + `legacy_winner_fix` → `raw_snapshot.side_facts.outcome` becomes
`status:"known"` + the given `winner_side`; (3) `commander_side_stats` recalculated
(unknown→known); (4) a workflow-action audit row exists.

**Leak-guard extension — `steamid-leak-guard.test.ts`:** the current sweep lists are
GET-only (`PUBLIC_LIST_ROUTES` 33-38, `PUBLIC_DETAIL_ROUTES` 51-62) using `expectNoSteam64`
(27-31) against `/7656119\d{10}/u`. Extend the sweep to the workflow response body (and the
new `/admin/rotations` write-route bodies) if not already covered — assert
`expectNoSteam64(response.json())` + `expectNoSteam64(response.payload)`.

---

## Shared Patterns

### Authentication / authorization
**Source:** `src/modules/auth/routes/authorization.ts:25-47`
**Apply to:** every admin route (API-04) and the winner-fix verification (HIST-04)
```typescript
export function requireRole(options: AuthRouteOptions, role: RequiredRole) {
  return requireAnyRole(options, [role]);
}
export function requireAnyRole(options: AuthRouteOptions, roles: RequiredRole[]) {
  return async (request, reply) => {
    const user = await currentUser(options, request.headers.cookie);
    if (user === null) return reply.code(401).send({ message: "authentication required" });
    if (!roles.some((role) => user.roles.includes(role)))
      return reply.code(403).send({ message: "required role missing" });
    return undefined;
  };
}
```
> Admin CRUD = `requireRole(options.auth, "admin")`. Winner-fix stays
> `requireAnyRole(options.auth, ["admin","moderator"])` (already in place — do not change).

### Error / response shape
**Source:** `audit-patches.ts:12-14`, `moderation.ts:17-19`, `role-routes.ts:24-29`
**Apply to:** all new write routes
```typescript
const ErrorResponse = Type.Object({ message: Type.String() });
// reply.code(NNN).send({ message: "..." })
```
> Every error body is `{ message: string }`. Enumerate every status code in the route's
> `response` map (200/201/204, 401, 403, 404, 409, 422 as applicable).

### TypeBox schema discipline
**Source:** `role-routes.ts:10-29`, `workflows.ts:18-41`
**Apply to:** all new schemas
> Schemas declared as `const Name = Type.Object({...})` (grouped in one `const`), a matching
> `interface NameType { ... }` for the route generic `app.post<{ Body; Params }>`, ids as
> `Type.String({ format: "uuid" })`, timestamps as `Type.String({ format: "date-time" })`,
> required strings as `Type.String({ minLength: 1 })`. `/* eslint-disable new-cap */` header
> is the established convention for TypeBox files.

### Transactional write data-access
**Source:** `workflow-applier.ts:31-91`
**Apply to:** admin rotation repository
> `private readonly pool: Pool` injected; every multi-statement write wrapped in
> `withClient` (begin/commit/rollback/release); all params bound as `$n`.

---

## No Analog Found

None. Every work item maps to an existing same-repo file. The only genuinely NEW surface
is `src/modules/admin/` (write module), and it has a strong analog in the
`requests/.../moderation` + `auth/.../role-routes` write-route shape — it is a new directory,
not a new pattern.

---

## Metadata

**Analog search scope:** `src/modules/{public-stats,auth,requests,statistics}`,
`src/infra/db/migrations`, `src/test/integration`, `src/app.ts`
**Files scanned:** 13 read + targeted greps
**Pattern extraction date:** 2026-06-07
