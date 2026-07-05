#!/usr/bin/env bash
#
# setup-brain.sh
#
# Imports the seed company knowledge base (brain/) into GBrain so the
# Context Assistant MVP can search it. Safe to re-run (idempotent) —
# gbrain import is expected to upsert documents rather than duplicate them.
#
# Usage:
#   ./scripts/setup-brain.sh            # import only, no embedding
#   ./scripts/setup-brain.sh --embed     # import, then embed stale docs
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BRAIN_DIR="${REPO_ROOT}/brain"

DO_EMBED="false"
for arg in "$@"; do
  case "$arg" in
    --embed)
      DO_EMBED="true"
      ;;
    -h|--help)
      echo "Usage: $0 [--embed]"
      echo ""
      echo "  --embed   Also run 'gbrain embed --stale' after import."
      exit 0
      ;;
  esac
done

echo "== Company Context Assistant: brain setup =="

# 1. Check that the brain/ directory exists and has content.
if [ ! -d "$BRAIN_DIR" ]; then
  echo "ERROR: brain/ directory not found at: ${BRAIN_DIR}"
  echo "Nothing to import. Make sure you're running this from the repo, or that brain/ was created."
  exit 1
fi

if [ -z "$(find "$BRAIN_DIR" -name '*.md' -print -quit 2>/dev/null)" ]; then
  echo "ERROR: No markdown files found under ${BRAIN_DIR}."
  echo "Nothing to import."
  exit 1
fi

# 2. Check that the gbrain binary is available.
if ! command -v gbrain >/dev/null 2>&1; then
  echo "ERROR: 'gbrain' command not found on PATH."
  echo ""
  echo "GBrain is required to store and search the company knowledge base."
  echo "Install / set up GBrain first, then re-run this script."
  echo "See docs/setup.md for details."
  exit 1
fi

echo "Found gbrain: $(command -v gbrain)"
echo "Importing from: ${BRAIN_DIR}"
echo ""

# 3. Import the brain/ markdown tree without embedding (fast, safe to re-run).
if ! gbrain import "$BRAIN_DIR" --no-embed; then
  status=$?
  echo ""
  echo "ERROR: 'gbrain import' failed (exit code ${status})."
  echo ""
  echo "Common causes:"
  echo "  - Another gbrain session or MCP server is holding a lock on the brain database."
  echo "    Close other gbrain sessions / the gbrain MCP server in your editor, then re-run this script."
  echo "  - gbrain has not been initialized yet (see docs/setup.md)."
  exit "$status"
fi

echo ""
echo "Import complete."

# 4. Optionally embed stale documents so search results are up to date.
if [ "$DO_EMBED" = "true" ]; then
  echo ""
  echo "Embedding stale documents..."
  if ! gbrain embed --stale; then
    status=$?
    echo ""
    echo "ERROR: 'gbrain embed --stale' failed (exit code ${status})."
    echo "If this is a lock error, close other gbrain sessions / the gbrain MCP server and re-run:"
    echo "  ./scripts/setup-brain.sh --embed"
    exit "$status"
  fi
  echo "Embedding complete."
else
  echo ""
  echo "Skipped embedding (no --embed flag passed)."
  echo "Run './scripts/setup-brain.sh --embed' to embed documents for search, or run 'gbrain embed --stale' manually."
fi

echo ""
echo "== Done =="
