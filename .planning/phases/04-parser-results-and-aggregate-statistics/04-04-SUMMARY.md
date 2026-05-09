# Plan 04-04 Summary: Bounty Formula

## Completed

- Documented the v1 bounty formula in `docs/bounty-formula.md` and linked it from README.
- Added pure bounty calculation in `src/modules/statistics/bounty/bounty.ts`.
- Added repository recalculation that overwrites `bounty_points` rows for the affected rotation.
- Loaded previous-rotation player and squad aggregate stats as the bounty effectiveness inputs.
- Persisted per-attacker bounty totals and per-event input evidence in `bounty_points.inputs`.
- Kept split-suite layout aligned with `unit-tests-philosophy`: `bounty/bounty.ts` with `bounty/tests/*` and repository scenarios under `repository/tests/*`.

## Formula

```text
base_score = 1
player_factor = previous_rotation_victim_player_kills / max(1, previous_rotation_victim_player_deaths)
squad_factor = previous_rotation_victim_squad_kills / max(1, previous_rotation_victim_squad_deaths)
points = base_score * (1 + player_factor) * (1 + squad_factor)
```

Missing or invalid previous-rotation evidence uses factor `0`. Teamkills, unknown kills, and unresolved-victim kills award `0` and record exclusion evidence.

## Old Parser Regression Evidence

- Carried forward old statistics invariants that enemy kills and teamkills are distinct classifications.
- Preserved the rule that teamkills do not award bounty points even when previous effectiveness inputs exist.
- Covered missing previous rotation, invalid previous stats, missing victim evidence, unresolved attacker evidence, and deterministic recalculation replacement.

## Verification

- `pnpm run verify` passed on 2026-05-09.
- Unit tests: 14 files, 66 tests passed.
- Integration tests: 3 files, 11 tests passed.
- Coverage: 100% statements, branches, functions, and lines.

## Notes

- Local commands still emit Node engine warnings because this shell is Node v22.22.2 while the repo target is Node >=25 <26.
