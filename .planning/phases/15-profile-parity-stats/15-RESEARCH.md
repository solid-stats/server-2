# Phase 15: Profile Parity Stats — Research

**Researched:** 2026-06-06
**Domain:** SQL parity extraction + per-entity-scoped read endpoints (TypeScript / Fastify / raw `pg`)
**Confidence:** HIGH (целиком на чтении исходников репозитория; внешних зависимостей нет)

> Вся пользовательская проза — на русском. Код / SQL / идентификаторы — как есть.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Surface Endpoint Layout**
- Каждая parity-поверхность — это **sub-resource** существующих профильных роутов:
  `GET /players/:id/weapons`, `/players/:id/vehicles`, `/players/:id/relationships`,
  `/players/:id/weekly`, плюс squad-эквиваленты `GET /squads/:id/...`.
- Существующие `PlayerProfileResponse` / `SquadProfileResponse` остаются стабильными;
  KD/score/total-games добавляются в объект stats профиля.

**Field Contract & Computation**
- **KD ratio, score, total games** считаются **на сервере** по legacy-export формулам и
  отдаются числами на объекте stats (расширить `PlayerStatsResponse` / `SquadStatsResponse`).
  Web никогда не пересчитывает.
- Weapon surface: массив `{ weaponGroup: "firearms"|"vehicles", weaponName, kills }`.
- Vehicle surface: счётчики по legacy split `vehicle_kills` / `kills_from_vehicle`.
- Relationship surface: четыре типизированных списка (killed / killers / teamkilled /
  teamkillers), каждый — массив `{ player: { id, displayName }, count }`.
- Weekly surface: массив `{ week, startDate, endDate, kills, deaths, teamkills, ... }`
  по форме legacy `WeekRow`.

**Identity & Masking**
- Relationship-таргеты — форма `PlayerReferenceResponse` (`{ id, displayName }`),
  **без SteamID** (даже маскированного). Согласовано с choke-point Фазы 14 и SEC-01/02.
- Маскирование продолжает применяться на границе row→payload mapper; ни одна parity-поверхность
  не отдаёт полный/маскированный Steam64 сверх установленного masked-last-4 поля профиля.

**Pagination**
- Per-entity parity-списки (weapons, vehicles, weekly, relationships) — **bounded embedded
  arrays**, НЕ cursor-paginated. Коллекционные эндпоинты (players/squads) сохраняют курсор-контракт
  Фазы 14 без изменений.

**parity-sql Extraction (архитектура, locked)**
- Вынести per-surface SQL из `src/modules/statistics/repository/legacy-export.ts`
  (`PLAYER_STATS_SQL`, `SQUAD_STATS_SQL`, `RELATIONSHIPS_SQL`, `WEAPONS_SQL`, `WEEKS_SQL`
  + общий `PLAYER_ENTITY_CTE`) в **единый разделяемый `parity-sql` источник**, который потребляют
  и CLI-экспорт, и новые per-entity API-чтения.
- API-чтения добавляют per-entity `WHERE`-предикат (одна сущность), чтобы не делать seq-scan по
  всему `parser_events`. CLI-экспорт продолжает использовать unscoped-форму.
- **Инвариант:** после извлечения CLI legacy export остаётся byte-identical (гард — существующие
  `legacy-export` / `legacy-public-export` тесты).

### Claude's Discretion
- Точный путь/имя модуля для разделяемого `parity-sql` источника и per-entity query-builder хелперов.
- Детали наименования полей в новых response-схемах (camelCase TypeBox + naming из Фазы 14).
- Vehicle stats — отдельный эндпоинт или внутри weapon-поверхности `vehicles`-группы — решить при
  планировании по чистоте byte-identical маппинга.

### Deferred Ideas (OUT OF SCOPE)
- Курсор-пагинация parity sub-surfaces — отклонено (bounded per-entity data).
- Masked SteamID внутри relationship-таргетов — отклонено (id+displayName).
- Production traffic cutover — вне milestone.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PARITY-01 | Per-player weapon stats, значения = legacy-export | `WEAPONS_SQL` + `mapWeapons` (firearms/vehicles split); per-entity scoping через `entity.player_id = $1` |
| PARITY-02 | Per-player vehicle stats | Источник — `PLAYER_STATS_SQL.counter_totals` (`vehicle_kills`, `kills_from_vehicle`) ИЛИ `weapon_group='vehicles'` из `WEAPONS_SQL`; см. Open Q2 |
| PARITY-03 | PvP relationship stats (killed/killers/teamkilled/teamkillers) | `RELATIONSHIPS_SQL` + `mapRelationships`; scoping = `source_player_id = $1` |
| PARITY-04 | Weekly stat buckets | `WEEKS_SQL` + `mapWeeks` + `weekExport` (kdRatio/score/coef); scoping = `entity.player_id = $1` |
| PARITY-05 | KD ratio, score, total games на профиле | Формулы `kdRatio`, `totalScore`, `totalPlayedGames` из `legacy-public-export.ts`; данные уже в `PLAYER_STATS_SQL`/`playerSelectStats` |
| PARITY-06 | Эквивалентные поверхности на squad-профилях | `SQUAD_STATS_SQL`; squad weapon/relationship/weekly агрегируются по членам сквада (см. Open Q3) |
</phase_requirements>

## Summary

Фаза 15 — это **не вычислительная фаза, а фаза экспозиции**: все формулы и SQL уже существуют и
покрыты byte-identical гардами. Задача — (1) вынести 5 SQL-констант + общий CTE из
`legacy-export.ts` в разделяемый `parity-sql` источник без изменения вывода CLI, (2) добавить
per-entity `WHERE`-предикат, чтобы новые роуты читали по одной сущности, а не сканировали весь
`parser_events`, и (3) подключить sub-resource эндпоинты с TypeBox-схемами, прогнав строки через
те же мапперы/формулы, что и CLI.

Главная архитектурная тонкость, которую обязан учесть планировщик: **`PLAYER_ENTITY_CTE.player_id`
— это не UUID, а TEXT-`coalesce`** (`steam_player.id::text` → `nickname_player.id::text` →
`display_player.id::text` → имя из payload → `observed_player_ref`). Per-entity scoping на
weapons/weeks/relationships должен фильтровать именно по этому **коалесцированному text-значению**,
а не по `canonical_players.id::uuid`. При этом профильный роут принимает `:id` как `format: uuid`
(`UuidParameters`). Значит, для scoped-чтения нужно прокинуть `canonical_players.id::text` в
предикат CTE — `WHERE entity.player_id = $1::text`, где `$1` = UUID из path как строка. Игроки без
canonical-привязки (player_id = имя/ref) в публичном API недостижимы по UUID — это корректно и
совпадает с поведением профиля (профиль резолвится только по `canonical_players.id`).

Вторая тонкость: **сортировка и группировка parity-поверхностей частично живёт в JS-мапперах**
(`legacy-public-export.ts`: `sortWeaponInputs`, `sortRelationships`, `sortWeeks` →
`week.localeCompare` desc, `weekExport`), а не только в `ORDER BY`. Byte-identical для API
достигается переиспользованием этих же функций/формул, а не повторной реализацией сортировки в SQL.

**Primary recommendation:** Создать `src/modules/statistics/repository/parity-sql.ts` (чистый
SQL-модуль: экспортирует `PLAYER_ENTITY_CTE` и пять SQL-строк как раньше, **плюс** функцию-builder,
которая инъектит опциональный per-entity предикат). `legacy-export.ts` импортирует unscoped-форму
(byte-identical сохраняется). Новый `public-stats`-репозиторий-метод/сервис вызывает scoped-форму и
переиспользует мапперы+формулы из `legacy-public-export.ts`. Эндпоинты — sub-resource роуты в
существующем `registerPlayerRoutes`/`registerSquadRoutes`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Извлечение SQL в `parity-sql` | repository | — | Чистый data-access; SQL-строки сейчас в repository-слое |
| Per-entity scoping (WHERE) | repository | service | Предикат — деталь запроса; сервис передаёт id |
| Маппинг строк → payload | repository (mapper) / service | — | Переиспользовать существующие мапперы из `legacy-public-export.ts` |
| KD/score/totalGames формулы | service (export module) | — | `kdRatio`/`totalScore`/`weeklyScore` уже экспортируются |
| Маскирование (нет SteamID в parity) | repository mapper | — | Choke-point Фазы 14; parity вообще не эмитит Steam64 |
| TypeBox-схемы / OpenAPI | controller [HTTP] | — | Авто-генерация `@fastify/swagger` на boot |
| Регистрация sub-resource роутов | controller [HTTP] | — | Расширение `registerPlayerRoutes`/`registerSquadRoutes` |
| Byte-identical CLI export | repository (unscoped) | operations | Гард — существующие тесты; unscoped-форма не меняется |

## Standard Stack

Новых зависимостей **не добавляется** (см. CLAUDE.md «zero new runtime deps» + STATE.md решение).
Phase 15 — паттерн-аддиция на shipped-стеке.

### Core (уже в проекте)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pg` | 8.x | Raw parameterized SQL | Весь parity-SQL уже на `pool.query<T>(sql, values)` |
| `fastify` | 5.x | HTTP | Существующие public-stats роуты |
| `@sinclair/typebox` (`@fastify/type-provider-typebox`) | — | Route-схемы + OpenAPI | `schemas.ts` целиком на TypeBox |
| `@fastify/swagger` | 9.x | OpenAPI auto-gen на boot | `src/openapi/export-openapi.ts` → `createOpenApiSchema()` |
| `vitest` (+`@vitest/coverage-v8`) | 4.x | Unit + integration | Гарды и postgres.test.ts |

**Installation:** не требуется (`pnpm` lockfile без изменений).

**Version verification:** N/A — фаза не вводит пакетов. Реестр не запрашивался намеренно
(нулевая поверхность установки).

## Package Legitimacy Audit

> Внешние пакеты в этой фазе **не устанавливаются**. Slopcheck/registry-проверки неприменимы.

| Package | Registry | Disposition |
|---------|----------|-------------|
| — | — | Новых зависимостей нет (STATE.md + CLAUDE.md: zero new runtime deps) |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────┐
                         │  parity-sql.ts  (НОВЫЙ shared source) │
                         │  - PLAYER_ENTITY_CTE                  │
                         │  - playerStatsSql({scopeId?})         │
                         │  - weaponsSql({scopeId?})             │
                         │  - weeksSql({scopeId?})               │
                         │  - relationshipsSql({scopeId?})       │
                         │  - squadStatsSql({scopeId?})          │
                         └───────────────┬──────────────────────┘
                  unscoped form          │          scoped form (WHERE entity = $1)
        ┌────────────────────────────────┴───────────────────────────────┐
        ▼                                                                  ▼
┌──────────────────────────┐                       ┌────────────────────────────────────┐
│ legacy-export.ts (CLI)   │                       │ public-stats: parity read methods    │
│ loadExportData()         │                       │ getPlayerWeapons(id) / ...weekly /   │
│  → ALL rows (unscoped)   │                       │ ...relationships ; squad equivalents │
└───────────┬──────────────┘                       └──────────────┬──────────────────────┘
            ▼                                                      ▼
┌──────────────────────────┐                       ┌────────────────────────────────────┐
│ legacy-public-export.ts  │  ← переиспользуются →  │ те же мапперы + формулы:             │
│ mappers + kdRatio/score/ │                        │ mapWeapons/mapWeeks/mapRelationships │
│ weeklyScore/totalScore   │                        │ kdRatio/totalScore/weeklyScore       │
└───────────┬──────────────┘                       └──────────────┬──────────────────────┘
            ▼                                                      ▼
   stdout JSON (BYTE-IDENTICAL gard)                   TypeBox response → @fastify/swagger
                                                       GET /stats/players/:id/{surface}
```

> File-to-implementation mapping — в Component Responsibilities ниже, не в диаграмме.

### Recommended Project Structure
```
src/modules/statistics/repository/
├── parity-sql.ts          # НОВЫЙ: PLAYER_ENTITY_CTE + 5 builder-функций (scoped/unscoped)
├── legacy-export.ts       # импортирует unscoped builders из parity-sql; мапперы остаются
└── tests/legacy-export.test.ts  # без изменений (byte-identical гард)

src/modules/public-stats/
├── repository.ts          # +parity read-методы (scoped); переиспользуют мапперы export-модуля
├── routes/
│   ├── routes.ts          # +sub-resource роуты в registerPlayerRoutes/registerSquadRoutes
│   ├── schemas.ts         # +Weapon/Vehicle/Relationship/Weekly response-схемы; расширить *StatsResponse
│   └── models.ts          # +доменные типы + методы в PublicStatsReadModel
└── tests/postgres.test.ts # +integration-кейсы для scoped-чтений
```

### Pattern 1: Опциональный per-entity предикат в SQL-builder
**What:** Единый SQL с дырой под `WHERE`, заполняемой только в API-форме.
**When to use:** Любой из 5 parity-запросов.
**Example:**
```typescript
// parity-sql.ts — builder инъектит scope ТОЛЬКО когда задан id.
// Unscoped-вызов (CLI) даёт строку, посимвольно равную сегодняшней константе.
export const PLAYER_ENTITY_CTE = `…(как в legacy-export.ts, без изменений)…`;

interface ScopeOptions { scopeColumn: string; }

export function weeksSql(scope?: ScopeOptions): { sql: string; needsParam: boolean } {
  // ВАЖНО: scope добавляется в WHERE существующего запроса, а не оборачивает его —
  // GROUP BY / ORDER BY должны остаться идентичными, иначе ломается byte-identical
  // (для CLI) и порядок строк (для API).
  const predicate = scope ? `and ${scope.scopeColumn} = $1::text` : "";
  return { sql: WEEKS_SQL_TEMPLATE(predicate), needsParam: scope !== undefined };
}
```
**Гарантия byte-identical:** unscoped-форма обязана давать строку, идентичную текущей константе.
Безопаснее всего — оставить экспортируемую константу `WEEKS_SQL` как `weeksSql().sql` и оставить
существующий тест-снэпшот; либо параметризовать через `${predicate}`-вставку в точке, где сейчас
пустая строка. Планировщику: добавить **assertion-тест** `weeksSql().sql === LEGACY_SNAPSHOT` или
просто оставить `loadWeeks()` вызывающим unscoped-builder и положиться на существующий
`legacy-export.test.ts` (он сверяет результат маппинга, не сам SQL-текст — см. Pitfall 1).

### Pattern 2: Переиспользование JS-мапперов и формул, а не реимплементация
**What:** API-чтение прогоняет строки через `mapWeapons`/`mapWeeks`/`mapRelationships` и формулы
`kdRatio`/`totalScore`/`weeklyScore` из `legacy-public-export.ts`.
**When to use:** Всегда. Реализовать сортировку/формулы заново = риск дрейфа от byte-identical.
**Example:**
```typescript
// public-stats parity-репозиторий
import { kdRatio, totalScore } from "../statistics/export/legacy-public-export.js";
// stats-объект профиля (PARITY-05):
stats.kdRatio = kdRatio(row.kills, row.deathsTotal);
stats.totalScore = totalScore(row.kills, row.teamkills);
stats.totalPlayedGames = row.totalPlayedGames;
```
> Замечание о слоях (skill `solidstats-backend-ts-conventions`): кросс-модульно импортировать
> разрешено только service-контракт. `legacy-public-export.ts` экспортирует чистые функции
> (`kdRatio`, `totalScore`, `weeklyScore`, `killsFromVehicleCoef`) — это допустимо как доменные
> утилиты. Если планировщик хочет строгого соответствия слоям — вынести эти формулы в общий
> `statistics`-service-контракт или в `parity` shared-модуль и импортировать оттуда обоими
> потребителями. Это решение Claude's Discretion.

### Pattern 3: Sub-resource роут с TypeBox + 404-проброс
**What:** `GET /stats/players/:id/weapons` повторяет форму существующего `/stats/players/:id`.
**Example:**
```typescript
app.get<{ Params: UuidParametersType; Querystring: PlayerDetailQueryType }>(
  "/stats/players/:id/weapons",
  { schema: { params: UuidParameters, querystring: PlayerDetailQuery,
              response: { 200: PlayerWeaponsResponse, 404: NotFoundResponse },
              tags: ["public-stats"] } },
  async (request, reply) => {
    const item = await options.readModel.getPlayerWeapons(request.params.id);
    return item ?? reply.code(NOT_FOUND).send({ message: "player not found" });
  },
);
```

### Anti-Patterns to Avoid
- **Реимплементация сортировки в SQL вместо JS-мапперов:** byte-identical-порядок задают
  `toSorted`-функции в `legacy-public-export.ts` (`week.localeCompare` desc, `localeCompare`
  по name+id). SQL `ORDER BY` — лишь предварительная сортировка; финальный порядок — в JS.
- **Scoping по `canonical_players.id::uuid` в CTE:** CTE-`player_id` — TEXT coalesce; фильтровать
  надо `= $1::text`, иначе пропадут совпадения там, где работает steam/nickname-резолюция.
- **Оборачивание запроса внешним `SELECT … WHERE`:** меняет план и потенциально порядок; вместо
  этого вставлять предикат в существующий `WHERE`/`HAVING` запроса.
- **Курсор-пагинация parity-списков:** запрещено CONTEXT (bounded embedded arrays).
- **Эмиссия Steam64 в relationship/weapon payload:** запрещено SEC-01/02; parity-таргеты —
  только `{ id, displayName }`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| KD ratio / score | Новая формула в репозитории | `kdRatio`/`totalScore`/`weeklyScore` (`legacy-public-export.ts`) | Round-семантика (`Math.round(x*100)/100`) и edge-case (deaths=0, games=0) уже зафиксированы тестами |
| Сортировка weapons/relationships/weeks | SQL `ORDER BY` как источник истины | `sortWeaponInputs`/`sortRelationships`/`sortWeeks` | Финальный byte-identical порядок — в JS-мапперах |
| killsFromVehicleCoef | inline-деление | `killsFromVehicleCoef` | kills=0 → 0; round до 2 знаков |
| Маскирование/проверка отсутствия SteamID | Свой regex | choke-point Фазы 14 (`maskSteamId`) + отсутствие поля | parity вообще не должна нести Steam64 |
| Per-entity предикат | Конкатенация без `$n` | Параметризованный `$1::text` | SQL-инъекции; конвенция raw-pg parameterized |

**Key insight:** В этой фазе «не писать своё» = «переиспользовать существующие мапперы и формулы».
Любая повторная реализация — прямой риск провалить byte-identical-гард.

## Runtime State Inventory

> Фаза — read-only экспозиция уже вычисленных данных + рефактор SQL-источника. Миграций/переименований
> хранимого состояния нет. Категории проверены явно:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — никакие таблицы/ключи не переименовываются; PARITY читает существующие `parser_events`/`player_stats`/`squad_stats`. Verified чтением `legacy-export.ts` + `repository.ts`. | none |
| Live service config | None — нет внешних сервисов с конфигом вне git для этой фазы. Verified: фаза только добавляет роуты. | none |
| OS-registered state | None — нет cron/scheduler/pm2-имён, завязанных на новые роуты. | none |
| Secrets/env vars | None — новые эндпоинты используют существующий `databasePool`/`DATABASE_URL`; новых секретов нет. | none |
| Build artifacts | None для рантайма. **OpenAPI-артефакт** `openapi/server-2.openapi.json` НЕ рантайм-state, но его надо **перегенерировать** (`pnpm run openapi:export`) после добавления схем, иначе `openapi:verify` упадёт. | regenerate openapi snapshot |

## Common Pitfalls

### Pitfall 1: Byte-identical гард сверяет МАППИНГ, а не SQL-текст
**What goes wrong:** Планировщик думает, что любая правка SQL-строки ломает гард.
**Why it happens:** `legacy-export.test.ts` использует `ScriptedLegacyExportPool`, который роутит по
**подстрокам SQL** (`includes("counter_totals")`, `startsWith("select\n  squad.id")`,
`includes("kill_events")`, `includes("case when event.event_type")`) и проверяет результат
`loadExportData()`, а не сам текст. Реальный byte-identical против БД — это `legacy-public-export.test.ts`
(на fake-репозитории, проверяет формулы/сортировку) + `export-legacy-public-stats.test.ts` (мокнутый
pool, проверяет обёртку CLI).
**How to avoid:** При параметризации SQL **сохранить опорные подстроки** из `ScriptedLegacyExportPool`
(строки 296–311 `legacy-export.test.ts`), иначе тестовый роутер перестанет различать запросы. Конкретно
не ломать: префиксы `select\n  squad.id`, `select\n  rotation.id`; вхождения `counter_totals`,
`kill_events`, `case when event.event_type`. **Это самый коварный гард в фазе.**
**Warning signs:** Тест `legacy-export.test.ts` падает с пустыми/перепутанными rows.

### Pitfall 2: CTE `player_id` — TEXT, не UUID
**What goes wrong:** Scoped-чтение по `:id` (uuid) возвращает пусто.
**Why it happens:** `PLAYER_ENTITY_CTE.player_id = coalesce(steam_player.id::text, …, observed_player_ref)`.
Сравнение `= $1::uuid` не сматчится с text-значением; а часть строк имеет player_id = имя/ref, не UUID.
**How to avoid:** Scoping-предикат — `entity.player_id = $1::text` (UUID из path передаётся строкой).
Для weapons/weeks/relationships scope именно по `player_id`/`source_player_id`. Для `PLAYER_STATS_SQL`
scope проще — по `player.id = $1::uuid` (там есть прямой `canonical_players player`).
**Warning signs:** Профиль резолвится (200), но parity-список пуст для игрока с очевидными киллами.

### Pitfall 3: Финальный порядок задаётся JS-мапперами
**What goes wrong:** Порядок weapons/weeks/relationships в API ≠ CLI.
**Why it happens:** `WEAPONS_SQL ORDER BY player_name, weapon_group, kills desc, weapon_name` — лишь
вход; `sortWeaponInputs` пересортировывает `kills desc, name`. `WEEKS_SQL ORDER BY player_name, week desc`,
но `sortWeeks` финально сортирует `week.localeCompare` desc.
**How to avoid:** API-путь обязан прогонять строки через те же `mapWeapons`/`mapWeeks`/`mapRelationships`
(+ их внутренние `toSorted`). Не отдавать сырой `result.rows`.
**Warning signs:** Параметризованный тест порядка падает только на multi-week/multi-weapon кейсах.

### Pitfall 4: `relationshipsForPlayer` зависит от полного otherPlayers-набора
**What goes wrong:** В CLI `playerExport` берёт relationships через `relationshipsForPlayer(otherPlayers, id)`
по **всему** массиву. Scoped-API имеет relationships только одной сущности.
**Why it happens:** `RELATIONSHIPS_SQL` строит симметричные пары (killed↔killers). Scoping по
`source_player_id = $1` уже даёт все 4 списка ДЛЯ этой сущности — `mapRelationships` вернёт один
`LegacyOtherPlayersInput`. Этого достаточно для relationship-эндпоинта.
**How to avoid:** Для relationship-эндпоинта scope `where source_player_id = $1::text` и взять единственный
элемент `mapRelationships(rows)`. Не нужно грузить весь корпус.
**Warning signs:** N+1 или полный скан при сборке relationship-поверхности.

### Pitfall 5: OpenAPI-снэпшот должен быть перегенерирован и проходить freeze-классификацию
**What goes wrong:** `pnpm run openapi:check` / `openapi:verify` падает в `verify`.
**Why it happens:** Новые схемы → новый OpenAPI; `openapi/server-2.openapi.json` коммитится.
**How to avoid:** После схем выполнить `pnpm run openapi:export`, закоммитить артефакт. Изменения —
**additive** (новые роуты/поля), что под FREEZE-03 — minor-совместимо (Фаза 19 формализует gate, здесь
важно лишь не сломать `openapi:verify`).
**Warning signs:** `verify`-скрипт фейлит на `openapi:check`.

### Pitfall 6: Squad parity-поверхности — не тривиальная проекция
**What goes wrong:** Непонятно, откуда брать squad weapons/relationships/weekly (PARITY-06).
**Why it happens:** `WEAPONS_SQL`/`WEEKS_SQL`/`RELATIONSHIPS_SQL` — per-player. CLI на уровне сквада
не агрегирует weapons/weeks/relationships (squad-экспорт несёт только агрегаты + список игроков).
**How to avoid:** См. Open Q3 — определить byte-identical-семантику squad-поверхностей при планировании.
Вероятно: squad-stats (KD/score/games) из `SQUAD_STATS_SQL`, а weapon/weekly/relationship для сквада —
либо агрегат по членам, либо вне scope PARITY-06. **Требует решения до планирования задач.**
**Warning signs:** Нет legacy-формулы/SQL, дающей squad-level weapons.

## Code Examples

### KD / score / total games (PARITY-05) — источник формул
```typescript
// src/modules/statistics/export/legacy-public-export.ts (VERIFIED: прочитано в репозитории)
export function kdRatio(kills: number, deathsTotal: number): number {
  if (deathsTotal === 0) return round(kills);
  return round(kills / deathsTotal);
}
export function totalScore(kills: number, teamkills: number): number {
  return round(kills - teamkills);          // round = Math.round(x*100)/100
}
export function weeklyScore(kills: number, teamkills: number, games: number): number {
  if (games === 0) return 0;
  return round((kills - teamkills) / games);
}
// totalPlayedGames приходит прямо из строки PLAYER_STATS_SQL (sum replay_count).
```

### Per-entity scope для PLAYER_STATS (PARITY-05) — прямой UUID
```sql
-- PLAYER_STATS_SQL уже джойнит `canonical_players player`. Для одного игрока добавить:
--   where player.id = $1::uuid
-- НО: counter_totals/last_games джойнятся по player.id::text — это сохраняется (внутренние CTE
-- остаются unscoped или тоже scoped по player_id::text для производительности; оба варианта
-- byte-identical, отличие — план).
```

### Existing профильный роут (форма для копирования)
```typescript
// src/modules/public-stats/routes/routes.ts:170-192 (VERIFIED)
app.get<{ Params: UuidParametersType; Querystring: PlayerDetailQueryType }>(
  "/stats/players/:id",
  { schema: { params: UuidParameters, querystring: PlayerDetailQuery,
              response: { 200: PlayerProfileResponse, 404: NotFoundResponse },
              tags: ["public-stats"] } },
  async (request, reply) => {
    const item = await options.readModel.getPlayer(request.params.id, rotationFilters(request.query));
    return item ?? reply.code(NOT_FOUND).send({ message: "player not found" });
  },
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SQL inline в `legacy-export.ts` | Shared `parity-sql` источник | Эта фаза | Один источник истины для CLI + API |
| Профиль без KD/score/games | `*StatsResponse` несёт kdRatio/totalScore/totalPlayedGames | Эта фаза | Web не пересчитывает |
| Offset-пагинация | Курсор (Фаза 14) — но parity-списки **не** пагинируются | Фаза 14 | Bounded embedded arrays |

**Deprecated/outdated:** ничего нового не депрекейтится.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Squad-level weapons/weekly/relationships не имеют прямой legacy-формулы; PARITY-06 покрывается squad KD/score/games + (возможно) агрегацией по членам | Pitfall 6 / Open Q3 | Неверный объём squad-поверхностей; нужно подтверждение до планирования задач |
| A2 | Vehicle-поверхность (PARITY-02) корректнее брать из `counter_totals` (`vehicle_kills`/`kills_from_vehicle`), т.к. это поля legacy player-stats, а `weapon_group='vehicles'` — это destroyed_vehicle kills (другая семантика) | Open Q2 | Неверный источник → разойдётся с legacy-числами |
| A3 | Существующий `legacy-export.test.ts` сверяет результат маппинга, а не SQL-текст, поэтому параметризация SQL безопасна при сохранении опорных подстрок | Pitfall 1 | Если где-то есть текстовый снэпшот SQL — параметризация его сломает (не найдено такого теста) |
| A4 | Per-entity scope по `player_id::text` достаточно производителен (есть индексы на parser_events/parser_results) — не проверял планы EXPLAIN | Pitfall 2 | Возможен медленный план; planner может потребовать индекс (но «no schema change» — ограничение milestone) |

## Open Questions

1. **Имя/расположение `parity-sql` модуля и форма builder-API (scoped/unscoped).**
   - Известно: должен жить рядом с `legacy-export.ts`; экспортировать CTE + 5 запросов.
   - Неясно: функция-builder vs. строковый шаблон с `${predicate}`.
   - Рекомендация: builder `weeksSql(scope?)` → `{ sql, values? }`; unscoped-форма обязана давать
     строку, идентичную текущей константе (assert-тест опционально).

2. **Источник vehicle-поверхности (PARITY-02): `counter_totals` vs `weapon_group='vehicles'`.**
   - Известно: legacy player-stats несёт `vehicleKills` и `killsFromVehicle` (из `counter_totals`).
     `WEAPONS_SQL` отдельно даёт `vehicles`-группу (destroyed_vehicle kills по weapon_name).
   - Неясно: что именно понимается под «vehicle statistics» в требовании.
   - Рекомендация: отдавать **оба** — счётчики `{ vehicleKills, killsFromVehicle, killsFromVehicleCoef }`
     на stats-объекте (из player-stats) **и** список `vehicles` из weapon-поверхности. Решить при
     планировании (CONTEXT прямо разрешает «vehicle отдельный эндпоинт или внутри weapon `vehicles`»).

3. **Семантика squad parity-поверхностей (PARITY-06).**
   - Известно: `SQUAD_STATS_SQL` даёт squad KD/score/games + список игроков. Per-player weapons/weeks/
     relationships в CLI на уровень сквада не сворачиваются.
   - Неясно: должны ли `/squads/:id/weapons|weekly|relationships` существовать, и если да — агрегат по
     членам или нет.
   - Рекомендация: минимально гарантировать squad KD/score/games (расширить `SquadStatsResponse`) +
     список игроков сквада; weapon/weekly/relationship для сквада — подтвердить с пользователем до
     планирования (риск scope-creep). **Блокирующий вопрос для squad-части.**

4. **Строгость слоёв при импорте формул.** Импортировать `kdRatio`/`totalScore` напрямую из export-модуля
   удобно, но конвенции допускают кросс-модуль только через service-контракт. Рекомендация: вынести
   формулы в общий чистый модуль (`statistics/parity-formulas.ts`) и импортировать обоими — либо принять
   импорт чистых функций как доменную утилиту (Claude's Discretion).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | Integration tests (`postgres.test.ts`) | ✓ (Docker Compose, `localhost:15432`) | — | — |
| `pnpm` + tsx | сборка/скрипты | ✓ | — | — |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none
(Фаза — только код/SQL/схемы поверх существующего стека.)

## Validation Architecture

> `workflow.nyquist_validation: true` в `.planning/config.json` → секция обязательна.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 + `@vitest/coverage-v8` |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm test` (unit; исключает `*/tests/postgres.test.ts` и `src/test/integration`) |
| Full suite command | `pnpm run verify` (format, lint, typecheck, test, test:integration, openapi:check, coverage) |
| Integration command | `pnpm run test:integration` (postgres.test.ts + `src/test/integration`, `--no-file-parallelism`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PARITY-01 | weapons surface = legacy | integration (real pg) | `pnpm run test:integration` (new case в `public-stats/tests/postgres.test.ts`) | ❌ Wave 0 |
| PARITY-02 | vehicle stats | integration | `pnpm run test:integration` | ❌ Wave 0 |
| PARITY-03 | relationships 4 списка | integration | `pnpm run test:integration` | ❌ Wave 0 |
| PARITY-04 | weekly buckets | integration | `pnpm run test:integration` | ❌ Wave 0 |
| PARITY-05 | KD/score/games на профиле | unit (формулы) + integration (роут) | `pnpm test` + `pnpm run test:integration` | ⚠️ формулы покрыты в `legacy-public-export.test.ts`; роут — Wave 0 |
| PARITY-06 | squad parity surfaces | integration | `pnpm run test:integration` | ❌ Wave 0 |
| Инвариант | CLI export byte-identical | unit | `pnpm test` (`legacy-export.test.ts`, `legacy-public-export.test.ts`, `export-legacy-public-stats.test.ts`) | ✅ существуют — должны остаться зелёными |

### Sampling Rate
- **Per task commit:** `pnpm test` (быстрые unit + byte-identical гарды).
- **Per wave merge:** `pnpm run test:integration` + `pnpm run openapi:check`.
- **Phase gate:** `pnpm run verify` зелёный перед `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `src/modules/public-stats/tests/postgres.test.ts` — добавить scoped parity-кейсы (seed уже есть:
      `canonical_players`, `parser_events`, `player_stats`, `replays` — строки 332–722).
- [ ] (если выбран новый файл формул) `src/modules/statistics/parity-formulas.test.ts` — иначе формулы
      уже покрыты `legacy-public-export.test.ts`.
- [ ] Опциональный assert-тест: unscoped-builder даёт SQL, идентичный legacy-константе (Pitfall 1).
- [ ] Регенерация + коммит `openapi/server-2.openapi.json` (Pitfall 5) — это не тест, но freeze-гейт.
- Framework install: не требуется (Vitest уже настроен).

**Слойный testing-map (skill `solidstats-backend-ts-tests`):** repository → integration (real pg, SQL —
это и есть предмет); route → integration через `app.inject`; формулы → unit (fake/чистые). Mock БД для
parity **запрещён** (скрывает контрактные ошибки SQL).

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 2`.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Public stats анонимны (как и Фаза 14) |
| V3 Session Management | no | Нет сессии на public-read |
| V4 Access Control | partial | IDOR не применим (публичные данные); но **запрет утечки Steam64** — критичен |
| V5 Input Validation | yes | `:id` через `UuidParameters` (`format: uuid`); query через TypeBox |
| V6 Cryptography | no | Нет крипто в фазе |

### Known Threat Patterns for parity reads
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection в per-entity scope | Tampering | Параметризованный `$1::text`/`$1::uuid`, никакой конкатенации id |
| Утечка полного Steam64 в relationship/weapon payload | Information Disclosure | parity-таргеты = `{ id, displayName }` only; choke-point Фазы 14; regex-гард `7656119\d{10}` в integration (как в 14-03) |
| DoS через full-corpus seq-scan | Denial of Service | Архитектурный инвариант: per-entity scope, никогда не bulk-SQL в hot path |
| Echo cursor/id в ошибке | Information Disclosure | 404 — фиксированная строка (`"player not found"`), id не эхоится |

## Sources

### Primary (HIGH confidence) — исходники репозитория
- `src/modules/statistics/repository/legacy-export.ts` — CTE + 5 SQL + мапперы (источник извлечения)
- `src/modules/statistics/export/legacy-public-export.ts` — формулы (`kdRatio`/`totalScore`/`weeklyScore`/`killsFromVehicleCoef`) + сортировки
- `src/modules/public-stats/repository.ts`, `routes/routes.ts`, `routes/schemas.ts`, `routes/models.ts` — целевые роуты/схемы/маппинг
- `src/modules/public-stats/routes/pagination/mask.ts` — masking choke-point
- `src/modules/statistics/repository/tests/legacy-export.test.ts`, `export/tests/legacy-public-export.test.ts`, `src/operations/export-legacy-public-stats.test.ts` — byte-identical гарды
- `src/modules/public-stats/tests/postgres.test.ts` — integration-харнесс (real pg, truncate+seed)
- `.planning/config.json` — nyquist/security флаги; `package.json` — test/openapi-скрипты
- skills: `solidstats-backend-ts-conventions`, `solidstats-backend-ts-tests`, `openapi-to-typescript`

### Secondary / Tertiary
- N/A — фаза полностью покрыта чтением кодовой базы; внешних источников не требовалось.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — нулевая поверхность установки, всё уже в проекте.
- Architecture: HIGH — извлечение и scoping выведены прямым чтением SQL/CTE/мапперов.
- Pitfalls: HIGH — Pitfalls 1–4 верифицированы конкретными строками тестов/SQL; A4 (план EXPLAIN) — не проверялся.
- Squad parity (PARITY-06): MEDIUM — нет прямой legacy-формулы для squad weapons/weekly/relationships (Open Q3).

**Research date:** 2026-06-06
**Valid until:** ~30 дней (стабильный внутренний код; пере-снять при изменении `legacy-export.ts`/схем).
