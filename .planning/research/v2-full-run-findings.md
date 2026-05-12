# V2 Full-Run Findings

## Reader and action

Reader: the engineer drafting the next `server-2` v2 milestone.

Post-read action: convert these findings into v2 requirements, phases, and
acceptance criteria for reliable full-run promotion, parsing, recalculation, and
old-vs-new statistics comparison.

## Evidence snapshot

The staging full-run on 2026-05-11 and 2026-05-12 produced a partial corpus in
`server-2`:

| Metric | Count |
|--------|-------|
| ingest staging records | 7740 |
| replays | 7740 |
| parse jobs | 7740 |
| parser results | 7740 |
| parse jobs succeeded | 7721 |
| parse jobs published | 19 |
| player stat rows | 498 |
| squad stat rows | 0 |
| commander-side stat rows | 36 |
| bounty point rows | 377 |

The fetcher did not complete the whole source corpus, but all 7740 staged
replays had corresponding parser results by the latest database snapshot.

## Findings

### Aggregate recalculation needs explicit full-run evidence

Parser results grew from the initial 30 replay sample to 7740, while the visible
aggregate row counts stayed at `player_stats=498`, `squad_stats=0`,
`commander_side_stats=36`, and `bounty_points=377`.

Row counts alone are not enough to prove whether aggregate values were updated
in place, skipped because of missing rotation coverage, skipped because of
identity resolution, or not recalculated after parser results landed.

V2 requirement candidate:

- Add a full-run recalculation report that records parser result count,
  recalculated count, skipped count, missing rotation count, missing timestamp
  count, missing identity count, and changed aggregate rows.
- Add a deterministic backfill command for all current parser results.
- Make the command idempotent and resumable.

### Rotation coverage is an operational dependency

Earlier debugging showed that parser results with replay timestamps still need
matching rotations before player, squad, commander, and bounty statistics can be
trusted. Controlled-run rotation data was seeded manually during the staging
investigation.

V2 requirement candidate:

- Provide a supported rotation management workflow before full-run statistics.
- Validate that every replay timestamp maps to exactly one rotation or to an
  explicit excluded range.
- Expose missing-rotation replays as an operator-visible report.

### No-SteamID identity depends on nickname history

Current replays do not yet contain SteamID. They may include SteamID in the
future, but the current statistics path must resolve players through nickname
history. A fix was added so no-SteamID players can resolve through manually
maintained nickname history and provisional observed names.

V2 requirement candidate:

- Treat nickname history as first-class data with validity windows, audit
  trail, import/export, and conflict detection.
- Report unresolved observed nicknames after every full run.
- Define migration behavior when future replays start carrying SteamID.

### Public statistics comparison must use server-2 outputs

The comparison target is `server-2` statistics, not raw parser output. Parser
results prove that the parser ran; they do not prove that public statistics,
identity, rotations, and bounty calculations match legacy behavior.

V2 requirement candidate:

- Export old statistics from the legacy trusted source.
- Export new statistics from `server-2` public read models or database views.
- Compare deterministic server-owned outputs with explicit allowlists for known
  differences.

### Parse job lifecycle is hard to reason about from counts

The database snapshot showed parse jobs split across terminal-looking statuses:
`succeeded` and `published`. Operators need to know whether "parsed",
"published", and "recalculated" are separate phases and whether every phase has
completed.

V2 requirement candidate:

- Define terminal parse job states and their relationship to parser results and
  aggregate recalculation.
- Add an operator status query or endpoint that reports each stage:
  staged, promoted, parse queued, parse running, parse succeeded, parse
  published, parser result current, recalculated, skipped.

### Full-run statistics need stronger observability

During the staging run, the only reliable status came from ad hoc SQL jobs.
That is too fragile for v2 operations.

V2 requirement candidate:

- Add an operations report for full-run readiness and completion.
- Include counts by staging status, replay status, parse job status, parser
  result currency, recalculation status, rotation coverage, identity coverage,
  and public stat freshness.
- Make this report safe to run without `pods/exec`.

### App repositories must not deploy runtime wiring

The app repository previously had a workflow that SSHed into staging and applied
Kubernetes resources and runtime secrets. That was removed so the app now owns
verification and image publication only. The infrastructure repository owns
manifests, runtime secrets, migrations, and rollout orchestration.

V2 requirement candidate:

- Keep app CI limited to verify and publish image.
- Add a CI guard that fails if app workflows reintroduce `kubectl`, staging SSH,
  Kubernetes Secret mutation, or rollout orchestration.

## Reader-test checklist

A v2 milestone drafted from this document should answer:

- How does an operator prove all parser results were recalculated into stats?
- How are rotations created, validated, and audited before a full run?
- How are no-SteamID players resolved and how are unresolved nicknames reported?
- What is the canonical old-vs-new export shape from `server-2`?
- Which lifecycle statuses must be zero before a full run is considered done?
