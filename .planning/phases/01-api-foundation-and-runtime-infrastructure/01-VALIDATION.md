---
phase: 01
slug: api-foundation-and-runtime-infrastructure
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-09
---

# Phase 01 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test && npm run test:integration && npm run openapi:check` |
| **Estimated runtime** | ~120 seconds after dependencies are installed |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test && npm run openapi:check`
- **Before `$gsd-verify-work`:** Run `npm test && npm run test:integration && npm run openapi:check`
- **Max feedback latency:** 180 seconds for unit/contract checks; integration checks may take longer when Docker images are first pulled

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01-01 | 1 | INFRA-01 | T-01-01 | TypeScript strict mode rejects invalid app wiring before runtime | unit/typecheck | `npm test && npm run typecheck` | No - Wave 1 creates scaffold | pending |
| 01-02-01 | 01-02 | 1 | INFRA-01 | T-01-02 | Typed env parsing avoids secret leakage and rejects missing required values | unit | `npm test -- src/config` | No - Wave 1 creates config tests | pending |
| 01-03-01 | 01-03 | 2 | INFRA-02, INFRA-03 | T-01-03 | Dependency health checks expose status without logging credentials or object contents | integration | `docker compose up -d postgres rabbitmq minio && npm run test:integration` | No - Wave 2 creates adapters/tests | pending |
| 01-04-01 | 01-04 | 2 | API-01, API-02 | T-01-04 | OpenAPI output is generated from route schemas and accepted by `openapi-typescript` | contract | `npm run openapi:export && npm run openapi:check` | No - Wave 2 creates OpenAPI scripts/tests | pending |

---

## Wave 0 Requirements

- [ ] `package.json` - npm scripts, ESM type, Node 24 engine, dependency pins.
- [ ] `tsconfig.json` - strict TypeScript config.
- [ ] `vitest.config.ts` - Vitest config for unit and integration tests.
- [ ] `src/app.ts` and `src/server.ts` - Fastify app factory and startup path.
- [ ] `docker-compose.yml` - PostgreSQL, RabbitMQ, and MinIO services.
- [ ] `.env.example` - Compose-aligned local environment values.
- [ ] `openapi/` output path or generated artifact path.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Node 24 runtime active outside Docker | INFRA-01 | Current shell has Node 22 active; local version managers vary by developer machine | Run `node --version` and confirm `v24.x` before claiming host-runtime verification. If host Node is unavailable, document Docker-based fallback. |

---

## Validation Sign-Off

- [x] All tasks have automated verification or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency target recorded.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-05-09
