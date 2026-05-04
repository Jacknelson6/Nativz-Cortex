#!/usr/bin/env bash
# Vercel "Ignored Build Step" helper.
#
# Skip the build when the diff vs the previous commit on this branch only
# touches files that have no effect on the runtime bundle (tests, CI configs,
# Playwright specs). Test-only commits still land on `main` and are visible
# in git history; they just don't trigger a 4-5 min uncached prod rebuild.
#
# How Vercel uses this script:
#   Settings -> Git -> Ignored Build Step -> "bash scripts/vercel-ignore-build.sh"
#   exit 0 -> SKIP the build
#   exit 1 -> RUN  the build (safe default)
#
# To skip a build manually, push a commit message containing "[skip vercel]".
# To force a build that would otherwise be skipped, include "[force vercel]".

set -u

CHANGED=$(git diff --name-only HEAD^ HEAD 2>/dev/null) || {
  echo "Could not diff HEAD^..HEAD (shallow clone or first commit). Building."
  exit 1
}

if [ -z "$CHANGED" ]; then
  echo "No file changes detected. Building (safe default)."
  exit 1
fi

# Manual overrides via commit message.
MSG=$(git log -1 --pretty=%B 2>/dev/null || echo "")
if echo "$MSG" | grep -qiE '\[force vercel\]'; then
  echo "[force vercel] in commit message. Building."
  exit 1
fi
if echo "$MSG" | grep -qiE '\[skip vercel\]'; then
  echo "[skip vercel] in commit message. Skipping build."
  exit 0
fi

# A path is "ignorable" if it matches any of these patterns. Edit with care:
# adding a pattern here means commits touching only those files won't deploy.
NON_RUNTIME=$(echo "$CHANGED" | awk '
  /\.test\.tsx?$/                  { next }   # vitest unit tests
  /^tests\//                       { next }   # playwright e2e specs
  /vitest\.(config|setup)\./       { next }   # vitest config
  /^playwright\.config\./          { next }   # playwright config
  /^\.github\//                    { next }   # actions workflows
  /^docs\//                        { next }   # markdown docs
  /\.md$/                          { next }   # any markdown
  /^\.gitignore$/                  { next }
  /^\.editorconfig$/               { next }
  { print; }                                  # anything else = runtime
')

if [ -z "$NON_RUNTIME" ]; then
  echo "Skipping build: every changed file is non-runtime (tests/docs/CI)."
  echo "$CHANGED" | sed 's/^/  /'
  exit 0
fi

echo "Building: runtime-affecting files changed."
echo "$NON_RUNTIME" | sed 's/^/  /'
exit 1
