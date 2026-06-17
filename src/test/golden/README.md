# Golden end-to-end integration oracle

A behavioral regression net that pins the **current observable behavior** of the
`server-2` ingest → stats pipeline (plus the public read surface and the auth role-gate)
against **real PostgreSQL + RabbitMQ + S3**, driven through the same factories `server.ts`
wires. It exists to catch integration-level drift before a behavior-preserving refactor:
a refactor must keep this suite green; any behavioral drift must turn it red.

This is a **separate, master-only, slow** gate — it is **NOT** part of `pnpm verify` and
carries **zero coverage obligation** (`src/test/**` is coverage-excluded).

## Layout

```
src/test/golden/
  fixtures/
    loader.ts            # ONE shared loader/unpacker + archivePresent()/dockerReachable() skip guards
    normalize.ts         # ONE shared snapshot normalizer (uuid->token map, timestamp redaction, row sort)
    artifacts.tar.gz     # committed floor corpus (real parser-2 artifacts) — never empty
  scripts/
    build-floor-archive.sh   # committable floor: parser-2 CLI over its golden OCAP corpus
    capture-artifacts.sh     # gated VPS S3 capture of the hundreds-of-prod corpus (human-run, once)
  pipeline.golden.test.ts    # full-chain characterization oracle
  bounty-anchor.golden.test.ts  # hand-computed bounty anchors
  invariants.golden.test.ts     # idempotency / dedup / conflict / re-delivery / role-gate
  __snapshots__/             # file snapshots (coverage-excluded)
```

## Running

```sh
# bring up the docker-compose PG(15432) / RabbitMQ(5673) / S3(9000) services, then:
pnpm run test:golden
```

`test:golden` runs `vitest run src/test/golden --no-file-parallelism`. No `verify`-chained
script (`test`, `test:integration`, `test:coverage`) targets `src/test/golden`. The suites
`describe.skipIf(!archivePresent() || !dockerReachable)`, so when Docker or the archive are
absent they **SKIP cleanly** — `pnpm verify` and `pnpm test` stay green at 100% without them.

## Building the committed floor

The floor is the parser-2 golden corpus parsed through its CLI, so the oracle is never empty
without VPS access:

```sh
bash src/test/golden/scripts/build-floor-archive.sh [PARSER_REPO_DIR]
```

Only `success`/`partial` artifacts are packed — the `parse.completed` consumer
nack-requeues on any throw (`rabbitmq.ts:126-128`), so a `failed` artifact fed through the
real broker would redeliver forever. The conflict and `parse.failed` invariants therefore
use synthetic non-broker paths.

## Capturing the full production corpus (gated, master-only CI)

The hundreds-of-real-artifacts corpus lives on the production VPS S3 bucket; the agent has
no VPS access, so the human runs the capture once. **Happ VPN is always-on** — ensure the
`ip rule` bypass for the VPS host is active first, or `mc`/`aws s3` will hang
(global memory `happ-vpn-bypass-for-servers`).

```sh
VPS_S3_ENDPOINT=https://<vps-s3-host> \
VPS_S3_BUCKET=solid-replays \
VPS_S3_ACCESS_KEY_ID=<key> \
VPS_S3_SECRET_ACCESS_KEY=<secret> \
bash src/test/golden/scripts/capture-artifacts.sh
```

The committed `artifacts.tar.gz` is the **floor** until the human runs the capture; the live
full-corpus run is a **master-only CI** step. Never commit VPS host/key/cred values — the
script reads them from env only. The captured artifact JSONs themselves are committable
(SteamID masking is enforced server-side at the mapper, so `GET /stats/*` snapshots cannot
contain Steam64).

## Pinned tech-debt

The oracle pins **current** behavior as-is. When a snapshot captures a known defect, leave a
one-line comment at the assertion site plus a backlog pointer — do **not** "fix" the behavior
inside the oracle (that would mask the drift the oracle exists to catch).

> Example: `// PINNED TECH-DEBT (BACKLOG-xxx): <behavior> is captured as-is; do not fix here.`

## CI wiring

Add a distinct master-only `golden-oracle` job that brings up the docker-compose services and
runs `pnpm run test:golden` with a generous per-test timeout. See the "CI wiring" section below
for the exact job YAML; do NOT add `test:golden` to the `verify` chain or any Docker-less
PR-required check.
