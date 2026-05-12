# Phase 13 Context: Diff Harness Contract and Boundary Guards

**Status:** ready
**Mode:** autonomous smart discussion

## Phase Goal

`server-2` must define the backend side of old-vs-new public-stat comparison and keep runtime orchestration out of the app repository.

## Relevant Requirements

- DIFF-01: Server defines the new-stat export shape consumed by the old-vs-new diff tool.
- DIFF-02: Server defines strict parity failures for missing players, missing matches, changed public aggregate totals, parser/export failures, and unexplained differences.
- DIFF-03: Server defines the known-difference policy with only documented `deaths.byTeamkills` duplicate-slot/respawn cases allowed by default.
- DIFF-04: Diff output includes old/new input metadata, snapshot metadata, summary counts, strict failures, known teamkill-death differences, and `review_required`.
- DIFF-05: Diff harness contract supports small sample, existing partial staging corpus, and final full-corpus comparisons.
- DIFF-06: Broadening the allowlist beyond documented teamkill-death public differences requires an explicit human decision captured in planning docs.
- OPS-13: App CI prevents reintroducing staging SSH, `kubectl`, Kubernetes Secret mutation, or rollout orchestration into `server-2` workflows.

## Decisions

- Keep the actual legacy snapshot capture and controlled full-run orchestration out of `server-2`; those remain infrastructure-owned.
- Define the diff report contract and strict/known-difference taxonomy in backend code and docs so Phase 13 hands a stable interface to the future diff runner.
- Add a CI/verify guard that scans `.github/workflows` only. Product docs may still describe infrastructure/k3s procedures, but app workflows must not run staging SSH, `kubectl`, Secret mutation, or rollout orchestration.
- Keep diff output review-oriented: every report has `review_required`, and no result automatically approves production cutover.

## Assumptions

- Phase 12 `legacy-public-export.v1` is the backend new-stat input for the diff harness.
- Old legacy data will be captured by infrastructure as a snapshot artifact and passed into a later diff runner.
- The final full-corpus comparison cannot complete inside this repo alone because `replays-fetcher` and `infrastructure` still own upstream run control and evidence storage.

## Risks

- A broad allowlist would hide real parity regressions. The only default known difference should be documented teamkill-death duplicate-slot/respawn behavior.
- A workflow guard that scans all docs would create false positives because deployment runbooks legitimately mention infrastructure commands. It must scan executable app workflows.
- Diff code should avoid pretending that production cutover is automated; it is review evidence only.

## Output Shape

Phase 13 should produce:

- A TypeScript diff contract module with contract version, corpus scopes, strict failure codes, known difference code, and report-shape helpers.
- Focused unit tests for strict failure taxonomy, known difference policy, and review-required output.
- A workflow boundary guard operation included in `pnpm run verify`.
- Documentation for the diff harness contract, known-difference policy, input metadata, review semantics, and app/infrastructure boundaries.
- Final v2.0 requirement and state updates.
