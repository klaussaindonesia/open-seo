#!/usr/bin/env bash
set -euo pipefail

# Usage: ./run.sh <technical-health|seo|geo>
JOB="${1:?Usage: run.sh <technical-health|seo|geo>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="$SCRIPT_DIR/prompts/$JOB.md"

if [ ! -f "$PROMPT_FILE" ]; then
  echo "No such job prompt: $PROMPT_FILE" >&2
  exit 1
fi

if [ -f "$SCRIPT_DIR/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.env.local"
  set +a
fi

cd "$SCRIPT_DIR/.."
git pull -q

claude -p "$(cat "$SCRIPT_DIR/prompts/_common.md"; echo; echo; cat "$PROMPT_FILE")" \
  --dangerously-skip-permissions \
  2>&1 | tee -a "$SCRIPT_DIR/data/$JOB.log"
