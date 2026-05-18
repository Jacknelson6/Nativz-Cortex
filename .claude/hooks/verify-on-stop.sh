#!/usr/bin/env bash
# Stop hook: run `npm run verify` before letting the agent finish.
# If it fails, block the stop and feed the failure back to the agent.

set -u

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" || exit 0

OUT=$(npm run verify 2>&1)
EXIT=$?

if [ $EXIT -ne 0 ]; then
  # Emit JSON to block the stop and surface output to the agent
  REASON=$(printf '%s' "$OUT" | tail -n 80 | sed 's/"/\\"/g' | tr '\n' ' ')
  printf '{"decision":"block","reason":"verify failed: %s"}' "$REASON"
  exit 0
fi

exit 0
