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

cd "$SCRIPT_DIR/.."
git pull -q

claude -p "$(cat "$PROMPT_FILE")" \
  --dangerously-skip-permissions \
  2>&1 | tee -a "$SCRIPT_DIR/data/$JOB.log"
