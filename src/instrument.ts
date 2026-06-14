// Sentry SDK init — errors-only, reporting to the self-hosted GlitchTip.
//
// This file MUST be imported before any other module (see src/server.ts) so the
// SDK can install its global error/unhandled-rejection handlers before the app
// and framework load. Reading process.env directly here is intentional: this is a
// pre-boot side-effect file that runs before the validated config loader (envalid)
// — the same exception we make for `dotenv/config`.
import * as Sentry from "@sentry/node";

Sentry.init({
  // Empty/absent DSN makes the SDK a no-op — no init gate needed.
  // The DSN is injected by infra via the server-2-runtime k8s Secret.
  dsn: process.env["SENTRY_DSN"],
  environment: process.env["NODE_ENV"] ?? "staging",
  // Optional build SHA; undefined when not provided.
  release: process.env["SENTRY_RELEASE"],
  // Errors-only: no performance tracing, no profiling, no session replay.
  // Default integrations still capture errors + unhandled rejections/exceptions.
  tracesSampleRate: 0,
});
