# Phase 12 Verification: Legacy Public Export Contract

## Verdict

PASS.

Phase 12 satisfies PUB-07 through PUB-13 and API-05.

## Requirement Evidence

| Requirement | Evidence | Status |
|-------------|----------|--------|
| PUB-07 | `pnpm run ops:stats:legacy-export` exports deterministic `players` global statistics. | PASS |
| PUB-08 | Export JSON includes deterministic `squads` statistics with visible squad identity. | PASS |
| PUB-09 | Export JSON includes deterministic `rotations` with rotation-scoped players and squads. | PASS |
| PUB-10 | Export JSON includes `other_players`, `weapons`, and `weeks` detail surfaces. | PASS |
| PUB-11 | Export contract includes kills, kills from vehicle, vehicle kills, teamkills, deaths, KD, score, total played games, relationships, weapons, weekly buckets, and visible player/squad identity. | PASS |
| PUB-12 | Export metadata includes source database, command version, corpus scope, generated time, contract version, and totals. | PASS |
| PUB-13 | `docs/legacy-public-export.md` documents parser-level normalization boundaries and keeps broad allowlists out of aggregate semantics. | PASS |
| API-05 | `docs/api-compatibility.md` documents the Phase 12 public API non-change, and `pnpm run openapi:check` passed without modifying the committed OpenAPI artifact. | PASS |

## Verification Commands

```bash
pnpm run verify
```

Result: PASS.

The command completed format, lint, typecheck, unit tests, integration tests, OpenAPI verification/type generation, backup runbook check, and V8 coverage at 100%.

Additional Plan 12-01 smoke evidence:

```bash
./node_modules/.bin/tsx src/operations/export-legacy-public-stats.ts --corpus-scope local-check --generated-at 2026-05-12T00:00:00.000Z
```

Result: emitted valid `legacy-public-export.v1` JSON from the local PostgreSQL database.

Known environment note: pnpm emitted the existing engine warning because the active shell uses Node v22.22.2 while the repository targets Node >=25 <26.

## Scope Boundaries

- No OCAP parsing was added to `server-2`.
- No replay source crawling was added to `server-2`.
- No legacy SSH snapshot capture was added to `server-2`.
- No Kubernetes, Secret mutation, rollout, or deployment orchestration was added.
- No public Fastify route or OpenAPI response shape was changed.
