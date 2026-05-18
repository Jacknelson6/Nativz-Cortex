#!/usr/bin/env bash
# PreToolUse hook: block new files under components/ui/ unless user confirms.
# Existing files can still be edited (Edit tool); this guards Write only.

set -u

PAYLOAD=$(cat)

# Extract file_path
FILE_PATH=$(printf '%s' "$PAYLOAD" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only guard components/ui/*.tsx (primitives directory)
case "$FILE_PATH" in
  */components/ui/*.tsx|components/ui/*.tsx)
    ;;
  *)
    exit 0
    ;;
esac

# Allow edits to existing files (Write overwrites, but we want to surface new files only)
if [ -f "$FILE_PATH" ]; then
  exit 0
fi

cat <<EOF >&2
Blocked: refusing to create a new primitive at $FILE_PATH.

components/ui/ is reserved for shared primitives. Before adding a new one:
  1. Check components/ui/COMPONENTS.md to see if an existing primitive fits or can be extended.
  2. If a new primitive is genuinely needed, ask the user first and document it in COMPONENTS.md.

If the file belongs elsewhere (feature folder, page-local component), write it there instead.
EOF

# Exit 2 = block the tool call and feed stderr back to the agent
exit 2
