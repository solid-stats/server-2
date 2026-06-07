---
phase: 19-contract-freeze
reviewed: 2026-06-08T01:30:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/openapi/register-openapi.ts
  - src/openapi/frozen-contract.test.ts
  - .github/workflows/cd.yml
  - README.md
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 19: Code Review Report

**Reviewed:** 2026-06-08T01:30:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Phase 19 freezes the OpenAPI contract at `1.0.0`, adds a `frozen-contract.test.ts` static sweep, and wires an `oasdiff` breaking-change gate into CI. The version bump, the existing `verify`/`image` jobs, and the README bump-policy section are correct. The frozen-contract test passes (4/4) and its core assertions (version pin, Steam64 sweep, pagination scope) are sound and non-vacuous.

No blockers. The findings below are warnings and info: a supply-chain pinning gap on the oasdiff action, a real coverage gap in the pagination sweep around nested cursor lists (`/stats/leaderboards`), and a fragile assumption in the artifact-wide Steam64 scan.

## Warnings

### WR-01: oasdiff action pinned to a mutable git tag, not an immutable commit SHA

**File:** `.github/workflows/cd.yml:73`
**Issue:** `uses: oasdiff/oasdiff-action/breaking@v0.0.56` pins to a git tag. Tags are mutable — a compromised or careless upstream can move `v0.0.56` to a different commit, and this job runs in a workflow with `permissions: packages: write` at the file top. The focus brief explicitly asks whether the action is "pinned to an immutable tag"; a semver tag is not immutable. This is the standard GitHub supply-chain hardening gap (third-party actions should be pinned to a full commit SHA).
**Fix:** Pin to the commit SHA the tag currently points at, keeping the tag in a comment for readability:
```yaml
uses: oasdiff/oasdiff-action/breaking@<full-40-char-sha>  # v0.0.56
```
Resolve the SHA with `git ls-remote https://github.com/oasdiff/oasdiff-action refs/tags/v0.0.56`.

### WR-02: pagination sweep misses nested cursor lists — `/stats/leaderboards` is never inspected

**File:** `src/openapi/frozen-contract.test.ts:59-68, 130-138`
**Issue:** `isListSchema` only treats a schema as a list when `items` is a **top-level** property/required key. `/stats/leaderboards` returns `{ bounty, playersByKills, rotationId, squadsByKills }` where each of `bounty`/`playersByKills`/`squadsByKills` is itself a cursor envelope (`hasMore`/`items`/`nextCursor`). Because `items` is not top-level, `findPaginationOffenders` skips `/stats/leaderboards` entirely (`inspected` covers only `/stats/players`, `/stats/squads`, `/stats/bounty`, `/stats/replays`, `/stats/replays/{id}/events`). If a future change added `page`/`pageSize`/`total` to a leaderboard sub-surface, this freeze guard would pass silently — exactly the regression the test exists to catch. The README at line 113 names `/stats/*` as the protected public surface, and leaderboards are public cursor lists, so the gap is real, not by-design.
**Fix:** Recurse one level into object-typed top-level properties that are themselves list envelopes, or explicitly enumerate the leaderboard sub-surfaces. Minimal version — also check direct child object schemas that expose a top-level `items`:
```ts
function collectListSchemas(schema: Json): Json[] {
  const lists: Json[] = [];
  if (isListSchema(schema)) lists.push(schema);
  const properties = asJson(schema["properties"]);
  for (const child of Object.values(properties ?? {})) {
    const c = asJson(child);
    if (c !== undefined && isListSchema(c)) lists.push(c);
  }
  return lists;
}
```
Then walk each collected list schema for forbidden keys. Update the `inspected > 0` guard to count all collected list schemas so the leaderboard surface is provably covered.

### WR-03: artifact-wide Steam64 sweep is fragile against numeric Steam64 values

**File:** `src/openapi/frozen-contract.test.ts:125-128`
**Issue:** The sweep does `JSON.stringify(await loadArtifact())` then matches `/7656119\d{10}/u`. A Steam64 embedded as a JSON **number** (e.g. an `example: 76561198012347890` in a schema) survives `JSON.stringify` as bare digits and would be caught — good. But JS `JSON.parse`/`stringify` round large integers through float64, so a 17-digit numeric Steam64 in the source artifact can be re-serialized as a slightly different integer that no longer matches the exact pattern (the sibling runtime guard at `steamid-leak-guard.test.ts:421-428` documents this exact float64 rounding). For the artifact this is a contract document (string examples dominate), so the practical risk is low, but the static sweep cannot claim parity with the runtime leak guard for numeric vectors. The doc comment at lines 6-12 calls this a "defense-in-depth layer over the published artifact" without noting the numeric blind spot.
**Fix:** Match against the raw file text instead of the re-serialized object, so no float64 round-trip occurs:
```ts
const raw = await readFile(resolve("openapi/server-2.openapi.json"), "utf8");
expect(raw).not.toMatch(STEAM64_PATTERN);
```
This also removes the redundant parse+stringify and matches what `loadArtifact` already reads.

## Info

### IN-01: negative-control test exercises only the planted-spec path, not the real artifact

**File:** `src/openapi/frozen-contract.test.ts:140-168`
**Issue:** The negative control (T-19-03) proves `findPaginationOffenders` reports a planted top-level `page`, which validates the offender-detection branch. It does not exercise the nested-list path (WR-02), so the control passing gives false confidence that the real `/stats/*` surface is fully swept. Once WR-02 is fixed, add a planted nested cursor offender to the control.
**Fix:** Extend the planted spec with a `/stats/leaderboards`-shaped response carrying a nested `page` once recursion lands.

### IN-02: `asJson` cast comment and `Json` type allow silent shape drift

**File:** `src/openapi/frozen-contract.test.ts:26-32`
**Issue:** `type Json = Record<string, unknown>` plus the `value as Json` cast in `asJson` is acceptable for a JSON walker, but every downstream access (`spec["paths"]`, `schema["properties"]`) is untyped `unknown` indexing guarded only by repeated `asJson` calls. This is fine for a test but means a structural change to the artifact (e.g. `responses` keyed differently) degrades to silent `undefined` and a vacuous-but-for-`inspected>0` pass. The `inspected > 0` guard mitigates this for the pagination test only; the version and Steam64 tests have no equivalent floor.
**Fix:** No change required for a test file; noted so the `inspected`-style non-vacuity floor is considered if these helpers are reused.

### IN-03: README bump-policy is correct but does not mention SHA pinning for the action

**File:** `README.md:111`
**Issue:** The bump-policy section states the action is "pinned to the exact tag `v0.0.56`". If WR-01 is applied (SHA pin), update this sentence so the docs match the workflow; otherwise the README documents the weaker pinning as intentional.
**Fix:** After WR-01, change "pinned to the exact tag `v0.0.56`" to "pinned to commit SHA `<sha>` (tag `v0.0.56`)".

---

## Non-findings checked (ruled out)

- **Version bump correctness** — `register-openapi.ts:12` `0.1.0` → `1.0.0`; `FROZEN_VERSION` and `info.version` in the committed artifact both `1.0.0`; the version-pin test passes. Correct.
- **oasdiff `fail-on: ERR`** — valid value, strictest gate. Correct.
- **`fetch-depth: 0`** — required for the `origin/<base_ref>:path` git-revision base to resolve the base-branch blob. Correct.
- **PR-only guard** — `if: github.event_name == 'pull_request'` means `github.base_ref` is always populated, so the `origin/${{ github.base_ref }}:...` base syntax never resolves empty. Correct.
- **git-revision base syntax** — `origin/<branch>:<path>` and `HEAD:<path>` are valid `git show`-style revisions oasdiff accepts. Correct.
- **Existing jobs intact** — `verify` unchanged; `image` still `needs: verify` and `if: github.event_name != 'pull_request'`; `contract-diff` added as an independent job with no `needs`, so it does not gate or alter the image pipeline. Correct.
- **`/operations/*` exclusion** — confirmed the operator list responses (`/operations/parse-jobs`, `/operations/ingest-staging`) carry `page`/`pageSize`/`total`; the `path.startsWith("/stats/")` filter correctly excludes them, so offset pagination there does not trip the freeze guard. Correct and intended.
- **Non-vacuity of the pagination test** — `inspected` reaches 5 against the real artifact and the `> 0` assertion holds. Non-vacuous (within the top-level-only scope; see WR-02 for what it does not reach).

---

_Reviewed: 2026-06-08T01:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
