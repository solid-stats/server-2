#!/usr/bin/env bash
#
# build-floor-archive.sh — produce the COMMITTABLE floor corpus for the golden oracle.
#
# Runs the replay-parser-2 CLI over its own golden OCAP corpus and packs the emitted
# real ParseArtifact JSONs into src/test/golden/fixtures/artifacts.tar.gz. This is the
# floor so the golden oracle is NEVER empty without VPS access (the hundreds-from-prod
# capture is capture-artifacts.sh and is gated/master-only).
#
# Only `success`/`partial` artifacts are packed: the server-2 parse.completed consumer
# nack-requeues on any throw (rabbitmq.ts:126-128) → a `failed`/`invalid-json` artifact
# fed through the real broker would redeliver forever. The conflict and parse.failed
# invariants use synthetic non-broker paths instead.
#
# Usage:
#   bash src/test/golden/scripts/build-floor-archive.sh [PARSER_REPO_DIR]
#
# PARSER_REPO_DIR defaults to ../replay-parser-2 relative to this server-2 repo.
# Requires: cargo (to build the replay-parser-2 CLI), tar, gzip.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_REPO="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
FIXTURES_DIR="${SERVER_REPO}/src/test/golden/fixtures"
ARCHIVE="${FIXTURES_DIR}/artifacts.tar.gz"

PARSER_REPO="${1:-${SERVER_REPO}/../replay-parser-2}"
CORPUS_DIR="${PARSER_REPO}/crates/parser-core/tests/fixtures"

if ! command -v cargo >/dev/null 2>&1; then
  echo "ERROR: cargo not found. Install Rust toolchain to build the replay-parser-2 CLI." >&2
  echo "       The committed artifacts.tar.gz remains the floor until this can run." >&2
  exit 1
fi

if [ ! -d "${CORPUS_DIR}" ]; then
  echo "ERROR: parser-2 corpus not found at ${CORPUS_DIR}" >&2
  echo "       Pass the replay-parser-2 repo dir as the first argument." >&2
  exit 1
fi

# success/partial OCAP inputs only (invalid-json → status:failed is EXCLUDED — see header).
INPUTS=(
  valid-minimal
  metadata-drift
  killed-events
  side-facts
  vehicle-context
  aggregate-combat
  combat-events
  duplicate-slot-same-name
  connected-backfill
)

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/golden-floor-XXXXXX")"
trap 'rm -rf "${WORK_DIR}"' EXIT

echo "Building replay-parser-2 CLI (cargo build --release)…"
cargo build --release --manifest-path "${PARSER_REPO}/Cargo.toml" --bin replay-parser-2

CLI="${PARSER_REPO}/target/release/replay-parser-2"

captured=0
skipped=0
for name in "${INPUTS[@]}"; do
  input="${CORPUS_DIR}/${name}.ocap.json"
  if [ ! -f "${input}" ]; then
    echo "  skip (missing input): ${name}"
    skipped=$((skipped + 1))
    continue
  fi
  output="${WORK_DIR}/${name}.json"
  # The CLI takes INPUT as a positional arg and --output as a flag
  # (replay-parser-2 parse [OPTIONS] --output <OUTPUT> <INPUT>).
  if "${CLI}" parse --output "${output}" "${input}"; then
    echo "  captured: ${name}"
    captured=$((captured + 1))
  else
    echo "  skip (parse non-zero exit): ${name}"
    skipped=$((skipped + 1))
  fi
done

if [ "${captured}" -eq 0 ]; then
  echo "ERROR: produced zero artifacts — refusing to write an empty floor archive." >&2
  exit 1
fi

mkdir -p "${FIXTURES_DIR}"
tar czf "${ARCHIVE}" -C "${WORK_DIR}" .

echo "Floor archive written: ${ARCHIVE}"
echo "captured=${captured} skipped=${skipped}"
