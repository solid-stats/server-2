# Deep Brainstorm Brief — server-2 Track C Toolchain Convergence

## Context
- **Date:** 2026-06-14
- **Request:** Apply the lessons from the just-shipped `replays-fetcher` Track C pilot (v3.0, toolchain convergence onto the shared `@solid-stats/ts-toolchain` preset) to the heavier `server-2` refactor, per `plans/product/RELEASE-PLAN.md` Phase 2.
- **GSD stage:** pre-`new-milestone` / pre-`spec` for server-2's Track C milestone (server-2 is "Awaiting next milestone"; v3.0 Public API + contract-freeze done).
- **Target outcome:** decision pack that feeds `/gsd-new-milestone` → spec/plan for server-2 Track C.
- **Artifact owner:** orchestrator (this session), grounded in a 5-agent evidence workflow + direct empirical verification.

## Goal
Converge `server-2` onto the shared `@solid-stats/ts-toolchain` toolchain — **full convergence, same shape as the fetcher pilot** (oxfmt + oxlint with a **blocking** type-aware async-gate + tsdown + lefthook + CI on the new surface) — **behavior-preserving**, with the **frozen OpenAPI 1.0.0 contract intact** and `verify` green at 100% coverage at every phase boundary. server-2 is ~4.5× the fetcher (185 src files, 5 ops gates, a frozen contract), so the convergence is the same mechanism applied with three server-specific complications woven through, not a partial/formatter-only retreat.

## Users And Workflows
- **Operators / CI:** `pnpm verify` and the GH Actions pipeline are the gate; the migration must keep them green and not weaken any existing gate (contract, ops, coverage).
- **`web` (downstream):** consumes the frozen OpenAPI `1.0.0` via generated client — the contract must not drift one byte during the refactor.
- **AI-agent developers:** lefthook pre-commit/pre-push mirror CI as a fast local pre-filter.

## Scope
### Must Have
- Prettier → **oxfmt** (shared `.oxfmtrc` byte-mirror), single isolated format-only commit.
- ESLint → **oxlint**, with `oxlint --type-aware` (tsgolint) wired as a **blocking** gate in `verify` so `no-floating-promises`/`require-await` async-correctness stays enforced continuously (no window where it is off).
- `eslint-plugin-import-x` dropped → **dependency-cruiser** (no-cycle/boundary) + **knip** (unused/dep hygiene), with a planted-cycle proof.
- `tsc`-emit → **tsdown**, **multi-entry** (`src/server.ts` + `src/infra/db/migrate.ts` — the two prod-shipped entrypoints), deps externalized.
- **lefthook** from the preset (`extends` + `.lefthookrc` PATH shim + `allowBuilds: lefthook`), pre-commit (oxfmt+oxlint staged) / pre-push (tsc+vitest), bypassable with `--no-verify`.
- CI rewritten onto the new command surface; **all 5 existing gates preserved**: `openapi:check`, `ops:boundary:check`, `ops:backup:check`, integration, 100% coverage.
- Behavior-preserving: **zero changes to runtime behavior or the generated contract**; 100% V8 coverage maintained.

### Nice To Have
- Promote any naming-convention enforcement lost in the ESLint→oxlint swap into the `solidstats-server-ts-code-review` skill checklist (oxlint 1.69 has no naming-convention equivalent).
- A `CHANGELOG`/compat note in the preset repo documenting the consumption pattern for consumer #3 (`web`).

### Non Goals
- No API/contract changes (the freeze stays frozen).
- No business-logic refactor beyond what convention-compliance strictly requires.
- No production cutover (that is a later release step, gated separately).
- The Request-model rewrite (guided flows) is a **separate** server-2 Phase-2 concern, not part of this toolchain track.

## Confirmed Decisions
| Decision | Choice | Rationale | Consequence |
|----------|--------|-----------|-------------|
| **F1 — Linter** | Full oxlint swap **now**, with type-aware (tsgolint) as a **blocking** `verify` gate; drop ESLint | Empirically proven (below) that tsgolint installs clean via pnpm and catches `no-floating-promises`/`require-await` with exit 1 — so async-correctness moves eslint→oxlint **continuously**, no gap. User wants to migrate now. | server-2 keeps a continuous async-gate; RELEASE-PLAN D1 (full Oxlint, all repos) **holds**. The fetcher kept type-aware non-blocking only due to a wrong install assumption — see Question Ledger. |
| **F2 — Build** | **tsdown, common tooling**, multi-entry (`server.ts` + `migrate.ts`) | User wants one build tool across repos. Verified prod runs exactly two built entries from `dist` (`docker-compose.prod.yml` → `node dist/src/infra/db/migrate.js`; `CMD node dist/src/server.js`; `tsx` is dev-only so prod cannot run scripts from source). | tsdown emits 2 bundles; ops/openapi scripts stay on tsx (dev/CI only). Watch the migrations-path resolution + Dockerfile `COPY` paths (migrate.js reads SQL from `dist/src/infra/db/migrations`). |
| **F3 — Import hygiene** | Add dependency-cruiser + knip with a planted-cycle proof | Highest-value transfer at scale: cycle/boundary + dead-code detection on a 185-file graph. Stack-neutral, no async risk. | Wired into `verify` after build; preserves all 5 ops gates. |
| **F4 — Preset hardening (pre-step)** | Bump preset to **v0.1.4** before server-2 starts: proven-consumable build-time import gate + `.oxfmtrc.json` byte-mirror + **type-aware setup** (rule-enablement + tsgolint pin) | Institutionalizes the CFG-04 class of bug (a preset is only proven when a real consumer imports every export at build time); type-aware goes blocking across repos so the preset must carry its setup. | A small preset-repo milestone precedes server-2 Track C; server-2 pins `#v0.1.4`. |
| **Phase shape** | Mirror the fetcher: cleanup/conventions → oxfmt (isolated) → oxlint(+type-aware blocking) → tsdown(2-entry) → lefthook+CI, with contract/ops-gate preservation woven through | Proven ordering; isolates churn per tool; critical at 4.5× scale. | ~5–6 phases; each lands green on full `verify` **+ contract-diff**. |
| **META — RELEASE-PLAN D1** | **No amendment needed.** server-2 gets the full Oxlint+Oxfmt+tsdown+lefthook convergence | The two miner-flagged "blockers" (type-aware un-blockable, tsdown can't handle entries) were refuted by direct verification. | D1's "whole Track C gates cutover, all TS repos" stays literally true for server-2. |
| **Fetcher follow-up** | Promote the fetcher's `lint:types` to a **blocking** gate (backlog) | It is non-blocking only because of the same wrong tsgolint-install assumption now disproven. | Small fetcher backlog item; aligns both repos on a blocking type-aware gate. |

## Assumptions
| Assumption | Confidence | Evidence | How To Validate |
|------------|------------|----------|-----------------|
| `oxlint-tsgolint` installs cleanly via pnpm (no tmpdir hack, no allowBuilds) and is frozen-lockfile-safe | **VERIFIED** | `pnpm add -D oxlint-tsgolint@0.23.0` in a clean dir → `Done`, `pnpm install --frozen-lockfile` exit 0; package has empty `scripts` (no postinstall), platform binary is an `optionalDependencies` (`@oxlint-tsgolint/linux-x64`) resolved by pnpm under `.pnpm/`. | Re-run in server-2 during the oxlint phase. |
| Type-aware oxlint enforces async-correctness as a blocking gate | **VERIFIED** | `oxlint --type-aware` on a floating-promise sample → `error typescript(no-floating-promises)` + `error typescript(require-await)`, **exit 1**. | Enumerate server-2's current typescript-eslint type-aware rules and confirm oxlint coverage for each (async ones confirmed). |
| Prod ships exactly 2 built entrypoints | **VERIFIED** | `docker-compose.prod.yml` migrate `command`, `docs/deployment.md`, `tsx` dev-only. | Confirm no other `node dist/...` invocation in infra/k8s manifests at plan time. |
| 100% V8 coverage is feasible/maintained at 185 files | medium | fetcher held 100%; server-2 currently runs `test:coverage` in `verify`. | Read server-2 vitest coverage config; confirm thresholds + exclusions before the migration, do not relax them. |
| oxfmt does not alter SQL semantics in `src/modules/statistics/repository/parity-sql.ts` (~273 LOC of SQL template literals; `repository.ts` is 1927 LOC but **imports** the SQL, does not embed it) | medium | Formatters don't reformat string/template-literal **interiors**; only code around them. | Cheap pilot: run oxfmt on a copy of `parity-sql.ts`, inspect the diff before repo-wide apply. |
| tsgolint 0.x is stable enough across pins | medium | spike ran on 81 files, no crash/panic, +160ms; 0.23.0 working in proof | Pin exactly; measure on 185 files; watch rule churn on version bumps. |

## Backend And Infrastructure Notes
| Topic | Decision/Default | Frontend Consequence | Hidden Cost | Breaking Point |
|-------|------------------|----------------------|-------------|----------------|
| Frozen OpenAPI contract | Any byte change to `openapi/server-2.openapi.json` fails CI (`openapi:verify` + oasdiff + `frozen-contract` test + `openapi-typescript` codegen). The refactor must **regenerate the spec in the same PR** as any change and run `contract-diff` locally first; oxfmt must **ignore** `openapi/**`. | `web`'s generated client stays byte-stable. | A per-PR gate the fetcher never had; every formatting PR must re-export + diff the contract. | A stray contract byte-diff blocks the whole pipeline. |
| Multi-entry build | tsdown `--entry src/server.ts --entry src/infra/db/migrate.ts`, deps externalized; ops/openapi scripts stay on tsx. | None (server, not UI). | migrate.js must resolve `dist/src/infra/db/migrations` at runtime — keep tsdown outDir structure or adjust Dockerfile `COPY`. | If the bundle flattens paths, the migration runner can't find SQL files. |
| Type-aware in CI/Docker | tsgolint platform binary (`@oxlint-tsgolint/linux-x64`) resolves on GH Actions + Docker (linux-x64); pin `oxlint-tsgolint` exactly. | None. | type-aware builds a full type graph → slower than non-type-aware lint; it is a CI gate so acceptable. | A platform without a published `@oxlint-tsgolint/<os>-<arch>` pkg would break the gate. |
| 5 ops gates in verify | Preserve `openapi:check`, `ops:boundary:check`, `ops:backup:check` + integration + coverage; weave them into the new `verify` chain unchanged. | None. | The new `verify` is longer than the fetcher's; CI time grows. | Dropping any ops gate silently regresses an invariant the contract-freeze milestone established. |

## Risks
| Risk | Severity | Why It Matters | Mitigation |
|------|----------|----------------|------------|
| Contract byte-drift during refactor | 🔴 high | Fails CI + breaks `web` client codegen | Regenerate spec in the same PR; `openapi:**` ignored by oxfmt; `contract-diff` local pre-check |
| oxfmt reformats SQL template literals (`parity-sql.ts`) | 🟠 medium | Could alter query output / contract data | Pilot oxfmt on a copy of `parity-sql.ts` first; ignore-glob if needed |
| tsgolint 0.x rule/API churn | 🟠 medium | A version bump could change findings and break the blocking gate | Exact pin; bump deliberately with a re-validation step |
| naming-convention rule lost in swap | 🟡 low | oxlint 1.69 has no equivalent (RULE-DELTA from fetcher) | Escalate to `solidstats-server-ts-code-review` skill checklist |
| type-aware speed at 185 files | 🟡 low | Slower CI | Measure; it is a gate, not inner-loop |
| One-shot migration collides tool + contract + ops changes | 🟠 medium | Hard-to-review diffs at scale | Phase-per-tool with full `verify`+`contract-diff` green at each boundary (no fetcher-style single pass) |

## Acceptance Criteria
- `pnpm verify` green from a clean checkout on the new surface: oxfmt → oxlint → **type-aware (blocking)** → tsc(typecheck) → unit → integration → coverage(100%) → tsdown(build) → depcruise → knip → openapi:check → ops:boundary:check → ops:backup:check.
- `oxlint --type-aware` is a **blocking** gate; a deliberately-introduced floating promise fails `verify`.
- ESLint + Prettier + `eslint-plugin-import-x` removed from the repo and lockfile.
- `dist/` produced by tsdown for both entrypoints; the Docker image boots `server.js` and the migrate service runs `migrate.js`.
- The generated OpenAPI contract is **byte-identical** before/after (or regenerated + contract-diff clean in the same PR); `frozen-contract` test green.
- lefthook hooks wire from the preset and fire (pre-commit/pre-push), bypassable with `--no-verify`.
- 100% V8 coverage maintained; the measured file set is not reduced; all 5 ops gates preserved.
- Behavior-preserving: no runtime behavior change.

## Verification Plan
- Per-phase: full `sg docker`-equivalent `pnpm verify` + `contract-diff` green at each boundary.
- oxlint type-aware: a planted floating-promise test proves the gate blocks; remove before commit.
- depcruise: planted-cycle proof (exit 1 on cycle, 0 after removal).
- oxfmt SQL: one-file pilot diff on `parity-sql.ts` (the SQL-template file) reviewed before repo-wide apply.
- Build: Docker smoke — image boots `server.js`; a migrate run executes `migrate.js` against a test DB.
- Contract: `openapi:check` + oasdiff + `openapi-typescript` codegen-diff = no breaking change.
- Coverage: vitest thresholds unchanged; `test:coverage` exit 0 at 100%.

## Open Questions
| Priority | Question | Why It Matters | Owner/Status |
|----------|----------|----------------|--------------|
| P1 | Exact type-aware rule set: which `strictTypeChecked` rules to enable as blocking vs warn for a Fastify service? | Too aggressive → noise; too lax → misses correctness | server-2 spec; start from the async-critical set proven here |
| P1 | Does any infra/k8s path invoke a third `node dist/...` entry (beyond server+migrate)? | Determines the tsdown entry list | Confirm at plan time from infra manifests |
| P2 | Preset coverage-threshold: overlay per-repo (100%) vs baked in preset? | server-2 must keep 100%; preset must not force a wrong threshold on a future repo | Decide in the v0.1.4 preset work |
| P2 | oxfmt `openapi/**` + generated-file ignores | Prevent contract/codegen churn | server-2 `.oxfmtignore`/config |

## Question Ledger
| Priority | Question | Answer | Decision Impact |
|----------|----------|--------|-----------------|
| P0 | Scope: server-2 + parser together or separate? | Both, **separate files** (this pack + the parser pack) | Two decision packs; tracks not merged |
| P0 | Preset: consume-as-is vs pre-harden for server? | **Pre-harden** → v0.1.4 before server-2 | Adds a preset pre-step (F4) |
| P0 | Output | `DEEP-BRAINSTORM.md` in each repo's `.planning/` | This artifact |
| P0 | Linter: oxfmt-only (keep eslint) vs full oxlint swap? | **Full oxlint swap now**, type-aware **blocking** | Was reframed twice: first "keep eslint (oxlint can't do async)" — **refuted**: type-aware CAN, and tsgolint installs clean (empirically proven), so async-gate moves to oxlint continuously |
| P0 | "tsgolint installed via a crutch — why?" | Fetcher used npm-in-tmpdir + manual `cp` based on an **unvalidated `[ASSUMED]`**; the package has no postinstall + platform-binary optionalDeps → normal `pnpm add -D` works | Unblocked F1; type-aware becomes a proper blocking gate |
| P0 | Build: tsc vs tsdown for a server? | **tsdown** (user wants common tooling), 2 entries verified from prod | F2 |
| P1 | Async-gate a hard continuous boundary? | **Yes** + "migrate now" | Forced F1 to a solution with no async-gate gap |

## Recommended Next GSD Step
- **Primary:** `/gsd-new-milestone` for **server-2 Track C** (e.g. v4.0), but **gated on the preset v0.1.4 pre-hardening** (F4) landing first. Roadmap the phases in the proven order with contract/ops-gate preservation woven in.
- **Rationale:** every P0 decision is closed and the two scale "blockers" were empirically refuted; the work is a known-shape convergence at 4.5× scale with three named server-specific complications, ready to spec.
- **Alternatives:** (a) `/gsd-spec-phase` directly if the milestone framing is already settled; (b) do the preset v0.1.4 milestone in the `ts-toolchain` repo first, then return here.
