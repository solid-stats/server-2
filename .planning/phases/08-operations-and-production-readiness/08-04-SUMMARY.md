# Summary 08-04: OpenAPI Drift Verification and Web Compatibility

## Completed

- Added shared OpenAPI schema generation helper.
- Added `pnpm run openapi:verify` drift check for committed schema freshness.
- Updated `openapi:check` to verify drift before running `openapi-typescript`.
- Added API compatibility notes for future `web` generated API types.
- Verified adjacent `web` evidence: current repo has briefs/planning only, so there is no generated client path to update yet.

## Evidence

- `pnpm run openapi:verify` passed.
- `pnpm run openapi:check` passed.
- Full verification is required before commit and phase advancement.
