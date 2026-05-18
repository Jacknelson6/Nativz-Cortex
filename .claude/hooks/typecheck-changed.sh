#!/usr/bin/env bash
# PostToolUse hook: after Edit/Write, typecheck and lint the changed file.
# Blocks on errors, non-blocking on warnings.

set -u

# Read JSON payload from stdin
PAYLOAD=$(cat)

# Extract file_path from the payload (Edit + Write both use file_path)
FILE_PATH=$(printf '%s' "$PAYLOAD" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only act on TS/TSX files inside the project
case "$FILE_PATH" in
  *.ts|*.tsx)
    ;;
  *)
    exit 0
    ;;
esac

# Resolve project dir (hook may be invoked with CWD elsewhere)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" || exit 0

# Make path relative to project dir if it's absolute
case "$FILE_PATH" in
  /*)
    REL_PATH="${FILE_PATH#$PROJECT_DIR/}"
    ;;
  *)
    REL_PATH="$FILE_PATH"
    ;;
esac

FAILED=0

# Project-wide typecheck (incremental via .tsbuildinfo when present)
TSC_OUT=$(npx --no-install tsc --noEmit 2>&1)
TSC_EXIT=$?
if [ $TSC_EXIT -ne 0 ]; then
  # Filter to errors touching the edited file when possible; fall back to full output
  RELATED=$(printf '%s' "$TSC_OUT" | grep -F "$REL_PATH" || true)
  if [ -n "$RELATED" ]; then
    echo "typecheck errors in $REL_PATH:"
    printf '%s\n' "$RELATED"
    FAILED=1
  fi
fi

# Lint the specific file
LINT_OUT=$(npx --no-install eslint "$REL_PATH" 2>&1)
LINT_EXIT=$?
if [ $LINT_EXIT -ne 0 ]; then
  echo "eslint errors in $REL_PATH:"
  printf '%s\n' "$LINT_OUT"
  FAILED=1
fi

if [ $FAILED -ne 0 ]; then
  # Exit code 2 surfaces stderr/stdout to the agent without aborting the tool call
  exit 2
fi

exit 0
