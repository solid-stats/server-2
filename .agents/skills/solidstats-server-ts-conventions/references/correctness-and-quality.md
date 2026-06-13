# Correctness & quality — server-2 specifics

The server-2-specific design, correctness, security, and quality rules. The stack-neutral rules
that used to live in this file moved to `solidstats-shared-backend-ts-standards` →
`references/correctness-and-quality.md` — the forwarding table below gives every old section its
new home, so stale citations resolve. These are **conventions** (what good code does). The
`solidstats-server-ts-code-review` skill turns each into a hunt with an evidence gate and a
severity; the severity each maps to is noted in brackets so the skills agree.

## Moved to solidstats-shared-backend-ts-standards

These sections used to live in this file. They now live in the standards layer and are cited as
`[std: …]`; do not restate them here.

| Old section (this file) | New home |
|-------------------------|----------|
| External HTTP adapters | [std: correctness → External adapters] — server-2 stub below (502 mapping) |
| Async safety | [std: correctness → Async safety] |
| Contract compliance (LSP) | [std: correctness → Contract compliance (LSP)] |
| SOLID — function/factory level | [std: correctness → SOLID — function/factory level] |
| DRY — rule of three | [std: correctness → DRY — rule of three] |
| Utility & type libraries | [std: correctness → Utility & type libraries] |
| §Z. Observability — log hygiene | [std: correctness §Z] — server-2 metrics/health surface below |
| §AA. Log diagnosability | [std: correctness §AA] |
| §AB. Resource lifecycle — unbounded growth | [std: correctness §AB] |
| Code-quality bugs | [std: correctness → Code-quality bugs] |
| Comments & docs | [std: correctness → Comments & docs] |
| Imports & lint | [std: correctness → Imports & lint] |

---

## External HTTP adapters — server-2 stub

The adapter rules — singleton client, the connection-failure vs upstream-non-2xx error taxonomy,
explicit client configuration — live in [std: correctness → External adapters]. server-2 adds
only the transport mapping: a connection/network failure raises a domain-style `AppError` (e.g.
`UpstreamUnreachable`) and an upstream non-2xx raises `ExternalServiceError` — both map to HTTP
**502** at the central `setErrorHandler` (see `schemas-and-data.md` → Error system).

---

## Security depth

- **IDOR — ownership/permission check.** Any endpoint that takes an entity id and reads or modifies
  that entity must have a visible ownership or role/permission check somewhere in the
  controller → usecase → service chain. Missing check is the single worst defect here. [🔴 BLOCK]
  ```ts
  if (appeal.ownerSteamId64 !== req.user.steamId64) throw new errors.AccessDenied({ id });
  ```
- **Mass assignment.** `XCreate` / `XUpdate` schemas must not accept server-assigned fields —
  the owner's `steamId64`, `role`, `isAdmin`, `isActive`, or a status only the server may set. A
  privileged field in a request body schema is a finding. [🟠]
- Authorization is enforced **server-side**, never assumed from the client.
- No hardcoded secrets (see `schemas-and-data.md` → Config); secrets never logged.

---

## Security & runtime hardening

A backend owning Steam OAuth, moderation, and money-like bounty data needs HTTP/process hardening
beyond input validation:

- **Rate limiting** — `@fastify/rate-limit`: a global baseline plus stricter limits on auth/login and
  bounty/moderation mutation routes (OWASP API4/API2 — brute-force + resource exhaustion). [🔴 on
  auth/mutation routes, else 🟠]
- **Security headers + CORS** — `@fastify/helmet` (HSTS/CSP/frame options) and an explicit
  `@fastify/cors` **allow-list** (the `web` origin only; credentials handled deliberately). Permissive
  CORS on a credentialed API is an account-takeover vector. [🔴]
- **Body/payload limits** — set `bodyLimit` globally and per-route (uploads); a schema `maxLength`
  doesn't stop a multi-MB body from being parsed first. [🟠]
- **Graceful shutdown** — the principle (drain in-flight work, close resources, forced-exit
  timeout) is [std: correctness → Process lifecycle & construction]; the Fastify mechanism: on
  `SIGTERM`/`SIGINT`, `await app.close()` to drain in-flight requests and close DB/queue/consumers,
  with a forced-exit timeout; consider `@fastify/under-pressure` for 503 on overload. Per-resource
  `onClose` alone doesn't drain HTTP. [🟠]
- **Auth & session** — verify the Steam OAuth `state` (CSRF) on callback; session cookies are
  `HttpOnly` + `Secure` + `SameSite`; sessions expire/rotate; cookie-auth mutations carry CSRF
  protection. [🟠]
- **Secrets in responses** — never in error `details`/responses, logs, or OpenAPI examples; env-only
  and rotatable. [🔵]

## Queue reliability

The durable `parse_jobs` claim (SKILL §A) requires consumer discipline:

- **Manual ack** (no auto-ack) so a crash mid-process redelivers rather than loses the job —
  auto-ack is officially "unsafe" and removes backpressure. [🟠]
- **Per-consumer prefetch, explicitly set** — bound in-flight work with `channel.prefetch(n)`
  applied **per consumer**; global (per-channel) prefetch is deprecated in RabbitMQ 4.0 and a hard
  channel error on quorum queues. Default to the 100–300 range unless the workload says otherwise
  (`1` is safe but slow; `0` — no cap — is dangerous). [🟠]
- **Dead-letter + poison cap — a DLX is effectively mandatory on quorum queues.** Quorum queues
  default to a delivery limit of 20 since RabbitMQ 4.0: without a DLX, a message that always fails
  is **silently dropped** after 20 attempts. Route poison messages to a DLQ instead of requeuing
  forever — or losing them invisibly. [🟠]
- **`nack(requeue)` vs `reject(no-requeue)` are codified, not interchangeable.**
  `channel.nack(msg, false, true)` (requeue) does **not** increment the delivery count — use it
  for transient conditions (shutdown, temporary resource pressure). `channel.reject(msg, false)`
  **does** increment it — use it for failures that should count toward the delivery limit and
  eventually dead-letter. [🟠]
- **Consumers are idempotent** — redelivery is guaranteed possible, and the `redelivered` flag is
  a hint, not proof of prior processing; a handler must tolerate processing the same message
  twice. [🟠]
- **Idempotent writes** — money-like / duplicate-sensitive mutations (bounty grants, moderation
  actions) accept an `Idempotency-Key` (or dedupe on a natural key) so a client retry can't
  double-apply. [🟠]

## Schema quality

- Request-body strings/arrays without `.max(n)`, or bounded-domain numbers without `.min()`/`.max()`,
  are findings (DoS surface). [🟡]
- Business rules belong in the service as typed errors, not jammed into zod refinements (see
  `schemas-and-data.md`). [🟡]

---

## Observability surface — server-2

Log hygiene and diagnosability are [std: correctness §Z/§AA]; [std: correctness §Z] delegates the
operational metrics/health surface to the per-stack skill. For server-2:

- Expose `prom-client` metrics for the operational surface: queue depth, job results, parser
  failures, API/DB health; plus `/health` (+ detailed checks).
- The logging boundary [std: correctness §AA] is the per-request `req.log` plus the central
  `setErrorHandler` — the structured logger is pino.
