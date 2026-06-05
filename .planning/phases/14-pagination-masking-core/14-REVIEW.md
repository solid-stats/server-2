---
phase: 14-pagination-masking-core
reviewed: 2026-06-05T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - src/modules/public-stats/routes/pagination/cursor.ts
  - src/modules/public-stats/routes/pagination/sort.ts
  - src/modules/public-stats/routes/pagination/keyset.ts
  - src/modules/public-stats/routes/pagination/errors.ts
  - src/modules/public-stats/routes/pagination/mask.ts
  - src/modules/public-stats/routes/filters.ts
  - src/modules/public-stats/routes/schemas.ts
  - src/modules/public-stats/routes/models.ts
  - src/modules/public-stats/routes/routes.ts
  - src/modules/public-stats/routes/empty-read-model.ts
  - src/modules/public-stats/repository.ts
  - src/infra/logging/logger.ts
  - src/infra/db/migrations/0005_keyset_indexes.sql
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-06-05
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Архитектура пагинации сделана аккуратно: SQL-инъекция в keyset/repository отсутствует — все сортировки и направления берутся из фиксированного whitelist (`SortDescriptor.expr` — серверная константа), а пользовательские значения курсора и `search` уходят только как `$n`-параметры. Codec курсора (`decodeCursor`) корректно fail-closed на malformed/oversized/неверной арности входе. Маскирование Steam64 в response-пути единственное (`mapPlayerProfile` → `maskSteamId`), и список игроков steamIds не отдаёт вовсе.

Главная проблема — **некорректность keyset-предиката при пагинации по `name` с NULL-веткой**: для DESC текстовая сортировка использует `NULLS LAST`, но при reverse-сравнении строк PostgreSQL применяет коллацию, которая может разойтись с порядком в `ORDER BY` индекса (см. WR-02), а главный баг — нарушение контракта `numeric`/cast в keyset для агрегатов bigint (CR-01). Также есть пробел в redaction-путях логгера для top-level Steam-полей и несколько вопросов контрактной согласованности между 4 list-эндпоинтами.

## Critical Issues

### CR-01: keyset seek для kills/teamkills кастит bound-значение в `::int`, тогда как агрегат — `bigint`; при сумме > 2^31 курсор молча теряет/дублирует строки

**File:** `src/modules/public-stats/routes/pagination/keyset.ts:83` (совместно с `sort.ts:31-32` и `repository.ts:484-485,619-624`)

**Issue:** Выражение сортировки для `kills`/`teamkills` — `coalesce(sum((stats.stats->>'kills')::integer), 0)`. В PostgreSQL `sum(integer)` возвращает **`bigint`**, не `int`. Связанное значение курсора биндится как `$n::int` (`valuePlaceholder = ...::${numeric ? "int" : "text"}`). Пока сумма ≤ 2 147 483 647 всё работает, но как только агрегат превышает диапазон `int4`:
- `$n::int` бросит `integer out of range` на этапе декода курсора следующей страницы → **необработанное исключение 500** (это не `BadCursorError`, поэтому `mapPublicStatsError` его пробросит дальше как 500), хотя курсор валиден.
- До переполнения сравнение `bigint_expr < $n::int` корректно (int промоутится в bigint), но это маскирует проблему до продакшн-данных большого объёма.

Это нарушает контракт пагинации (валидный nextCursor должен всегда давать корректную следующую страницу) и превращается в reproducible 500 на больших агрегатах.

**Fix:** Касты bound-значения должны соответствовать типу выражения. Для агрегатных числовых ключей используйте `::bigint`, для stored `bounty.points` (тип колонки) — тоже `::bigint`/`::numeric` по факту. Самый чистый вариант — добавить в `SortDescriptor` явный тип каста вместо булева `numeric`:

```ts
// sort.ts
export interface SortDescriptor {
  expr: string;
  /** SQL cast applied to the bound seek value, e.g. "bigint" | "text". */
  castType: "bigint" | "text";
  nullable: boolean;
}
// kills/teamkills/points -> castType: "bigint"; name -> castType: "text"
```
```ts
// keyset.ts
valuePlaceholder = `$${String(startParameterIndex)}::${descriptor.castType}`,
```
И убедитесь, что `bounty.points` (если это `int`) тоже не переполняется — при `int4`-колонке `::bigint` безопасен, при `numeric` используйте `::numeric`.

## Warnings

### WR-01: redaction-пути логгера не покрывают top-level `steamId`/`steam_id`/`steam_ids`; raw Steam64 может попасть в лог при логировании DB-строки

**File:** `src/infra/logging/logger.ts:13-21`

**Issue:** Все Steam-пути заданы как `*.steamId`, `*.steamIds`, `*.steam_id`, `*.steam_ids` — паттерн `*.` требует **родителя**. Если где-либо логируется сам объект строки (`PlayerRow` с полем `steam_ids`) на верхнем уровне (`log.info(row)` / `log.error({ steam_ids })`), redaction не сработает, и `7656119\d{10}` уйдёт в лог. SEC-02 (zero-leak) формально держится в текущем коде, но redaction — это defense-in-depth, и его покрытие неполное.

**Fix:** Добавьте top-level варианты и явный array-wildcard:

```ts
paths: [
  "databaseUrl", "rabbitmqUrl", "s3.accessKeyId", "s3.secretAccessKey",
  "*.password", "*.secret",
  "steamId", "steamIds", "steamIds[*]", "steam_id", "steam_ids", "steam_ids[*]",
  "*.steamId", "*.steamIds", "*.steamIds[*]",
  "*.steam_id", "*.steam_ids", "*.steam_ids[*]",
],
```

### WR-02: текстовый keyset по `name` сравнивает через `<`/`>` под коллацией БД — порядок может разойтись с `NULLS FIRST/LAST` ORDER BY и привести к пропуску/дублированию строк

**File:** `src/modules/public-stats/routes/pagination/keyset.ts:54,85,94`

**Issue:** Для `name` seek-сравнение — `sortExpr < $n::text` (DESC) / `> ` (ASC), а ORDER BY — `players.display_name DESC NULLS LAST, id ASC`. Сравнение `<`/`>` в PostgreSQL и сортировка `ORDER BY` обе используют коллацию колонки, поэтому они согласованы **только если** seek-выражение и ORDER BY-выражение идентичны посимвольно (они идентичны: оба `players.display_name`). Это в порядке для текущего кода. Однако индекс `idx_canonical_players_display_name_id (display_name, id)` создан **без явной коллации** и **без** учёта `NULLS LAST` для DESC — планировщик не сможет использовать его как seek-индекс для DESC NULLS LAST (порядок индекса по умолчанию ASC NULLS LAST). Это деградирует в full scan + sort на больших таблицах. Корректность сохраняется, но индексное обещание из `0005_keyset_indexes.sql` не выполняется для DESC-сортировки имени.

**Fix:** Либо ограничьте `name`-сортировку одним направлением, либо создайте направленные индексы, совпадающие с реальными ORDER BY:

```sql
create index if not exists idx_canonical_players_name_desc_id
  on canonical_players (display_name desc nulls last, id);
create index if not exists idx_canonical_players_name_asc_id
  on canonical_players (display_name asc nulls first, id);
```
(аналогично для `squads.name`). Подтвердите через `explain` перед мерджем.

### WR-03: `getLeaderboards` выполняет три list-запроса последовательно через `await`, утраивая латентность

**File:** `src/modules/public-stats/repository.ts:360-371`

**Issue:** `bounty`, `players`, `squads` независимы, но выполняются последовательно (`await ... await ... await`). На leaderboard-эндпоинте это 3× round-trip к БД на ровном месте. (Чисто-перформанс вне scope v1, но это ещё и контрактная несогласованность: `getOverview` рядом использует `Promise.all`, а семантически идентичный кейс — нет.)

**Fix:**
```ts
const [bounty, players, squads] = await Promise.all([
  this.listBounty(filters, leaderboardPage("points", filters.limit, filters.bountyAfter)),
  this.listPlayers(filters, leaderboardPage("kills", filters.limit, filters.playersAfter)),
  this.listSquads(filters, leaderboardPage("kills", filters.limit, filters.squadsAfter)),
]);
```

### WR-04: `decodeAfter` сводит `value === 0` корректно, но `payload.values[0] ?? null` теряет различие при будущих nullable-числовых ключах с легитимным значением — и не валидирует, что строковый/числовой тип значения соответствует `descriptor.numeric`

**File:** `src/modules/public-stats/routes/filters.ts:84-85`; `src/modules/public-stats/routes/pagination/cursor.ts:67-71`

**Issue:** `decodeCursor` проверяет только что элементы `values` — примитивы (number|string|null), но НЕ проверяет, что тип значения соответствует типу сортировочного поля. Подделанный курсор может пронести строку для числового ключа `kills` (`values: ["abc"]`). Тогда в keyset биндится `'abc'::int` → ошибка БД (`invalid input syntax for type integer`) → **необработанный 500**, а не 400. Контракт «fail closed → BadCursorError → 400» нарушается для типового несоответствия.

**Fix:** Прокиньте `numeric` сорт-дескриптора в декод и валидируйте тип значения, бросая `BadCursorError`:

```ts
// в decodeAfter, после resolveSort известен descriptor.numeric:
if (descriptor.numeric && typeof value === "string") {
  throw new BadCursorError("bad cursor value type");
}
if (!descriptor.numeric && typeof value === "number") {
  throw new BadCursorError("bad cursor value type");
}
```

### WR-05: контрактная несогласованность лимита — `LeaderboardQuery.limit` default=10/max=100, а `PaginationQuery.limit` default=25; `leaderboardFilters` делает `Number(query.limit)` хотя typebox уже привёл к Integer

**File:** `src/modules/public-stats/routes/schemas.ts:6-8,45-47`; `src/modules/public-stats/routes/filters.ts:137`

**Issue:** Два разных дефолта лимита (10 vs 25) на семантически родственных list-поверхностях — это допустимое продуктовое решение, но не задокументировано в контракте и легко станет источником путаницы для `web`-консьюмера. Дополнительно `Number(query.limit)` в `leaderboardFilters` избыточен: typebox-схема уже отдаёт `number` (`Type.Integer`), а если бы не отдавала — `Number(undefined)` дал бы `NaN`, который тихо утёк бы в `limit + 1` → `NaN` в SQL. Это латентная ловушка.

**Fix:** Убрать лишний `Number()` (полагаться на типизацию схемы) и зафиксировать намеренную разницу дефолтов комментарием/в OpenAPI-описании. Если значения должны совпадать — выровнять дефолты.

## Info

### IN-01: `firstCountRow` использует небезопасный каст `rows as [CountRow, ...CountRow[]]`

**File:** `src/modules/public-stats/repository.ts:476-478`

**Issue:** `count(*)` всегда возвращает ровно одну строку, поэтому на практике безопасно, но `as [CountRow, ...]` — это непроверенный assertion, обходящий строгую типизацию. Если запрос когда-нибудь вернёт 0 строк, `[0]` даст `undefined.count` → runtime TypeError.

**Fix:** `const first = rows[0]; if (first === undefined) throw new Error("count returned no rows"); return Number(first.count);`

### IN-02: `rotationFilters` принимает `RotationFilters`, но вызывается с типами запросов (`PlayerListQueryType` и т.п.) — сигнатура вводит в заблуждение

**File:** `src/modules/public-stats/routes/filters.ts:96-98`

**Issue:** `export function rotationFilters(query: RotationFilters): RotationFilters` — параметр назван `query` и типизирован как результат, хотя фактически принимает входной query-объект. Работает из-за структурной совместимости, но именование/тип искажают намерение и снижают читаемость.

**Fix:** Принимать общий `{ rotationId?: string }` входной тип и возвращать `RotationFilters`, либо переименовать тип параметра в соответствующий query-тип.

### IN-03: дублирование `emptyPage`/`emptySurface`/`emptyLeaderboards` shape между `filters.ts` и `empty-read-model.ts`

**File:** `src/modules/public-stats/routes/empty-read-model.ts:54-56` и `src/modules/public-stats/routes/filters.ts:156-159`

**Issue:** `emptySurface<T>()` и `emptyPage<T>()` возвращают идентичный литерал `{ hasMore: false, items: [], nextCursor: null }`. Дублирование контракта пустой страницы в двух местах — риск рассинхронизации при изменении формы.

**Fix:** Переиспользовать `emptyPage()` из `filters.ts` в `empty-read-model.ts` вместо локального `emptySurface`.

### IN-04: магическое число `2` для `parameterIndex` поиска передаётся литералом

**File:** `src/modules/public-stats/repository.ts:185,242`

**Issue:** `playerSearchWhere(filters.search, 2)` — `2` означает «search занимает $2 после $1 rotation». Это связано неявным контрактом с `baseParameterCount` ниже; при добавлении нового фильтра легко рассинхронизировать индексы вручную.

**Fix:** Вычислять индекс из позиции rotation-параметра (например, константа `ROTATION_PARAM = 1`, `SEARCH_PARAM = ROTATION_PARAM + 1`) или строить параметры через единый счётчик.

---

_Reviewed: 2026-06-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
