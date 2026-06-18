#!/usr/bin/env bash
#
# capture-artifacts.sh — GATED capture of the FULL production parser-artifact corpus.
#
# Pulls the REAL production parser artifacts from the VPS S3 bucket and packs them into
# src/test/golden/fixtures/artifacts.tar.gz (replacing / augmenting the committed floor).
# The agent has no VPS access, so a HUMAN runs this once under `!`. The live full-corpus
# run is a master-only CI step; the committed floor (build-floor-archive.sh) keeps the
# oracle non-empty until then.
#
# Inputs (env only — NO host/key/cred values are ever hardcoded or committed):
#   VPS_S3_ENDPOINT          S3/MinIO endpoint URL hosting the bucket (required)
#   VPS_S3_BUCKET            artifact bucket name (default: solid-replays)
#   VPS_S3_ACCESS_KEY_ID     S3 access key (required)
#   VPS_S3_SECRET_ACCESS_KEY S3 secret key (required)
#   VPS_S3_PREFIX            object key prefix to pull (default: artifacts/v3/)
#   GOLDEN_CAPTURE_LIMIT     optional cap on the number of objects (default: unlimited)
#   GOLDEN_FOLD_FLOOR        "1" to also fold in the parser-2 floor (default: 1)
#
# Usage:
#   VPS_S3_ENDPOINT=https://<vps-s3-host> VPS_S3_ACCESS_KEY_ID=… \
#   VPS_S3_SECRET_ACCESS_KEY=… bash src/test/golden/scripts/capture-artifacts.sh
#
# Requires: the MinIO client `mc` (preferred) OR the AWS CLI `aws`, plus tar/gzip.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_REPO="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
FIXTURES_DIR="${SERVER_REPO}/src/test/golden/fixtures"
ARCHIVE="${FIXTURES_DIR}/artifacts.tar.gz"

VPS_S3_BUCKET="${VPS_S3_BUCKET:-solid-replays}"
VPS_S3_PREFIX="${VPS_S3_PREFIX:-artifacts/v3/}"
GOLDEN_CAPTURE_LIMIT="${GOLDEN_CAPTURE_LIMIT:-0}"
GOLDEN_FOLD_FLOOR="${GOLDEN_FOLD_FLOOR:-1}"

# --- Happ VPN bypass reminder (global memory happ-vpn-bypass-for-servers) -------------
# Happ VPN is always-on; traffic to your own VPS must bypass it via an `ip rule`, or the
# S3/SSH connection hangs. Ensure that bypass is active for the VPS_S3_ENDPOINT host
# BEFORE running this script.
echo "REMINDER: ensure the Happ VPN ip-rule bypass for the VPS S3 host is active,"
echo "          otherwise mc/aws S3 over the VPN will hang (global memory:"
echo "          happ-vpn-bypass-for-servers)."

# --- Validate required env (fail loudly) ----------------------------------------------
missing=()
[ -z "${VPS_S3_ENDPOINT:-}" ] && missing+=("VPS_S3_ENDPOINT")
[ -z "${VPS_S3_ACCESS_KEY_ID:-}" ] && missing+=("VPS_S3_ACCESS_KEY_ID")
[ -z "${VPS_S3_SECRET_ACCESS_KEY:-}" ] && missing+=("VPS_S3_SECRET_ACCESS_KEY")
if [ "${#missing[@]}" -gt 0 ]; then
  echo "ERROR: missing required env: ${missing[*]}" >&2
  exit 1
fi

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/golden-capture-XXXXXX")"
trap 'rm -rf "${WORK_DIR}"' EXIT
OBJECTS_DIR="${WORK_DIR}/objects"
mkdir -p "${OBJECTS_DIR}"

# --- Pull objects: prefer mc, fall back to aws ----------------------------------------
if command -v mc >/dev/null 2>&1; then
  echo "Using MinIO client (mc) to pull s3://${VPS_S3_BUCKET}/${VPS_S3_PREFIX}…"
  MC_ALIAS="goldencapture"
  mc alias set "${MC_ALIAS}" "${VPS_S3_ENDPOINT}" \
    "${VPS_S3_ACCESS_KEY_ID}" "${VPS_S3_SECRET_ACCESS_KEY}" >/dev/null
  mc cp --recursive \
    "${MC_ALIAS}/${VPS_S3_BUCKET}/${VPS_S3_PREFIX}" "${OBJECTS_DIR}/"
  mc alias remove "${MC_ALIAS}" >/dev/null 2>&1 || true
elif command -v aws >/dev/null 2>&1; then
  echo "Using AWS CLI (aws) to pull s3://${VPS_S3_BUCKET}/${VPS_S3_PREFIX}…"
  AWS_ACCESS_KEY_ID="${VPS_S3_ACCESS_KEY_ID}" \
  AWS_SECRET_ACCESS_KEY="${VPS_S3_SECRET_ACCESS_KEY}" \
    aws --endpoint-url "${VPS_S3_ENDPOINT}" s3 cp --recursive \
    "s3://${VPS_S3_BUCKET}/${VPS_S3_PREFIX}" "${OBJECTS_DIR}/"
else
  echo "ERROR: neither 'mc' nor 'aws' is installed — cannot pull S3 objects." >&2
  exit 1
fi

# --- Flatten + count, honoring an optional cap (never a SILENT cap) --------------------
STAGE_DIR="${WORK_DIR}/stage"
mkdir -p "${STAGE_DIR}"
captured=0
skipped=0
while IFS= read -r -d '' file; do
  if [ "${GOLDEN_CAPTURE_LIMIT}" -gt 0 ] && [ "${captured}" -ge "${GOLDEN_CAPTURE_LIMIT}" ]; then
    skipped=$((skipped + 1))
    continue
  fi
  cp "${file}" "${STAGE_DIR}/capture-${captured}.json"
  captured=$((captured + 1))
done < <(find "${OBJECTS_DIR}" -type f -name '*.json' -print0)

if [ "${captured}" -eq 0 ]; then
  echo "ERROR: pulled zero artifact objects from s3://${VPS_S3_BUCKET}/${VPS_S3_PREFIX}" >&2
  echo "       Check the bucket/prefix/creds and the VPN bypass, then retry." >&2
  exit 1
fi

# --- Optionally fold in the parser-2 floor so the corpus is a strict superset ---------
floor=0
if [ "${GOLDEN_FOLD_FLOOR}" = "1" ] && [ -f "${SCRIPT_DIR}/build-floor-archive.sh" ]; then
  echo "Folding in the parser-2 floor…"
  if bash "${SCRIPT_DIR}/build-floor-archive.sh"; then
    FLOOR_DIR="${WORK_DIR}/floor"
    mkdir -p "${FLOOR_DIR}"
    tar xzf "${ARCHIVE}" -C "${FLOOR_DIR}"
    for floor_file in "${FLOOR_DIR}"/*.json; do
      [ -f "${floor_file}" ] || continue
      cp "${floor_file}" "${STAGE_DIR}/floor-$(basename "${floor_file}")"
      floor=$((floor + 1))
    done
  else
    echo "WARNING: floor build failed; packing the captured corpus only." >&2
  fi
fi

mkdir -p "${FIXTURES_DIR}"
tar czf "${ARCHIVE}" -C "${STAGE_DIR}" .

echo "Capture archive written: ${ARCHIVE}"
echo "captured=${captured} skipped=${skipped} floor=${floor}"
