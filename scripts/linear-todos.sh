#!/usr/bin/env bash
# Session-start helper: prints a compact summary of open Linear issues
# assigned to the current user (filtered to states that aren't
# completed / canceled / backlog). Output becomes the session's
# additionalContext via the SessionStart hook in .claude/settings.json.
#
# Silent exit when:
#   - LINEAR_API_KEY isn't set (.env.local or env)
#   - Linear API is unreachable / errors
#   - Viewer has zero actionable issues

set -u

# Resolve repo root regardless of caller's cwd.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

KEY="${LINEAR_API_KEY:-}"
if [ -z "$KEY" ] && [ -f "$repo_root/.env.local" ]; then
  KEY="$(grep -m1 '^LINEAR_API_KEY=' "$repo_root/.env.local" | cut -d= -f2- | tr -d '\r\n')"
fi

[ -z "$KEY" ] && exit 0

resp="$(curl -sf -X POST https://api.linear.app/graphql \
  -H "Authorization: $KEY" \
  -H "Content-Type: application/json" \
  --max-time 8 \
  -d '{"query":"query { viewer { assignedIssues(first: 50) { nodes { identifier title priority state { name type } } } } }"}' 2>/dev/null)" || exit 0

# Emit the formatted summary. Silent on empty / error — Python's stderr is
# swallowed so the hook never injects garbage into context.
python3 - "$resp" <<'PY' 2>/dev/null || true
import json, sys

try:
    resp = json.loads(sys.argv[1])
except Exception:
    sys.exit(0)

nodes = (
    resp.get("data", {})
        .get("viewer", {})
        .get("assignedIssues", {})
        .get("nodes", []) or []
)

# Only surface issues in actionable states (Todo / In Progress / In Review).
# Backlog is intentionally hidden — if it matters, it should be in Todo.
ACTIONABLE = {"unstarted", "started"}
open_issues = [n for n in nodes if (n.get("state") or {}).get("type") in ACTIONABLE]
if not open_issues:
    sys.exit(0)

# Urgent first, then High, Medium, Low, Unprioritised.
prio_order = {1: 1, 2: 2, 3: 3, 4: 4, 0: 99}
prio_label = {1: "Urgent", 2: "High", 3: "Medium", 4: "Low", 0: "—"}
open_issues.sort(key=lambda n: (prio_order.get(n.get("priority", 0), 99), n.get("identifier", "")))

print(f"## Linear — your open issues ({len(open_issues)})\n")
for n in open_issues:
    ident = n.get("identifier", "")
    title = n.get("title", "")
    pri = prio_label.get(n.get("priority", 0), "—")
    state = (n.get("state") or {}).get("name", "")
    print(f"- **{ident}** · {pri} · {state} — {title}")

print(
    "\nAt the start of this session, ask Jack which issue to work on "
    "(or whether he has something else in mind). Don't pick one unilaterally."
)
PY
