# API Compatibility

`server-2` owns the OpenAPI contract consumed by `web`.

## Drift Checks

- `pnpm run openapi:export` regenerates `openapi/server-2.openapi.json`.
- `pnpm run openapi:verify` fails when the committed OpenAPI artifact is stale.
- `pnpm run openapi:check` runs drift verification and validates that `openapi-typescript` can generate TypeScript types from the committed artifact.
- `pnpm run verify` includes `openapi:check`.

API route, payload, status-code, or schema changes must update the committed OpenAPI artifact in the same change.

## Operator Exports

`pnpm run ops:stats:legacy-export` emits the `legacy-public-export.v1` parity export for operators and the Phase 13 diff harness. It is not a Fastify route and does not change the public OpenAPI contract.

Phase 12 verified this by running `pnpm run openapi:check` without modifying `openapi/server-2.openapi.json`.

## Web Compatibility

The `web` application is expected to generate API types from:

```bash
openapi-typescript ../server-2/openapi/server-2.openapi.json -o <web-generated-api-types-path>
```

Current adjacent-app evidence is `gsd-briefs/web.md`: `web` is specified to use `openapi-typescript`, generated API types, and no hand-written duplicate DTOs. The `web` repository currently only contains planning/brief artifacts, so no generated client path is available to update from `server-2` yet.

When `web` adds its client generation command, keep it pointed at this committed OpenAPI artifact or at the running `GET /openapi.json` endpoint in environments where the server version is pinned.
