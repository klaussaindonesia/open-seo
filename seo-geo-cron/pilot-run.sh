#!/usr/bin/env bash
set -euo pipefail

# Constrained pilot runner: same as run.sh but WITHOUT
# --dangerously-skip-permissions, so any real action (git push, gh pr
# create, gh issue create) pauses for approval instead of executing.
JOB="${1:?Usage: pilot-run.sh <technical-health|seo|geo>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="$SCRIPT_DIR/prompts/$JOB.md"

if [ -f "$SCRIPT_DIR/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.env.local"
  set +a
fi

claude -p "$(cat "$SCRIPT_DIR/prompts/_common.md"; echo; echo; cat "$PROMPT_FILE")" \
  2>&1 | tee "$SCRIPT_DIR/data/$JOB-pilot.log"
