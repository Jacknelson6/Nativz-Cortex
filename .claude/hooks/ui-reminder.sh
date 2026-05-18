#!/usr/bin/env bash
# UserPromptSubmit hook: inject a short reminder about the UI primitives + tokens.
# Output is added to the agent's context.

cat <<'EOF'
UI work? Check components/ui/COMPONENTS.md and DESIGN_SYSTEM.md before writing components.
EOF

exit 0
