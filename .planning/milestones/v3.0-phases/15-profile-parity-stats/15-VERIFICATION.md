---
phase: 15-profile-parity-stats
verified: 2026-06-07T09:35:00Z
status: passed
score: 16/16 must-haves verified
overrides_applied: 0
---

# Phase 15: Profile Parity Stats — Отчёт о верификации

**Цель фазы:** Public player and squad profiles expose the already-computed parity surfaces with numbers byte-identical to the legacy export.
**Verified:** 2026-06-07T09:35:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Достижение цели

Верификация проведена goal-backward: от четырёх success criteria ROADMAP + семи must_haves planов
к фактическому коду, тестам и запускам. Все parity-поверхности реально присутствуют, подключены к
общему `parity-sql`-источнику через per-entity scoped-предикаты, переиспользуют legacy-мапперы и
чистые формулы (byte-identical), и не утекают Steam64. Тесты прогнаны в собственном процессе.

### Observable Truths (ROADMAP Success Criteria + PLAN must_haves)

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| SC1 | API отдаёт per-player weapon/vehicle/relationship-статистику по legacy-формулам | ✓ VERIFIED | Роуты `routes.ts:203/220/237`; `repository.ts` использует `weaponsSql/playerStatsSql/relationshipsSql({scopeId})`; reuse `mapWeapons/mapRelationships/sortWeapons`; 90 integration-тестов green |
| SC2 | API отдаёт weekly-бакеты + KD/score/total games на профиле игрока | ✓ VERIFIED | Роут `/weekly` (`routes.ts:256`); `PlayerStatsResponse` расширен `kdRatio/totalScore/totalPlayedGames` (`schemas.ts`); формулы из `parity-formulas.ts` |
| SC3 | Squad-профили отдают эквивалентные parity-поверхности | ✓ VERIFIED | `SquadStatsResponse` расширен (byte-identical к `SQUAD_STATS_SQL`); роуты `/stats/squads/:id/weapons|relationships|weekly` (`routes.ts:317/332/349`); member-агрегация документирована (`repository.ts:586` "deterministic member-level aggregation") |
| SC4 | Чтения — per-entity-scoped через единый shared `parity-sql`, CLI export остаётся byte-identical | ✓ VERIFIED | `parity-sql.ts:114` `predicate(scope, "where player.id = $1::uuid")`, `:160` squad; `legacy-export.ts:167-228` потребляет unscoped-builders; byte-identical guard-тесты green |
| T-01a | CLI legacy export stdout byte-identical после извлечения SQL | ✓ VERIFIED | `legacy-export.test.ts`, `legacy-public-export.test.ts`, `export-legacy-public-stats.test.ts` все проходят (входят в 320 unit) |
| T-01b | Shared parity-sql экспортирует CTE + builder на surface (scoped/unscoped) | ✓ VERIFIED | `parity-sql.ts` экспортирует `PLAYER_ENTITY_CTE` + `playerStatsSql/squadStatsSql/relationshipsSql/weaponsSql/weeksSql`, каждый `{ sql, values }` |
| T-01c | Unscoped-форма каждого builder совпадает с исходной legacy-константой | ✓ VERIFIED | `legacy-export.ts:167-228` строит константы ИЗ unscoped-builders (`playerStatsSql().sql` и т.д.); byte-identical guard-тесты подтверждают вывод неизменным |
| T-01d | Чистые формулы в одном модуле, импортируются и export, и API | ✓ VERIFIED | `parity-formulas.ts` (`kdRatio/totalScore/weeklyScore/killsFromVehicleCoef/round`); `parity-formulas.test.ts` green; импортируется в `repository.ts:11-13` и `legacy-public-export.ts` |
| T-01e | Row-мапперы и sort/format-хелперы EXPORTED для reuse в 02/03 | ✓ VERIFIED | gsd-sdk verify.artifacts: exports присутствуют; key-links 02/03 verified (mapWeapons/squadStats/sortWeapons/weekExport импортируются) |
| T-02a | `/players/:id/weapons` — firearms+vehicles по legacy-порядку | ✓ VERIFIED | `repository.ts:470-481` firearms/vehicles split, `sortWeapons` reuse |
| T-02b | `/players/:id/vehicles` — счётчики + vehicles weapon-group | ✓ VERIFIED | `repository.ts:492-514` `Promise.all([playerStatsSql, weaponsSql])`, `killsFromVehicleCoef` |
| T-02c | `/players/:id/relationships` — 4 списка `{player:{id,displayName}, count}` | ✓ VERIFIED | `schemas.ts:79-83`; `PlayerReferenceResponse` (`:190`) — только `{id, displayName}`, no Steam64 |
| T-02d | `/players/:id/weekly` — бакеты как legacy weekExport | ✓ VERIFIED | `repository.ts:559-578` `weeksSql({scopeId})` → `mapWeeks` → `sortWeeks` (внутри `weekExport`) |
| T-02e/03b | No full Steam64 (`7656119\d{10}`) в любом parity-body/404 | ✓ VERIFIED | Leak-guard `postgres.test.ts:938,1064`, regex `/7656119\d{10}/u` = 0 matches; integration green |
| T-02f/03c | Parity-чтения per-entity-scoped (нет full-corpus seq scan) | ✓ VERIFIED | Все вызовы передают `scopeId`; `parity-sql.ts` добавляет `where ... = $1::uuid/::text`; scoped-тесты в `parity-sql.test.ts` |
| T-03a | Squad stats byte-identical к SQUAD_STATS_SQL семантике | ✓ VERIFIED | `repository.ts:1080-1098` `squadStats()` использует `kdRatio/totalScore`, `totalPlayedGames=replayCount`, комментарий PARITY-06 |

**Score:** 16/16 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/modules/statistics/repository/parity-sql.ts` | CTE + 5 scoped/unscoped builders | ✓ VERIFIED | gsd-sdk passed; содержит `player_entities as`, `predicate(...)` |
| `src/modules/statistics/parity-formulas.ts` | kdRatio/totalScore/weeklyScore/killsFromVehicleCoef | ✓ VERIFIED | gsd-sdk passed; exports + test |
| `src/modules/statistics/repository/legacy-export.ts` | EXPORTED мапперы; consumes unscoped builders | ✓ VERIFIED | `:3-8` import из `./parity-sql.js`; `:167-228` потребляет builders |
| `src/modules/statistics/export/legacy-public-export.ts` | EXPORTED sort/format helpers + re-export формул | ✓ VERIFIED | gsd-sdk passed; link к parity-formulas verified |
| `src/modules/public-stats/routes/schemas.ts` | Player+Squad parity TypeBox-схемы | ✓ VERIFIED | `PlayerWeaponsResponse`, `SquadWeaponsResponse`, расширенные stats |
| `src/modules/public-stats/repository.ts` | get(Player|Squad)Weapons/Vehicles/Relationships/Weekly | ✓ VERIFIED | Все методы present, scoped builders |
| `src/modules/public-stats/routes/routes.ts` | 7 sub-resource роутов | ✓ VERIFIED | 4 player + 3 squad роута зарегистрированы |
| `openapi/server-2.openapi.json` | Контракт со всеми parity-путями | ✓ VERIFIED | 7 parity-путей; `openapi:check` green (freeze gate) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| legacy-export.ts | parity-sql.ts | imports unscoped builders | ✓ WIRED | gsd-sdk дал false-negative (multiline import); вручную подтверждено: `:3-8 from "./parity-sql.js"`, `:167-228` consume |
| legacy-public-export.ts | parity-formulas.ts | re-export/import формул | ✓ WIRED | gsd-sdk verified |
| public-stats/repository.ts | parity-sql.ts (scoped) | scoped builder import | ✓ WIRED | gsd-sdk verified (02 и 03) |
| public-stats/repository.ts | legacy-export EXPORTED мапперы + formulas | import mappers | ✓ WIRED | gsd-sdk verified |
| public-stats/repository.ts | legacy-public-export sort/format helpers | import sortWeapons/weekExport | ✓ WIRED | gsd-sdk verified |
| routes.ts | ReadModel parity methods | options.readModel.getPlayer* | ✓ WIRED | gsd-sdk verified |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| getPlayerWeapons | firearms/vehicles | `weaponsSql({scopeId})` → реальный pg-запрос | Yes (integration: Rifle×2 > Pistol×1) | ✓ FLOWING |
| getPlayerVehicles | counters + vehicles | `playerStatsSql`+`weaponsSql` parallel | Yes (killsFromVehicle=1, vehicleKills=2, coef≈0.333) | ✓ FLOWING |
| getPlayerRelationships | killed/killers/tk | `relationshipsSql({scopeId})` | Yes (Alpha→Bravo 3×, Bravo→Alpha 1×) | ✓ FLOWING |
| getPlayerWeekly | weeks | `weeksSql({scopeId})` | Yes (kdRatio/totalPlayedGames на бакет) | ✓ FLOWING |
| getSquad* | member aggregations | per-member scoped queries `Promise.all` | Yes (member sums, integration green) | ✓ FLOWING |
| Player/Squad stats | kdRatio/totalScore/totalPlayedGames | `kdRatio()/totalScore()` formulas над row | Yes (integration PARITY-05/06) | ✓ FLOWING |

### Behavioral Spot-Checks / Probe Execution

Phase — DB-backed API. Verifier прогнал реальные наборы (не доверяя SUMMARY):

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Typecheck чистый | `pnpm run typecheck` | `tsc --noEmit` без ошибок | ✓ PASS |
| Unit + byte-identical guards | `pnpm test` | 58 files / 320 tests passed | ✓ PASS |
| DB-backed parity + leak guard | `pnpm run test:integration` | 8 files / 90 tests passed | ✓ PASS |
| OpenAPI freeze gate | `pnpm run openapi:check` | verify-openapi + generation OK | ✓ PASS |

(Engine-warning Node v22 vs >=25 — ожидаемо, non-blocking.)

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| PARITY-01 | 15-01, 15-02 | per-player weapon stats | ✓ SATISFIED | `/weapons` роут + scoped weaponsSql + integration |
| PARITY-02 | 15-01, 15-02 | per-player vehicle stats | ✓ SATISFIED | `/vehicles` counters + vehicles group + coef |
| PARITY-03 | 15-01, 15-02 | killed/killers/teamkilled/teamkillers | ✓ SATISFIED | 4 списка `{player:{id,displayName},count}` |
| PARITY-04 | 15-01, 15-02 | weekly buckets | ✓ SATISFIED | `/weekly` роут + weekExport reuse |
| PARITY-05 | 15-01, 15-02 | KD/score/total games на профиле | ✓ SATISFIED | расширенный PlayerStatsResponse + integration |
| PARITY-06 | 15-01, 15-03 | squad parity-поверхности | ✓ SATISFIED | squad stats byte-identical + member-агрегации |

Нет orphaned-требований: REQUIREMENTS.md привязывает PARITY-01..06 к Phase 15, все заявлены в планах.

### Anti-Patterns Found

Маркеров долга (`TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER/not implemented`) в изменённых файлах
не обнаружено. Пустые `return { firearms: [], vehicles: [] }` — это легитимный путь
«сущность есть, событий нет» (после existence-check, не stub). Stubs: нет (подтверждено всеми тремя SUMMARY и кодом).

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | none | — | — |

### Human Verification Required

Нет. `15-VALIDATION.md` явно фиксирует: «All phase behaviors have automated verification»
(parity полностью автоматизируема против реального pg). Steam64-leak guard, byte-identical
guard-тесты и DB-integration покрывают все поведения; визуальной/real-time/внешней проверки не требуется.

### Gaps Summary

Гэпов нет. Все 16 must_haves и 4 ROADMAP success criteria верифицированы против кода и реальных
прогонов тестов. Единственное расхождение — false-negative в `gsd-sdk verify.key-links` для
импорта `legacy-export.ts → parity-sql.ts` (multiline import statement), вручную подтверждено как
WIRED. Архитектурный инвариант (единый shared parity-sql, per-entity scoped, byte-identical CLI
export) соблюдён. Поле `steamIds` в `PlayerProfileResponse` — наследие Phase 14 contract под
masking choke-point, вне scope новых parity-поверхностей; leak-guard подтверждает 0 утечек
полного Steam64.

---

_Verified: 2026-06-07T09:35:00Z_
_Verifier: Claude (gsd-verifier)_
