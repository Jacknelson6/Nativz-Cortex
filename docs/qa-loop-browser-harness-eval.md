# qa-loop × browser-harness — evaluation

**Date:** 2026-04-20
**Subject:** Should the [qa-loop](../.claude/skills/qa-loop/SKILL.md) skill migrate from Playwright MCP to [browser-use/browser-harness](https://github.com/browser-use/browser-harness) to support a Self-Referential Loop (SRL)?
**Recommendation:** **Hybrid. Keep Playwright MCP as the default runner; add browser-harness as an optional deep-dive + parallel-SRL tool.** Do not migrate.

---

## TL;DR (one paragraph)

Browser-harness is a 592-line Python harness that connects an LLM directly to a real Chrome instance via CDP. Its killer feature for us is that it shares Jack's already-running Chrome session — the magic-link.ts workaround disappears for local QA. Its *second* killer feature is free concurrent cloud browsers (3 at a time), which makes fan-out SRL trivially parallel. But the tradeoffs are real: Python, not TypeScript; invoked via heredoc, not slash commands; agent-editable helpers.py requires a different mental model than the fixed MCP tool surface. **Don't rewrite the qa-loop skill.** Keep Playwright MCP for the standard crawl — it already works, it's invokable via `/qa`, and it writes to `.playwright-mcp/` fine. Add a second skill (`qa-loop-deep` or similar) that uses browser-harness for two specific scenarios: (1) investigating a bug in Jack's real browser with his real session, and (2) running parallel SRL fan-outs against remote cloud browsers.

---

## The three axes

### 1. Integration effort — **HIGH**

Swapping is not a 1:1 function replacement. Different axes:

| | Playwright MCP (current) | browser-harness |
|---|---|---|
| Language | TypeScript (via MCP) | Python |
| Invocation | `browser_navigate(...)` tool call | `browser-harness <<'PY' ... PY` heredoc |
| Function surface | Fixed (10-ish MCP tools) | Agent-editable helpers.py (starts at ~15 helpers, grows) |
| Mental model | Call the tool that exists | Write the helper you need |
| Slash-command-friendly | Yes (`/qa`) | No (requires subshell Python) |

The harness *philosophy* — "agent writes what's missing, mid-task" — is a fundamentally different paradigm. The Playwright MCP gives you a canonical API and you work within it. Browser-harness gives you a starter toolkit and expects you to edit it. Great for long-tail browser automation (logging into arbitrary sites, filling forms on Amazon). Overkill for Cortex's QA crawl where the routes and interactions are known.

**Verdict:** Full migration = ~2-3 days of skill rewriting + validation. Not worth it when the current skill works.

### 2. Session reuse — **browser-harness wins**

This is the decisive advantage for local QA:

- **Playwright MCP:** each run = fresh browser context, no cookies, no session. Requires `scripts/magic-link.ts` to mint a Supabase magic link every run.
- **browser-harness:** connects to the user's already-running Chrome via CDP. If Jack is logged in to Cortex, the harness immediately is too. `new_tab("http://localhost:3001/admin/analytics")` lands on an authed page with zero extra setup.

For **cloud/headless use**, the harness supports profile sync (`list_cloud_profiles()`, `sync_local_profile()`) so you can push Jack's login state to a cloud browser and reuse it across remote agent runs. The magic-link.ts helper still has a role here as a Plan B when profile-sync isn't viable (e.g. pure CI), but the day-to-day friction disappears.

**Verdict:** If local session reuse matters (it does), browser-harness is strictly better for local QA.

### 3. Regression capture — **tie, both need an index layer**

Neither tool gives structured regression-detection out of the box.

| | Playwright MCP | browser-harness |
|---|---|---|
| Screenshot | `browser_take_screenshot` → `.playwright-mcp/` | `screenshot(path)` → caller-controlled path |
| Console | `browser_console_messages` | `cdp("Runtime.enable")` + `drain_events()` |
| Network | `browser_network_requests` (clean API) | `cdp("Network.enable")` + raw CDP events |
| DOM snapshot | `browser_snapshot` (accessibility tree) | `cdp("DOM.getDocument")` (raw tree) |
| Visual diff | No | No |

Both capture the same inputs; neither indexes them for "this page rendered differently from last run." If we want true regression detection, we're building a side-layer either way — probably:

1. Hash-normalize each screenshot (strip timestamps, dynamic IDs).
2. Store per-route snapshots + console + network by commit SHA.
3. Diff current run vs. last-green-run for the same SHA set.

That layer works equally well above either runner. Not a reason to pick one.

**Verdict:** Neutral. The diff layer is ours to build regardless.

---

## Recommendation: hybrid, not migration

### Keep Playwright MCP as the default qa-loop runner

The [qa-loop](../.claude/skills/qa-loop/SKILL.md) skill stays as-is. Reasons:

- Invokable as `/qa` — the slash-command ergonomics are valuable.
- TypeScript + MCP tool surface is consistent with the rest of the project.
- The skill's page-crawl routes + interaction tests are already enumerated.
- `scripts/magic-link.ts` + a quick auth prelude handle the session problem acceptably.
- No reason to rewrite working code.

### Add browser-harness as a second, specialized skill

Name it something like `qa-loop-deep` or `browser-harness-deep` (or just install it as its own skill under `.claude/skills/browser-harness/` per the project's upstream convention). Use it for:

**Scenario A — "Reproduce this bug in Jack's real browser."**
When Playwright QA finds a bug that might depend on session state (certain extensions, specific client data, oauth tokens), drop into browser-harness, connect to Jack's actual Chrome, and reproduce with his real state. No auth setup needed.

**Scenario B — Parallel SRL fan-out.**
This is the real win. Spin up 3 remote cloud browsers (`start_remote_daemon("agent-1")`, `-2`, `-3`), fan out sub-agents:
- Agent 1: crawl `/admin/*` routes
- Agent 2: crawl `/portal/*` routes
- Agent 3: crawl AC brand-mode variants of both

Each runs its own isolated cloud Chrome. Parent agent collects results, dedupes, files fixes. The Playwright MCP is single-browser — this pattern isn't possible without harness.

### Concrete next steps (if we decide to proceed)

1. **Install browser-harness** — per its `install.md`, it's a one-time clone + `uv run` setup, plus ticking the remote-debugging checkbox in Chrome once.
2. **Create `.claude/skills/qa-loop-deep/SKILL.md`** — thin wrapper that documents when to reach for it (scenarios A + B above), with pointers to `helpers.py` patterns. Do not duplicate the standard qa-loop crawl.
3. **Sign up for cloud API key** — free tier is 3 concurrent browsers, sufficient for the fan-out pattern above.
4. **Build the regression-index layer** — hash-normalized screenshots + console + network by route and SHA, stored in `qa-results/`. This work is independent of which runner we use and benefits both.
5. **Revisit the magic-link.ts role** — keep it for CI / headless fallback, but pull its `predev`-style usage from local QA.

### What NOT to do

- Don't rewrite the existing qa-loop skill in Python.
- Don't make browser-harness the default. It's heavier (requires Chrome CDP setup, Python env, API key for cloud tier) and its agent-editable helpers.py paradigm fights the "just use /qa" ergonomics.
- Don't skip the regression-index layer just because the runner captures screenshots. Screenshots without structured diffs are just an archive.

---

## Open questions for Jack

1. Is **parallel SRL fan-out** valuable enough to justify setting up browser-harness + a cloud API key? If QA is mostly single-pass, the answer is "not yet." If we expect to crawl the full portal + admin + shared-link universe on every merge, yes.
2. Would you use the "reproduce-in-Jack's-real-browser" flow, or is that a rare edge case? If rare, we might skip scenario A and only wire harness for fan-out.
3. Is the regression-index layer (structured screenshot/console/network diffs) a priority item, or is the current "eyeball screenshots" flow fine for now?

Answers drive whether this is a "do now" project or a "park until the pain shows up" one.
