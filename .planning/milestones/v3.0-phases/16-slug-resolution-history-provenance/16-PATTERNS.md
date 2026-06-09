# Phase 16: Slug Resolution, History & Provenance - Pattern Map

**Mapped:** 2026-06-07
**Files analyzed:** 9 (3 new, 6 modified)
**Analogs found:** 9 / 9

> **Архитектурная реальность (из 16-RESEARCH).** Модуль `public-stats` использует
> raw `pg` Pool + класс `PgPublicStatsReadModel` + append-only `.sql` миграции
> (без `down`), а НЕ Kysely / layered-factory, которую аспирационно прописывает
> skill `solidstats-backend-ts-conventions`. Все паттерны ниже зеркалят
> **фактические** паттерны Phase 14/15 в этом модуле. Дисциплина skill (bound every
> string/array, типы из схем, response-schema всегда объявлена, один masking
> choke point, integration-тест репозитория) применяется поверх.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/infra/db/migrations/0006_*.sql` | migration | batch / DDL+backfill | `src/infra/db/migrations/0005_keyset_indexes.sql` (+ `0001` table shapes) | role-match (index conv.); backfill has no in-repo analog |
| `src/modules/public-stats/routes/slug.ts` (NEW) | utility (pure) | transform | `src/modules/public-stats/routes/pagination/mask.ts` (pure choke-point helper) | role-match |
| `src/modules/public-stats/routes/history-gaps.ts` (NEW) | utility (pure) | transform | `src/modules/public-stats/routes/pagination/mask.ts` (pure, unit-tested) | role-match |
| `src/modules/public-stats/repository.ts` | repository (read model) | CRUD-read / request-response | itself: `getPlayer` (298-319), `getSquad` (354-377), `listSquadPlayers` (724-739), mappers (1013-1096) | exact (self-extension) |
| `src/modules/public-stats/routes/schemas.ts` | schema (TypeBox) | request-response | itself: `UuidParameters` (20), `RotationSummaryResponse` (52-57), `PlayerProfileResponse` (129-135), `Type.Union`/`Type.Literal` (13-17) | exact (self-extension) |
| `src/modules/public-stats/routes/models.ts` | model (domain types + interface) | — | itself: `PublicStatsReadModel` iface (1-33), `PlayerProfile` (177-180) | exact (self-extension) |
| `src/modules/public-stats/routes/empty-read-model.ts` | model (boot-without-DB stub) | — | itself: full file (17-50) | exact (self-extension) |
| `src/modules/public-stats/routes/routes.ts` | route (Fastify) | request-response | itself: `/stats/players/:id` (178-200), `registerRotationRoutes` (142-156) | exact (self-extension) |
| `src/test/integration/steamid-leak-guard.test.ts` | test (integration) | request-response | itself: route arrays (32-43), `it.each` sweep (90-105) | exact (self-extension) |

**History SQL read methods** внутри `repository.ts` зеркалят темпоральные паттерны
из `src/modules/statistics/repository/parity-sql.ts` (см. Pattern 4 ниже) — это
кросс-модульный аналог для формы запросов.

---

## Pattern Assignments

### `src/infra/db/migrations/0006_*.sql` (migration, DDL + idempotent backfill)

**Analog (index/DDL conventions):** `src/infra/db/migrations/0005_keyset_indexes.sql`
**Analog (target table shapes):** `src/infra/db/migrations/0001_v1_domain_schema.sql`

**Index convention to copy** (`0005` lines 9-14) — `create index if not exists`, имя `idx_<table>_<cols>`:
```sql
create index if not exists idx_canonical_players_display_name_id
  on canonical_players (display_name, id);
create index if not exists idx_squads_name_id
  on squads (name, id);
```
> Применить ту же форму: `create index if not exists idx_<table>_slug on <table>(slug);`
> плюс partial-unique: `create unique index if not exists uq_<table>_slug on <table>(slug) where slug is not null;`

**Target tables / slug-base source columns** (`0001`):
- `canonical_players` (33-38) → base из `display_name`; fallback `p-<hex>`
- `squads` (70-77) → base из `name`; fallback `s-<hex>`
- `rotations` (94-101) → base из `name`; fallback `r-<hex>`. **NB: нет `updated_at`** (только `created_at`) — важно для provenance (см. Open Q2).
- `replays` (122-138) → нет human-name; base из `source_system || '-' || source_replay_id` (A1); fallback `replay-<hex>`

**Idempotency contract — `migrate.ts` (38-68):** каждый `.sql` исполняется ОДИН раз
в одной `begin/commit` транзакции (56-63), пишется sha256-checksum (43, 60), и
**бросает, если checksum ранее применённого файла изменился** (49-51). Файл
заморожен после первого применения. Backfill всё равно пишем идемпотентно
(`add column if not exists`, `update ... where slug is null`), чтобы свежая БД и
пересозданная тестовая БД обе проходили, а частично-упавшее применение
откатывалось (64-66).

**Backfill shape (из 16-RESEARCH Pattern 1):** определить `immutable` SQL-функцию
`slug_base(text)` внутри той же миграции (translit Cyrillic→Latin chained
`replace()` ПЕРЕД `translate()`, затем `regexp_replace('[^a-z0-9]+','-','g')`,
`trim(both '-')`), и `update <table> set slug = case when base='' then '<prefix>-'||suffix when dup then base||'-'||suffix else base end` с `count(*) over (partition by slug_base(...)) > 1 as dup` для order-independent коллизий. Алгоритм должен быть byte-identical с TS-хелпером `slug.ts`.

---

### `src/modules/public-stats/routes/slug.ts` (NEW utility, pure transform)

**Analog:** `src/modules/public-stats/routes/pagination/mask.ts` (весь файл) — паттерн
маленького чистого экспортируемого хелпера с JSDoc, без сайд-эффектов, легко
unit-тестируемого; импортируется в mapper choke point.

**Pattern to copy** (`mask.ts` 1-12):
```ts
const LAST_FOUR = 4;
/** JSDoc объясняющий инвариант choke-point */
export function maskSteamId(steamId: string): string {
  return `...${steamId.slice(-LAST_FOUR)}`;
}
```

**Exports for this file:** `slugify(name: string): string`, `shortSuffix(uuid: string): string`
(первые 6 hex из `replace(id,'-','')`), `looksLikeUuid(value: string): boolean`.
`looksLikeUuid` regex из 16-RESEARCH Pattern 2:
```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
```
Транслитерация — один упорядоченный список `(cyr, lat)` как single source of truth,
зеркалится в `slug_base()` SQL (анти-паттерн «divergence», 16-RESEARCH §Anti-Patterns).

> Тест: `routes/slug.test.ts` (новый, Wave 0) — структуру брать из формата
> Vitest-юнитов модуля; ассертить ASCII-fold, Cyrillic-translit, collapse/trim,
> id-fallback, `looksLikeUuid` true/false.

---

### `src/modules/public-stats/routes/history-gaps.ts` (NEW utility, pure transform)

**Analog:** `src/modules/public-stats/routes/pagination/mask.ts` (форма чистого
unit-тестируемого хелпера). Логика — 16-RESEARCH Pattern 4 `withGaps`.

**Core pattern (16-RESEARCH 299-313):** чистая функция над отсортированными
(ascending by `from`, nulls-first) интервалами `{ from: string|null, to: string|null }`;
эмитит `{ kind: "unknown-gap", from, to }` между disjoint-окнами и на открытых
краях. Trailing-gap ТОЛЬКО когда последнее окно закрыто (`to !== null`) — открытое
последнее окно = «текущее», не gap (Pitfall 4). Edge-policy (Open Q1) фиксирует
planner: (a) gap между окнами при `prevTo < nextFrom`; (b) leading `{from:null,to:firstFrom}`
только при `firstFrom !== null`; (c) trailing только при закрытом последнем окне.

> Тест: `routes/history-gaps.test.ts` (новый, Wave 0) — кейсы between-gap,
> leading-gap, trailing-gap, open-last (no gap), adjacent (no gap), all-unknown bounds.

---

### `src/modules/public-stats/repository.ts` (repository, read-model extension)

**Analog: сам файл.** Зеркалить существующие методы и мапперы.

**Class + constructor + raw-pg query pattern** (186-187, 298-319):
```ts
export class PgPublicStatsReadModel implements PublicStatsReadModel {
  public constructor(private readonly pool: Pool) {}
  public async getPlayer(id, filters): Promise<PlayerProfile | null> {
    const result = await this.pool.query<PlayerRow>(`... where players.id = $1 ...`, [id, ...]);
    const [row] = result.rows;
    return row === undefined ? null : mapPlayerProfile(row, filters.rotationId);
  }
```

**Slug-or-UUID resolver — НОВЫЙ shared helper (CONTEXT discretion предпочитает один).**
Branch на boolean-флаге, чтобы `::uuid` cast видел только UUID-shaped вход
(Pitfall 2 — иначе `invalid input syntax for type uuid` → 500 вместо 404).
16-RESEARCH Pattern 2:
```sql
where ($1::boolean = true and players.id = $2::uuid)
   or ($1::boolean = false and players.slug = $2::text)
```
binding `[looksLikeUuid(idOrSlug), idOrSlug]`. Применить в `getPlayer`/`getSquad`/новом `getRotation`.
Существующий `getPlayer` сейчас делает `where players.id = $1` (312) — релаксировать на эту ветвящуюся форму. Метод `playerExists`/`squadExists` (706-722) — паттерн `select exists(...)` если нужен resolve-only.

**Row interface extension** (85-106): добавить `slug: string` в `PlayerRow`, `SquadRow`,
`RotationRow`; добавить timestamp-поля для provenance (`calculated_at`/`updated_at`),
по образцу существующих `Date | null` полей (`RotationRow.ends_at` 79, `ParityPlayerStatRow.last_played_game_date` 146).

**Mapper choke point — slug + provenance** (1034-1043). Расширить как в 16-RESEARCH Code Example:
```ts
function mapPlayerProfile(row: PlayerRow, rotationId: string | undefined): PlayerProfile {
  return {
    ...mapPlayerSummary(row, rotationId),  // gains slug via PlayerRow.slug
    aliases: row.aliases,
    steamIds: row.steam_ids.map((steamId) => maskSteamId(steamId)),  // UNCHANGED choke point (1041)
    provenance: { lastUpdatedAt: maxTimestamp([row.calculated_at, row.updated_at]) },
  };
}
```
`maxTimestamp` (16-RESEARCH Pattern 5) — чистый хелпер рядом с мапперами; `null`
когда нет backing-строк; НИКОГДА `now()` (Pitfall 3, HIST-03). Добавить `slug` в
`mapPlayerSummary` (1022-1032), `mapSquadSummary` (1064-1074), `mapRotation` (1013-1020).

**History read methods — НОВЫЕ, форма из `listSquadPlayers`** (724-739) + темпоральный SQL из parity-sql (Pattern 4):
```ts
private async listSquadPlayers(squadId: string): Promise<SquadPlayer[]> {
  const result = await this.pool.query<SquadPlayerRow>(
    `select players.id, players.display_name
       from squad_memberships memberships
       join canonical_players players on players.id = memberships.player_id
      where memberships.squad_id = $1
      order by players.display_name`,
    [squadId]);
  return result.rows.map((row) => ({ displayName: row.display_name, id: row.id }));
}
```
Новые `getPlayerNameHistory` / `getPlayerMembershipHistory` / `getSquadMembershipHistory` / `getRotation`.

**rotation provenance (Open Q2):** `rotations` без `updated_at` — SQL берёт
`(select max(calculated_at) from player_stats ps where ps.rotation_id = r.id)` с floor
на `r.created_at`, иначе `null`. Не расширять миграцию `updated_at`-колонкой.

---

### `src/modules/public-stats/routes/schemas.ts` (TypeBox schemas, additive)

**Analog: сам файл.** Все определения в одном `const ... =` цепном блоке с `/* eslint-disable new-cap */` (1) и `Static<>` экспортами (239-257).

**Param relax — копировать с `UuidParameters` (20):**
```ts
UuidParameters = Type.Object({ id: Type.String({ format: "uuid" }) }),
```
Новый bounded slug-or-uuid (16-RESEARCH Pattern 2, V5 input-validation — bound every string):
```ts
SlugOrUuidParameters = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9-]+$" }),
}),
```

**`slug` field на summary/profile/rotation** — additive. `RotationSummaryResponse` (52-57),
`PlayerSummaryResponse` (123-128), `SquadSummaryResponse` (152-157): добавить
`slug: Type.String()`. Профили (`PlayerProfileResponse` 129-135, `SquadProfileResponse`
158-168) наследуют через `Type.Intersect`.

**Provenance envelope** — новый общий объект:
```ts
ProvenanceResponse = Type.Object({
  lastUpdatedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
}),
```
Добавить в singular-ответы (профили, rotation-detail, Phase 15 parity-ответы, history).

**Discriminated-union history schema — копировать паттерн `Type.Union`/`Type.Literal`**
(уже используется для `order` на 13-17) и nullable date-time (`RotationSummaryResponse.endsAt` 53).
16-RESEARCH Code Example (426-443):
```ts
const NameHistoryEntry = Type.Union([
  Type.Object({ kind: Type.Literal("alias"), nickname: Type.String(),
    from: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    to: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    sourceReplayId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]) }),
  Type.Object({ kind: Type.Literal("unknown-gap"),
    from: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    to: Type.Union([Type.String({ format: "date-time" }), Type.Null()]) }),
]);
```
Counterpart-объекты в membership-history несут ТОЛЬКО `{ id, slug, name|displayName }`
(по образцу `PlayerReferenceResponse` 198-201) — никаких Steam64.

> Не забыть соответствующие `export type ... = Static<typeof ...>` (239-257).

---

### `src/modules/public-stats/routes/models.ts` (domain types + interface)

**Analog: сам файл.** Расширить `PublicStatsReadModel` interface (1-33) новыми
сигнатурами (по образцу `getPlayer`/`getSquad`/`getPlayerWeapons` 3-17,
nullable-возврат `Promise<... | null>`):
```ts
getPlayerNameHistory(id: string): Promise<NameHistoryPayload | null>;
getPlayerMembershipHistory(id: string): Promise<PlayerMembershipHistoryPayload | null>;
getSquadMembershipHistory(id: string): Promise<SquadMembershipHistoryPayload | null>;
getRotation(id: string): Promise<RotationDetail | null>;
```
Domain-типы — по образцу `PlayerProfile` (177-180), `RotationSummary` (96-101),
`PublicPlayerReference` (244-247). Добавить `slug: string` в `PlayerSummary` (170-175),
`SquadSummary` (230-235), `RotationSummary` (96-101); `provenance: { lastUpdatedAt: string | null }`
в singular-payload-типы. Discriminated-union TS-тип для history-entries (зеркало TypeBox-схемы).

---

### `src/modules/public-stats/routes/empty-read-model.ts` (boot-without-DB stub)

**Analog: сам файл (17-50).** **MUST** добавить stub для КАЖДОГО нового метода
read-model (Pitfall 6 — иначе TS-compile error «interface not satisfied» или
неверная форма при boot-without-DB). Паттерн nullable-возврата (35-43):
```ts
getPlayer: () => Promise.resolve(null),
getPlayerRelationships: () => Promise.resolve(null),
```
Добавить: `getPlayerNameHistory`, `getPlayerMembershipHistory`,
`getSquadMembershipHistory`, `getRotation` → все `() => Promise.resolve(null)`.

---

### `src/modules/public-stats/routes/routes.ts` (Fastify routes, additive)

**Analog: сам файл.** Детальный роут `/stats/players/:id` (178-200):
```ts
app.get<{ Params: UuidParametersType; Querystring: PlayerDetailQueryType }>(
  "/stats/players/:id",
  { schema: { params: UuidParameters, querystring: PlayerDetailQuery,
      response: { 200: PlayerProfileResponse, 404: NotFoundResponse }, tags: ["public-stats"] } },
  async (request, reply) => {
    const item = await options.readModel.getPlayer(request.params.id, rotationFilters(request.query));
    return item ?? reply.code(NOT_FOUND).send({ message: "player not found" });
  });
```
**Изменения:**
- Релаксировать `params: UuidParameters` → `SlugOrUuidParameters` на detail-роутах
  `/stats/players/:id` (185), `/stats/squads/:id` (300), и на под-ресурсах (history
  достигается через уже-разрешённый id — родитель резолвит slug→id первым).
- Импортировать новые схемы/типы из `schemas.js` (блок 19-53) и зарегистрировать в
  child-scope (75-79) — error-handling/`NotFound`-паттерн (`reply.code(NOT_FOUND).send`)
  переиспользовать как есть; `mapPublicStatsError` (74) уже навешан на scope.

**Rotation detail — НОВЫЙ роут, форма из `registerRotationRoutes`** (142-156, сейчас
только list) + detail-паттерн выше: `GET /stats/rotations/:id` (slug-or-uuid),
`response: { 200: RotationDetailResponse, 404: NotFoundResponse }`.

**History sub-resource роуты — форма из под-ресурсов player** (`/stats/players/:id/weapons`
202-217, `/relationships` 236-253): тот же `app.get<{ Params }>`,
`response: { 200: <HistoryResponse>, 404: NotFoundResponse }`, `item ?? reply.code(404)`.
Пути: `/stats/players/:id/name-history`, `/stats/players/:id/membership-history`,
`/stats/squads/:id/membership-history`.

---

### `src/test/integration/steamid-leak-guard.test.ts` (integration test, additive)

**Analog: сам файл.** Расширить route-массивы и `it.each`-sweep.

**Route arrays** (32-43) — добавить новые detail/history/rotation-detail пути:
```ts
PUBLIC_DETAIL_ROUTES = [
  `/stats/players/${PLAYER_ID}`,
  `/stats/squads/${SQUAD_ID}`,
  // + `/stats/players/${PLAYER_ID}/name-history`,
  // + `/stats/players/${PLAYER_ID}/membership-history`,
  // + `/stats/squads/${SQUAD_ID}/membership-history`,
  // + `/stats/rotations/${ROTATION_ID}`,
];
```
**Sweep pattern** (90-105) — `it.each([...PUBLIC_LIST_ROUTES, ...PUBLIC_DETAIL_ROUTES])`
с `expectNoSteam64(response.json())` + `expectNoSteam64(response.payload)`. Реальный-pg
seed-паттерн (149-207) переиспользовать, если новый surface нужно проверять с
посеянным Steam64. `STEAM64_PATTERN = /7656119\d{10}/u` (19) и `expectNoSteam64` (26-30) — без изменений.

---

## Shared Patterns

### Masking choke point (carried, non-negotiable)
**Source:** `src/modules/public-stats/routes/pagination/mask.ts` (10-12); вызов в `mapPlayerProfile` (`repository.ts` 1041).
**Apply to:** все новые мапперы. Counterpart-сущности history несут ТОЛЬКО
`{ id, slug, name|displayName }` — никакого Steam64 (full/masked) на новых surface.
Никакой новый код не должен эмитить `7656119\d{10}`.

### Provenance choke point (new, same boundary as masking)
**Source:** новый чистый `maxTimestamp(values)` рядом с мапперами `repository.ts` (~1034+).
**Apply to:** все singular-ответы (player/squad профиль, rotation detail, Phase 15
parity sub-resources, новые history). `lastUpdatedAt = max` над таймстампами
ВЕРНУВШИХСЯ строк; `null` при отсутствии; НИКОГДА `now()`. **НЕ добавлять в
list/paginated shapes** (CONTEXT — не churn-ить cursor-контракт перед Phase 19 freeze).

### Parameterized SQL + boolean-flag branch для slug-or-uuid
**Source:** 16-RESEARCH Pattern 2; форма параметризации — везде в `repository.ts` (`$1::uuid`).
**Apply to:** `getPlayer`/`getSquad`/`getRotation` resolvers. Никогда не
конкатенировать slug/uuid в SQL; `::uuid` cast только в UUID-ветке.

### Temporal interval SQL
**Source:** `src/modules/statistics/repository/parity-sql.ts` — nickname windowing
(35-42: `observed_from <= ts and observed_to >= ts`), membership ordering
(90-97: `order by membership.valid_from desc, membership.id`).
**Apply to:** history read methods, но с `order by ... asc nulls first, id` (CONTEXT —
ascending, nulls-first), counterpart-join к `squads`/`canonical_players` для `{id,slug,name}`.

### OpenAPI regeneration gate
**Source:** `@fastify/swagger` генерит на boot; `openapi:check`/`openapi:verify`.
**Apply to:** после правок схем — `pnpm run openapi:export` + commit
`openapi/server-2.openapi.json` (Pitfall 5 — `verify-openapi.ts` byte-сравнивает).
Все изменения additive (новые поля/роуты; `format:"uuid"`→bounded string —
widening, backward-compatible для генерируемого клиента `web`).

### empty-read-model parity
**Source:** `src/modules/public-stats/routes/empty-read-model.ts` (17-50).
**Apply to:** каждый новый метод интерфейса → stub в той же задаче (Pitfall 6).

---

## No Analog Found

| Aspect | Reason | Planner action |
|--------|--------|----------------|
| In-SQL Cyrillic→Latin backfill (`slug_base()` в `0006`) | В репо нет ни одной миграции с data-backfill (`0001`-`0005` — только DDL/индексы). | Строить с нуля по 16-RESEARCH Pattern 1; алгоритм byte-identical с TS `slugify`. |
| `withGaps` discriminated-union timeline | Нет существующих timeline/gap-структур. | Строить с нуля (чистая функция, 16-RESEARCH Pattern 4); полное unit-покрытие edge-кейсов. |

Оба — чистая логика без сайд-эффектов; форму ХЕЛПЕРА брать у `mask.ts`, форму
ТЕСТА — у существующих Vitest-юнитов модуля.

---

## Metadata

**Analog search scope:** `src/modules/public-stats/` (routes, repository, schemas,
models, empty-read-model, mask), `src/modules/statistics/repository/parity-sql.ts`,
`src/infra/db/migrations/` (0001, 0005), `src/infra/db/migrate.ts`,
`src/test/integration/steamid-leak-guard.test.ts`.
**Files scanned:** 11
**Pattern extraction date:** 2026-06-07

---

## PATTERN MAPPING COMPLETE

**Phase:** 16 - Slug Resolution, History & Provenance
**Files classified:** 9 (3 new, 6 modified)
**Analogs found:** 9 / 9

### Coverage
- Files with exact analog (self-extension): 6
- Files with role-match analog: 3
- Files with no analog: 0 (два аспекта — SQL-backfill и `withGaps` — без in-repo прецедента, помечены в §No Analog Found)

### Key Patterns Identified
- Все surface'ы — raw `pg` Pool + `PgPublicStatsReadModel` класс + append-only `.sql` миграции (НЕ Kysely/layered-factory из skill); зеркалить Phase 14/15.
- Masking + provenance — оба в одном row→payload mapper choke point; provenance из вернувшихся строк, никогда `now()`; никогда на list/paginated.
- Slug-or-UUID резолвится одним shared helper с boolean-flag SQL-branch (`::uuid` только в UUID-ветке → 404, не 500).
- TypeBox-схемы (один цепной `const`-блок + `Static<>` экспорты) — источник OpenAPI; все изменения additive, regenerate+commit перед `openapi:check`.
- Каждый новый метод read-model требует stub в `empty-read-model.ts` (boot-without-DB) и расширения `PublicStatsReadModel` интерфейса в `models.ts`.

### File Created
`.planning/phases/16-slug-resolution-history-provenance/16-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner может ссылаться на аналоговые паттерны (с номерами строк) при написании PLAN.md.
