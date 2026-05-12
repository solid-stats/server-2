# Diff Harness Contract

Phase 13 defines the backend-owned contract for old-vs-new public statistics comparison. The actual controlled full-corpus run and legacy snapshot capture stay outside this repo; `server-2` provides the new export shape, strict failure taxonomy, known-difference policy, and review semantics consumed by a future diff runner.

## Contract Version

The diff report contract is `old-vs-new-diff.v1`.

The TypeScript source of truth is `src/modules/statistics/diff/diff-contract.ts`.

Every report created through `createDiffReport` sets:

- `contractVersion: "old-vs-new-diff.v1"`
- `snapshot.diffContractVersion: "old-vs-new-diff.v1"`
- `review_required: true`

Production cutover approval is not automatic. A clean or explainable diff is evidence for human review, not a deployment decision.

## Inputs

Each comparison records old and new input metadata:

- `label`: `old` or `new`
- `source`: source system label, such as `sg_stats` or `server-2`
- `contractVersion`: input artifact contract, such as `legacy-public-export.v1`
- `corpusScope`: `sample`, `partial-staging`, or `full-corpus`
- `generatedAt`: source artifact timestamp
- `artifactSha256`: optional immutable artifact hash

The new input is expected to come from:

```bash
pnpm run ops:stats:legacy-export -- --corpus-scope full-corpus
```

Use `sample` for small deterministic fixtures, `partial-staging` for the current available staging corpus, and `full-corpus` for controlled production-readiness evidence.

## Report Shape

Diff reports include:

- `snapshot`: comparison timestamp and old/new metadata.
- `summary`: matched players, missing players, missing matches, changed public aggregate totals, strict failure count, and known difference count.
- `strictFailures`: blocking parity differences.
- `knownDifferences`: explicitly classified non-blocking public-stat differences.
- `review_required`: always `true`.

The report is intentionally narrow. It is a review artifact for operators and follow-on application planning, not a public API surface.

## Strict Failures

These failure codes are strict by default:

- `missing_player`
- `missing_match`
- `changed_public_aggregate_total`
- `parser_failure`
- `export_failure`
- `unexplained_difference`

A strict failure means the old-vs-new comparison needs correction, deeper explanation, or an explicit planning decision before the evidence can support downstream work.

## Known Difference Policy

The only default known difference is:

- `deaths_by_teamkills_duplicate_slot_respawn`

This represents documented `deaths.byTeamkills` differences caused by duplicate slot or respawn behavior. Broadening the known-difference allowlist requires an explicit human decision captured in planning docs. Do not normalize broad data differences by silently adding allowlist entries.

## Boundaries

`server-2` owns:

- deterministic new public-stat export through `legacy-public-export.v1`
- `old-vs-new-diff.v1` report contract
- strict failure and known-difference taxonomy
- app workflow boundary guard

Adjacent apps own:

- `replays-fetcher`: resumable full-corpus replay discovery and staging.
- `replay-parser-2`: OCAP parsing behavior and parser contract changes.
- `infrastructure`: controlled full-corpus runtime orchestration, legacy snapshot capture, artifact storage, Kubernetes operations, and deployment rollout.
- `web`: browser UI after backend parity evidence stabilizes.

## Workflow Guard

Run the app boundary guard with:

```bash
pnpm run ops:boundary:check
```

`pnpm run verify` also runs this guard.

The guard scans `.github/workflows` and fails if app workflows reintroduce staging SSH/SCP/rsync, `kubectl`, Kubernetes Secret mutation, rollout orchestration, or direct kubeconfig usage. Application workflows may verify, test, build, and publish app artifacts; infrastructure workflows own runtime orchestration and secret mutation.
