#!/usr/bin/env bash
set -euo pipefail

# Constrained pilot runner: same as run.sh but WITHOUT
# --dangerously-skip-permissions, so any real action (git push, gh pr
# create, gh issue create) pauses for approval instead of executing.
JOB="${1:?Usage: pilot-run.sh <technical-health|ranking-content|geo-citation>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="$SCRIPT_DIR/prompts/$JOB.md"

claude -p "$(cat "$PROMPT_FILE")" \
  2>&1 | tee "$SCRIPT_DIR/data/$JOB-pilot.log"
