# Pitfalls Research

**Domain:** Replay statistics backend and moderation API
**Researched:** 2026-05-09
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Trusting Weak Identity Signals

**What goes wrong:**
Players are merged or linked based on nickname similarity, stale SteamID assumptions, or incomplete old replay data.

**Why it happens:**
Identity logic is tempting to automate early because public stats look cleaner when duplicates disappear.

**How to avoid:**
Model canonical players, nickname history, SteamID history, source evidence, and moderated merge/split workflows from the start.

**Warning signs:**
Code paths update canonical identity without audit, request review, or evidence references.

**Phase to address:**
Phase 2 schema and Phase 6 moderation.

---

### Pitfall 2: Losing Parser Jobs Between DB and RabbitMQ

**What goes wrong:**
Replay records exist without parse jobs, queue messages exist without DB state, or failures cannot be retried.

**Why it happens:**
Implementations publish directly to RabbitMQ before durable job state or without outbox-style recovery.

**How to avoid:**
Create `parse_jobs` before publish, store state transitions, make consumers idempotent, and expose retry/reparse operations.

**Warning signs:**
There is no durable job ID, no completion/failure status, or no reconciliation command.

**Phase to address:**
Phase 3 ingest/parse lifecycle and Phase 7 operations.

---

### Pitfall 3: Aggregate Drift After Moderation

**What goes wrong:**
Manual corrections update one table but public player/squad/commander/bounty stats remain stale or inconsistent.

**Why it happens:**
Moderation is implemented as CRUD instead of an audited patch plus recalculation pipeline.

**How to avoid:**
Approved moderation actions must write audit/patch records and trigger deterministic aggregate recalculation.

**Warning signs:**
Approved request code does not call recalculation, or recalculation behavior is not tested with correction fixtures.

**Phase to address:**
Phase 5 stats and Phase 6 requests/moderation.

---

### Pitfall 4: OpenAPI Drift

**What goes wrong:**
`web` generates types from a schema that no longer matches live API payloads.

**Why it happens:**
OpenAPI is treated as docs instead of the route contract source.

**How to avoid:**
Generate OpenAPI from route schemas, keep schema export in CI, and require compatibility notes for breaking changes.

**Warning signs:**
DTO interfaces are hand-written in multiple apps or route responses lack schemas.

**Phase to address:**
Phase 1 API foundation and every later API phase.

---

### Pitfall 5: Silent Replay Duplicate Handling

**What goes wrong:**
Different source records with matching/near-matching evidence are silently merged or duplicated, corrupting stats.

**Why it happens:**
Deduplication starts as a simple checksum check and grows without conflict states.

**How to avoid:**
Deduplicate by checksum plus external source identity, preserve evidence, and route ambiguous cases to manual review.

**Warning signs:**
Promotion code uses `ON CONFLICT DO NOTHING` without recording why a replay was skipped.

**Phase to address:**
Phase 3 ingest/parse lifecycle.

---

### Pitfall 6: Treating Operations as Post-Launch Work

**What goes wrong:**
Stats are wrong or missing, but operators cannot tell whether the cause is ingest, parser, queue, storage, DB, or recalculation.

**Why it happens:**
Health checks and failure visibility are postponed until after "features" are done.

**How to avoid:**
Add health, metrics, structured logs, failure lists, retries, and backup/restore docs alongside job features.

**Warning signs:**
There is no way to list failed parse jobs, queue depth is invisible, or backup restore has never been documented.

**Phase to address:**
Phase 7 operations hardening, with early hooks in Phases 1 and 3.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single catch-all `metadata` JSON column for parser output | Fast initial persistence. | Hard to query, validate, recalculate, or migrate. | Only for raw source snapshots alongside normalized tables. |
| Manual DTOs for `web` | Quick frontend unblock. | Contract drift and duplicate maintenance. | Only temporary during a spike, not v1. |
| Unscoped admin endpoints | Faster admin API build. | Privilege bugs and accidental destructive operations. | Never for moderation/roles/jobs. |
| No status enum for staging/jobs/requests | Less schema design upfront. | Impossible to reason about lifecycle and retries. | Never for lifecycle entities. |
| Hardcoded bounty formula without tests/docs | Fast feature demo. | Disputes and regressions. | Formula may be hardcoded only if documented and covered by fixtures. |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `replays-fetcher` | Assuming staging rows are always clean and unique. | Preserve source identity/checksum/size evidence and conflict states. |
| `replay-parser-2` | Publishing unversioned messages. | Include `parser_contract_version` and validate result shape. |
| RabbitMQ | Acking messages before persistence completes. | Persist result/failure first, then ack. |
| S3-compatible storage | Assuming AWS-only behavior. | Test against MinIO locally and configure endpoint/path-style behavior explicitly. |
| Steam login | Treating Steam as generic OAuth without verification. | Validate actual Steam auth protocol and isolate it behind an adapter. |
| `web` | Changing payloads without schema update. | Generate OpenAPI from route schemas and include schema diff in breaking changes. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Recalculate all stats synchronously on every parser completion | Parser completion gets slow and locks tables. | Use scoped recalculation where possible and background jobs for larger recomputes. | Medium replay volume or bulk reparse. |
| Public list endpoints without pagination/search indexes | Slow player/squad pages. | Add pagination, search strategy, and query-plan driven indexes. | Thousands of players/squads/replays. |
| Storing huge parser payloads only as JSON | Hard filters and expensive recalculation. | Store raw snapshot plus normalized events required for audit/recalc. | First non-trivial stat query. |
| Queue consumers without backpressure | DB/storage overload during bulk parse. | Limit concurrency and monitor queue depth/job duration. | Bulk ingest or parser catch-up. |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Missing role checks on admin/moderation routes | Unauthorized moderation, role, or job changes. | Shared authorization hooks and route policy tests. |
| Public attachment access without controls | Evidence leaks or unbounded file exposure. | Use scoped object keys, metadata checks, and signed/download-controlled flows. |
| Trusting request entity references blindly | Users can submit corrections against invalid/private entities. | Validate referenced replay/player/squad/stat records. |
| Bootstrap admin left too broad or mutable by accident | Persistent privilege escalation. | Treat bootstrap admin as config-seeded and audit role changes. |
| Manual legacy winner edits without audit | Disputed commander stats and no recovery path. | Always write moderation action/comment/source. |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Request status is vague | Players cannot tell whether corrections were reviewed. | Expose clear pending/approved/rejected status and moderator comment. |
| Duplicate conflicts are invisible | Operators cannot explain missing or duplicated replays. | Admin conflict list with evidence and resolution state. |
| Public stats silently omit failed parses | Users distrust totals. | Surface freshness/processing state where useful and give admins failure visibility. |
| Manual winner fixes are indistinguishable from parser data | Community disputes outcomes. | Preserve source/audit metadata for manual changes. |

## "Looks Done But Isn't" Checklist

- [ ] **Steam login:** Verify callback/domain config and actual Steam protocol behavior, not just a local mocked login.
- [ ] **Roles:** Confirm moderator/admin endpoints reject regular logged-in users.
- [ ] **Parse jobs:** Confirm job survives API restart, worker restart, RabbitMQ redelivery, and parser failure.
- [ ] **Ingest conflicts:** Confirm ambiguous duplicates are visible and not silently skipped.
- [ ] **Stats recalculation:** Confirm approved correction changes aggregates deterministically.
- [ ] **Bounty formula:** Confirm teamkills award zero and previous-rotation effectiveness is used.
- [ ] **Commander outcomes:** Confirm unknown legacy winner is distinct from known loss/win.
- [ ] **OpenAPI:** Confirm generated schema includes all public/auth/request/moderation/admin/job endpoints.
- [ ] **Backups:** Confirm restore instructions exist, not just backup commands.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Bad identity merge | HIGH | Use audit/evidence to split canonical players, recalculate affected aggregates, document correction. |
| Lost parse jobs | MEDIUM | Reconcile `replays` without terminal `parse_jobs`, recreate jobs, publish retries, audit recovery. |
| Aggregate drift | MEDIUM | Re-run deterministic recalculation from parser output plus moderation patches. |
| OpenAPI drift | MEDIUM | Add route schemas, regenerate schema, update `web`, and add contract verification. |
| Missing backup restore docs | HIGH if incident occurs | Write and test restore procedure before production launch. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Weak identity signals | Phase 2, Phase 6 | Identity schema supports history/evidence; merge/split requires moderation audit. |
| Lost parser jobs | Phase 3 | Integration test covers job creation, publish, completion, failure, retry. |
| Aggregate drift | Phase 5, Phase 6 | Fixtures prove recalculation after parser completion and approved correction. |
| OpenAPI drift | Phase 1 onward | Schema generation exists and route responses are represented. |
| Silent duplicates | Phase 3 | Duplicate/conflict tests prove ambiguous cases enter review state. |
| Missing operations | Phase 7 | Health/metrics/failure/retry/backup checks pass. |

## Sources

- `gsd-briefs/server-2.md` - domain requirements and explicit failure-sensitive areas.
- `.planning/PROJECT.md` - constraints and project boundaries.
- Official stack sources listed in `.planning/research/STACK.md`.

---
*Pitfalls research for: replay statistics backend and moderation API*
*Researched: 2026-05-09*
