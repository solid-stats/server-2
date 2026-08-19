<!-- BEGIN managed by solid-stats/agent-instructions -->
<!-- markdownlint-disable MD013 MD041 -->
<!-- Managed by solid-stats/agent-instructions. Do not hand-edit in a consumer repo — changes
     are overwritten by the next sync PR. Edit the source at
     https://github.com/solid-stats/agent-instructions/blob/master/shared/AGENTS.md instead. -->

## Skills First

Before acting on any user request in this repository, scan available skills by name and description. If any skill has even a small chance of helping any part of the task, use it and read only the relevant instructions before proceeding.

When in doubt, prefer enabling the skill briefly and filtering it out over skipping it.

## Session Hygiene

Every completed work session must leave the repository in a clean, committed state:

- Run `git status --short` at the end of every session. If there are uncommitted changes from
  the work just done, commit them before stopping.
- Do **not** delete or revert completed work to fake a clean status. If the intended work is
  incomplete, ask what to do rather than silently discarding it.
- The rule is: *commit the intended results of the session, not a reset to the previous state.*

## Git Conventions

All commits in every SolidStats repo follow **Conventional Commits**:

```text
<type>(<scope>): <short description>
```

Common types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`.
Scope: the phase number, feature area, or affected layer (e.g. `feat(17-03): …`,
`fix(ingest): …`, `docs(planning): …`).

**Commit and push are standing, default behavior in every `solid-stats` repo** — no per-message
authorization needed. Session Hygiene above already expects every completed session to end
committed; treat commit + push as part of finishing the work, not a separate ask. This does
**not** extend to anything destructive:

**Absolute rules:**

- `git reset --hard`, force push, `branch -D`, and `rebase` still require an explicit
  instruction from the user in the current message every time — authorization from a previous
  message does not carry forward, and the standing commit/push permission above does not imply
  it.
- Never skip hooks with `--no-verify` or `--no-gpg-sign` unless explicitly asked to. If a
  pre-commit hook fails, fix the underlying issue — the hook is the signal, not the obstacle.
- When a pre-commit hook fails, the commit did not happen. Create a new commit after fixing;
  do not amend the previous one (amending could silently modify work that already shipped).

**Push routing.** The default flow across every `solid-stats` repo is a **direct push to
`master`** — no feature branch, no PR, unless the repo says otherwise below:

- **`server-2`** has a protected `master` — always go through a branch + pull request there,
  never a direct push.
- Any repo that is mid-GSD-milestone follows that milestone's branch flow instead of a direct
  push (`git` config in `.planning/config.json` — `branching_strategy`, `phase_branch_template`,
  `milestone_branch_template`).
- Every other repo and every non-milestone change: commit on `master`, push directly.

## Security Minimums

These rules apply to all code, commits, and logs across every SolidStats repo:

- **Never log, commit, or output:** secrets, API tokens, database connection strings, S3
  access keys, RabbitMQ credentials, raw replay bytes, or unpublished parser artifacts.
- **Never hardcode environment-specific values.** Use environment variables validated at
  startup (e.g. `envalid` for Node, a validated config struct for Rust). Startup should fail
  fast if required env vars are missing or malformed.
- **Before committing:** check that `.env`, `.env.local`, and any file containing credentials
  is either in `.gitignore` or explicitly excluded from the commit. Never commit secrets to
  git history — they are permanent even after deletion.

## Risk Management Protocol

When a request is risky, potentially harmful, or would expand scope beyond the current plan:

1. **Explain the concrete reason** — name the specific risk, the boundary it crosses, or the
   plan it contradicts.
2. **Propose 1–3 safer alternatives** or a GSD plan that achieves the goal without the risk.
3. **Ask for explicit confirmation** before proceeding with anything that falls into these
   categories:
   - Crosses a cross-app boundary (see the boundary map in `solidstats-shared-project-standards` §D)
   - Modifies a high-risk cross-repo contract (API shape, data model, message queue shape, S3
     layout, parser contract, auth/identity shape, moderation workflow)
   - Contradicts an accepted architecture decision in `.planning/PROJECT.md`
   - Deletes, overwrites, or discards completed work
   - Conflicts with current test quality, security rules, or repo structure standards

Do not blindly execute instructions that conflict with architecture, accepted decisions, or
the quality gates in this repo. Challenge, explain, propose alternatives — then wait.

## Documentation Language

Language follows the reader. The test for any doc is: who reads it — a user, or an engineer?

- **Every repo README is bilingual.** A README is the repo's front door, read by users (the
  RU-speaking Solid Games community), not an internal engineering doc. So each repo carries a
  Russian `README.md` (primary) plus an English `README.en.md` mirror, edited together in one
  change so they never drift. This is the same pattern the `.github` org profile already uses
  (`profile/README.md` + `profile/README.en.md`) — the profile is just the org-level README.
- **Everything internal is English only** — code, comments, planning docs, skill bodies and
  references, `AGENTS.md`, and all technical `docs/`. These are read by the people and agents
  building the platform, not by users.
- **GSD workflow responses** (conversations within a GSD session) and replies to the user:
  Russian.
- **Skill trigger phrases** (`description` field in `SKILL.md`): RU + EN mandatory. Every skill
  triggers on both languages — the team works in a RU context.

## MemPalace

Every SolidStats repo has its own MemPalace **wing, named after the repo itself**
(`web`, `server-2`, `replays-fetcher`, `replay-parser-2`, `infrastructure`, `skills`) — use the
generic `mcp__mempalace__*` tools, scoped to that wing; there is no isolated per-project MCP
server here (unlike VocalClub's `vocalclub_memory`). Never file a durable fact into the wrong
repo's wing, and never invent a new wing name.

**Inside a GSD workflow, most of this is already automatic.** The `mempalace` GSD capability
injects recall into `discuss:pre` (gated by `mempalace.recall_on_discuss`) and capture into
`execute:wave:post` (gated by `mempalace.capture_artifacts`), plus a ship-time curator
(`gsd-mempalace-curator`) — see `gsd/common-config.json` for the shared defaults and each
repo's `.planning/config.json` for the rest. Don't re-implement that cycle by hand inside a GSD
phase; the sections below are for everything GSD's own injection doesn't cover — ad-hoc
diagnosis, a non-GSD session, or manual recall/capture outside a phase boundary.

- **Recall before diagnosing or building**, not just when a hook happens to inject a snippet.
  Run an explicit `mempalace_search` seeded from the task's real identifiers (symptom, service
  name, ticket) at the start of the session — a pattern-match to "we just touched this" is not
  recall, and a miss is not proof of absence (follow up with `mempalace_list_drawers` /
  `mempalace_kg_query` before concluding nothing is stored).
- **Capture only durable, verified conclusions** at closure — a decision, a root cause, a
  resolved gotcha — not raw session transcripts, planning artifacts, or GSD's own
  `CONTEXT.md`/`PLAN.md`/`SUMMARY.md` files. Dedup with `mempalace_check_duplicate` before
  filing.
- **`memory_mode` stays `augment`** (GSD's own default): the palace is an additional layer,
  never a replacement for `.planning/graphs/` or `STATE.md`. **Never enable
  `mempalace.recall_on_plan`** — the planner doesn't automatically consume that separate
  recall artifact, so it just produces an orphaned memory read; the top-level coordinator's one
  scoped recall (at `discuss:pre`, or manually for entry points with no native recall hook —
  `gsd-quick`, `gsd-fast`, `gsd-debug`) is the single recall point per task. Specialists and
  subagents don't independently recall or capture — they get a filtered context handoff from
  whichever level already recalled.

### Cross-repo tunnels — use them, don't just avoid duplicating

SolidStats is a genuinely multi-repo platform (§D/§E) — a decision at a cross-app boundary or
contract change routinely concerns two wings at once, unlike VC's setup, which leaves
`cross_project_tunnels` off. Here it should be **on and actually used**, not just a
de-duplication fallback:

- **Create a tunnel** (`mempalace_create_tunnel`) whenever a captured fact genuinely concerns
  two repos — an API/data-model/queue/S3-layout/parser-contract decision (§E's high-risk list)
  almost always does. File the fact once, in the wing of the repo that owns the decision, then
  tunnel it to the other wing(s) it affects instead of duplicating the drawer.
- **Query tunnels during recall, not just search.** A wing-scoped `mempalace_search` alone can
  miss a relevant fact filed under an adjacent repo's wing. Before or alongside recall on a
  cross-app task, run `mempalace_find_tunnels` (between the two wings in play) or
  `mempalace_follow_tunnels` (from the current wing) to surface what's already linked.
- **`mempalace.mirror_kg`** (per-repo, stays local — see below) governs whether decision facts
  also mirror into the temporal knowledge graph; tunnels connect *drawers*, `mempalace_kg_add`
  connects *typed facts* — use whichever fits what's actually being captured, and both where a
  cross-repo decision has both a narrative and a queryable shape (e.g. a validity window).
- **`mempalace.enabled` and `mempalace.cross_project_tunnels`** are common defaults in
  `agent-instructions`' `gsd/common-config.json` — the latter is a deliberate override of
  gsd-core's own default (`false`), because a single-service default doesn't fit a genuinely
  multi-repo platform. The richer per-repo flags (`capture_artifacts`, `mirror_kg`,
  `auto_capture_hooks`) are tuned per repo and stay local — a backend service and a frontend
  repo do not need identical capture behavior.

## MCP / Documentation Lookup

SolidStats development verifies library APIs against **current documentation, never training
data** — training data has a cutoff and may reflect outdated or incorrect APIs. Look the docs
up proactively; don't wait for a type error.

- **Free official sources only:** WebFetch/WebSearch against the library's official docs and
  its `llms.txt`; the repo's `README`/`docs/` via `gh`; GitHub issues/PRs for bug reports and
  migrations. **Do NOT use Context7 or any paid documentation MCP.**
- **Common lookup triggers:** adding a dependency, upgrading a package, using a method you're
  not 100% sure about, hitting an unexpected type error, writing a new integration.
- **When NOT to look it up:** SolidStats-specific code/business logic; a library already
  looked up this session with an unchanged answer; stable standard-library APIs.

Per-repo key libraries to verify against current docs live in each repo's own
`solidstats-*-conventions` skill, not here.
<!-- END managed by solid-stats/agent-instructions -->
﻿# server-2 — SolidStats backend (platform service)

`server-2` is the TypeScript/Fastify backend and source of truth for Solid Stats: it owns
PostgreSQL business state, the HTTP API, canonical player identity, Steam auth, moderation,
RabbitMQ parser-job orchestration, and aggregate/bounty calculation.

**Boundary (own / must NOT cross):** owns canonical business state, the HTTP/OpenAPI contract,
RabbitMQ orchestration, and auth. Must NOT parse OCAP replay content (that is `replay-parser-2`)
or crawl/fetch external replay sources (that is `replays-fetcher`); the fetcher must not write
business tables directly — `server-2` promotes its staging/outbox records. See the cross-app
boundary map (§D) in `solidstats-shared-project-standards`.

**Shared standards:** cross-repo rules (skills-first, git, security, docs language, MCP lookup)
live in `solid-stats/agent-instructions`, imported below. Stack-specific skills live in the
`solid-stats/skills` repo (start with `solidstats-shared-project-standards`). This file adds
only `server-2`-specific guidance below.

---

# AGENTS instructions

## Project

`server-2` is the TypeScript backend source of truth for Solid Stats. It owns PostgreSQL business state, typed APIs, canonical identity, auth, moderation, parser job orchestration, aggregate/bounty calculation, and operational visibility.

Solid Stats is a multi-project product composed of:

- `replays-fetcher` - replay discovery, raw S3 object storage, source metadata, ingestion staging/outbox records.
- `replay-parser-2` - deterministic OCAP JSON parsing, parser contract, CLI/worker, parity harness.
- `server-2` - PostgreSQL source of truth, APIs, canonical identity, auth, moderation, parse jobs, aggregate/bounty calculation.
- `web` - browser UI, public stats, authenticated request UX, moderator/admin screens, API consumption.

Read these planning files before planning or implementing:

- `.planning/PROJECT.md`
- `.planning/MILESTONES.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/research/SUMMARY.md`

## Critical Context

- `server-2` promotes `replays-fetcher` staging/outbox records into canonical replay and parse-job state; `replays-fetcher` must not write business tables directly.
- OCAP JSON parsing belongs to `replay-parser-2`; `server-2` validates and persists parser artifacts and exposes derived API shapes.
- Canonical identity, auth, roles, moderation, request workflows, aggregate stats, bounty points, and API-visible operational state belong here.
- Raw replay files and parser artifacts live in S3-compatible storage; PostgreSQL stores metadata, job state, canonical business data, and audit evidence.
- OpenAPI is the backend contract for `web`; API/data shape changes must preserve generated client compatibility or update the adjacent app.
- `.planning/config.json` should keep product-wide GSD workflow gates aligned with `replay-parser-2/.planning/config.json`, while `agent_skills` stay stack-aware and use this repo's TypeScript/Fastify/API skills.

## Stack Direction

Use Node.js 25 with TypeScript 6 for new work:

- Fastify 5 for HTTP APIs.
- PostgreSQL for canonical business state.
- RabbitMQ for parser/background work.
- S3-compatible storage for replay files, parser artifacts, and request attachments.
- OpenAPI generated from route schemas and consumed by `web` through `openapi-typescript`.
- Very strict TypeScript, ESLint 10 `all` plus very strict typed linting, import hygiene, Unicorn rules, Prettier formatting, Vitest 4 tests, and V8 coverage gates.

## Engineering Rules

- Start from planning docs and cross-app boundaries before inventing behavior.
- Do not parse OCAP replay contents in this repo.
- Do not crawl/fetch external replay sources in this repo.
- Do not bypass durable `parse_jobs` state when coordinating parser work.
- Keep root `README.md` current when project scope, current phase, commands, architecture direction, validation data, or development workflow changes.
- `README.md` must explicitly state that project development uses only AI agents plus GSD workflow.
- Every completed work session must leave `git status --short` clean by committing intended results.
- Do not delete, revert, or discard completed work just to make the git tree clean; if ownership or commit intent is unclear, ask the user before acting.
- Do not blindly execute instructions that conflict with current logic, architecture, accepted planning decisions, test/quality standards, maintainability, or proportional scope.
- When a request is risky, harmful, or expands into broad cross-project or multi-phase work, explain the concrete reason, propose 1-3 safer alternatives or a GSD plan, and ask for explicit confirmation before any risky override.
- Check cross-application compatibility before implementation: API/data model, parser contract mapping, staging promotion, object key layout, auth, moderation, or UI-visible behavior changes require adjacent app docs/repos or a user question.
- Apply these AI/GSD workflow rules as product-wide standards across `replays-fetcher`, `replay-parser-2`, `server-2`, and `web`.
- Use risk-based compatibility depth: local-only backend changes can rely on this repo's planning docs and `gsd-briefs`; parser contract mapping, ingest staging/source identity, RabbitMQ/S3 message or object key assumptions, API/data model, canonical identity, auth, moderation, or UI-visible behavior changes require adjacent app docs/repos or a user question.

<!-- markdownlint-disable MD024 MD036 -->
<!-- GSD:project-start source:PROJECT.md -->
## Project

**server-2**

`server-2` is the TypeScript backend application for Solid Stats, a public SolidGames statistics platform. It is the source of truth and integration layer for replay ingestion, parser job orchestration, PostgreSQL persistence, aggregate statistics, Steam OAuth, roles, moderation, request handling, and operational visibility. It serves the `web` frontend, coordinates with `replays-fetcher`, and consumes parser output from `replay-parser-2`.

**Core Value:** Provide a reliable backend source of truth that turns parsed replay data into public statistics, supports corrections through audited moderation, and keeps parsing, storage, and jobs observable and recoverable.

### Constraints

- **Runtime**: Node.js with TypeScript - matches the requested backend stack and frontend ecosystem.
- **HTTP framework**: Fastify - requested stack for a typed, performant API service.
- **Database**: PostgreSQL - primary source of truth for canonical entities, jobs, stats, requests, audit, and operations state.
- **Queue**: RabbitMQ - parser jobs and background work must be durable and observable.
- **Storage**: S3-compatible object storage - replay files and request attachments must not live in PostgreSQL.
- **Authentication**: Steam OAuth - the product identity anchor for authenticated users and player profile linking.
- **API contract**: OpenAPI 3.x - `web` generates request/response types with `openapi-typescript`.
- **Deployment v1**: Docker Compose on one VPS - production Kubernetes deployment is out of v1 scope.
- **Local development**: Docker Compose - API dependencies must run locally.
- **Parser boundary**: OCAP JSON parsing stays in `replay-parser-2` - `server-2` stores and orchestrates parser output.
- **Ingest boundary**: crawling/raw discovery stays in `replays-fetcher` - `server-2` promotes staging evidence and owns canonical replay lifecycle.
- **Historical data**: `~/sg_stats` is reference/golden data only in v1 - not a full production import requirement.
- **Reprocessing**: v1 may overwrite derived parse results - moderation audit patches still must be preserved.
- **Security**: public stats are anonymous, but requests require login and moderation/admin APIs require roles.
- **Operations**: failed jobs, health, metrics, backups, and recovery flows are required for trust in derived stats.
<!-- GSD:project-end -->
<!-- markdownlint-enable MD024 MD036 -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
| ------------ | --------- | --------- | ----------------- |
| Node.js | 25.x | Runtime | Current starting baseline for new work; keep all TS repos on the same toolchain line. |
| TypeScript | 6.x | Application language | Required by the brief and keeps API/data contracts explicit with current compiler behavior. |
| Fastify | 5.x | HTTP framework | Required by the brief; good fit for schema-first validation, OpenAPI generation, and high-throughput APIs. |
| PostgreSQL | 18.x target, 17.x acceptable if hosting requires it | Primary data store | Required source of truth for canonical identity, replay metadata, jobs, stats, requests, roles, and audit. |
| RabbitMQ | 4.x | Parser/background queue | Required durable queue for parse jobs and retryable background work. |
| S3-compatible storage | Provider-specific | Replay files and attachments | Keeps large binary/object data outside PostgreSQL and supports MinIO locally. |
| Docker Compose | Current plugin | Local and v1 production orchestration | Required for local dependencies and single-VPS production deployment. |
| OpenAPI | 3.0 or 3.1 | API contract | Required source of truth for `web` TypeScript generation via `openapi-typescript`. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
| --------- | --------- | --------- | ------------- |
| `@fastify/swagger` | 9.x+ for Fastify 5 | OpenAPI schema generation | Register route schemas once and publish OpenAPI from the running API contract. |
| `@fastify/swagger-ui` | 5.x | Local/admin API docs | Useful for developer inspection; generated schema remains the contract for `web`. |
| `openapi-typescript` | Current 7.x/8.x line | Frontend type generation | Used by `web` to generate request/response types from `server-2` OpenAPI. |
| `pg` | Current 8.x line | PostgreSQL driver | Base driver for migrations/query builders/transactions. |
| Kysely or Drizzle | Current stable | Type-safe SQL access | Prefer explicit SQL-shaped access over opaque ORM behavior for aggregate/stat workloads. |
| `amqplib` or a maintained RabbitMQ client wrapper | Current stable | RabbitMQ publishing/consuming | Use for durable parse job requests, completion/failure consumers, and retry workers. |
| `@aws-sdk/client-s3` | Current v3 | S3-compatible storage | Required for replay objects, attachments, and local MinIO compatibility. |
| `prom-client` | Current stable | Prometheus metrics | Track queue depth, job results, parser failures, and API/DB health. |
| `pino` | Fastify default-compatible | Structured logging | Keep parser/job errors searchable and correlated by `job_id`/`replay_id`. |

### Development Tools

| Tool | Purpose | Notes |
| ------ | --------- | ------- |
| `tsx` | Run TypeScript in development | Good for local API/dev worker processes. |
| `vitest` | Unit/integration tests | Useful for formula, stats, identity merge/split, API contract tests, and 100% reachable-source V8 coverage gates. |
| `testcontainers` or Docker Compose test services | Integration testing | Use for PostgreSQL/RabbitMQ/S3 flows where mocks would hide contract failures. |
| `eslint`/`prettier` | Lint/format | Use ESLint 10 `all`, very strict typed linting, import hygiene, Unicorn rules, and Prettier 3 formatting; enforce all in verification. |
| OpenAPI schema validation in CI | Contract drift detection | Fail when public API changes without schema updates. |

## Installation

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
| ------------- | ------------- | ------------------------- |
| Fastify | NestJS | Use Nest only if the team wants framework-level dependency injection/modules more than direct Fastify control. |
| Kysely/Drizzle | Prisma | Prisma can work, but explicit SQL/query-builder control is safer for complex aggregate/stat and migration-heavy schemas. |
| RabbitMQ | BullMQ/Redis | Redis queues are simpler, but RabbitMQ is already required and better matches parser job routing/ack semantics. |
| OpenAPI + generated frontend types | Hand-written DTO mirrors | Hand-written mirrors drift; use only for isolated internal tests. |
| S3 object storage | Database bytea/blob storage | Database blobs simplify deployment briefly but hurt backup, restore, and replay file lifecycle. |

## What NOT to Use

| Avoid | Why | Use Instead |
| ------- | ----- | ------------- |
| Storing replay files in PostgreSQL | Bloats backups and makes object lifecycle painful. | S3-compatible object storage with DB metadata. |
| Fire-and-forget parser messages without `parse_jobs` rows | Lost jobs and unexplainable parser gaps. | Durable job table plus RabbitMQ publish/consume state. |
| Hand-maintained frontend DTOs | They drift from backend behavior. | OpenAPI generated from route schemas and consumed by `openapi-typescript`. |
| Auth/role checks only in route handlers | Easy to miss endpoints as API grows. | Shared auth/authorization pre-handlers plus route-level policy tests. |
| Generic OAuth assumptions for Steam | Steam sign-in historically differs from standard OAuth/OIDC expectations. | Verify Steam provider protocol during auth phase and wrap it behind a narrow auth adapter. |

## Stack Patterns by Variant

- Use the same S3 client path for local and production.
- Keep bucket/key conventions explicit: `raw/`, `attachments/`, and future processed artifacts.
- Keep provider config isolated behind endpoint/region/credentials settings.
- Include backup/restore docs for both PostgreSQL and object storage.
- Prefer explicit SQL views/materialized tables and tested recalculation jobs.
- Avoid hiding stat logic behind an ORM abstraction that obscures generated SQL.

## Version Compatibility

| Package A | Compatible With | Notes |
| ----------- | ----------------- | ------- |
| Fastify 5.x | Node.js 20+; Node.js 25 target | Fastify v5 requires modern Node; this repo standardizes on Node 25 for new work. |
| `@fastify/swagger` 9.x+ | Fastify 5.x | Use Fastify schemas as the OpenAPI source. |
| PostgreSQL 18.x | Current official PostgreSQL major | Use 17.x only if deployment/provider support lags. |
| RabbitMQ 4.x | Current supported RabbitMQ series | Confirm exact patch in Docker image before pinning. |

## Sources

- <https://nodejs.org/en/about/releases/> - Node.js production guidance and release schedule.
- <https://github.com/nodejs/release> - Node.js release schedule.
- <https://github.com/fastify/fastify> - Fastify v5 release state.
- <https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/> - Fastify v5 Node support and migration notes.
- <https://github.com/fastify/fastify-swagger> - `@fastify/swagger` OpenAPI support and Fastify compatibility.
- <https://www.postgresql.org/> - PostgreSQL current release information.
- <https://www.rabbitmq.com/release-information> - RabbitMQ release/support information.
- <https://github.com/openapi-ts> - `openapi-typescript` project.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

| Skill | When to Invoke |
| ------- | ---------------- |
| `solidstats-server-ts-conventions` | Любой роут, плагин, хук, zod-схема, конфиг клиента БД/очереди/S3, дизайн эндпоинта — архитектура и конвенции server-2 (TS/Fastify; 4 слоя, fastify-type-provider-zod, Kysely, getDecorator DI, depcruise-границы). |
| `solidstats-server-ts-code-review` | Педантичное код-ревью server-2; zod API-contract gate + risk-ordered sweep; ruleset — server-ts-conventions + shared-backend-ts-standards, формат — shared-review-standards. |
| `solidstats-server-ts-tests` | Написание или ревью backend-тестов (unit-инъекция в фабрику + route-интеграция через `app.setDecorator`/`app.inject`, testcontainers) поверх shared-testing-standards. |
| `solidstats-shared-backend-ts-standards` | Стек-нейтральные правила TS-сервисов (нейминг/фабрики, база типизированных ошибок, енумы, конфиг-дисциплина, async, §Z/§AA/§AB) — читается server-ts-conventions, не вызывается напрямую. |
| `solidstats-shared-ts-standards` | TS/Node baseline (tsconfig, code style, ESLint 10, Node 25/pnpm 11, Vitest, утилиты, lint-suppression policy) — читается conventions, не вызывается напрямую. |
| `solidstats-shared-review-standards` | Общий фундамент формата код-ревью (severity-бакеты, формат отчёта, правила вердикта); подключается code-review skills, не используется самостоятельно. |
| `solidstats-shared-testing-standards` | Общая философия тестов (AAA, изоляция, детерминизм, test doubles, размещение файлов); подключается per-stack test skills. |
| `solidstats-shared-project-standards` | Универсальный baseline всех репо (GSD-обязательства, гигиена сессии, git-конвенции, cross-app границы, безопасность); авто-триггерится на каждой задаче. |
| `openapi-to-typescript` | Генерация или обновление OpenAPI схемы; синхронизация типов с клиентом `web`. |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
