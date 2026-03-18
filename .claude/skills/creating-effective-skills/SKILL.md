---
name: creating-effective-skills
description: Use when creating, designing, or improving Claude Code skills — covers skill taxonomy, architecture patterns, progressive disclosure, description optimization, gotchas sections, distribution strategies, and when to use scripts/data/hooks within skills. Also use when deciding what type of skill to build, how to structure skill folders, or how to distribute skills across a team.
---

# Creating Effective Skills

Based on lessons from Anthropic's internal use of hundreds of skills in Claude Code.

## Core Insight

A skill is a **folder**, not just a markdown file. The most effective skills use folder structure, scripts, assets, and configuration creatively. Think of the entire filesystem as context engineering.

## Skill Taxonomy

Before writing, identify which category your skill fits. The best skills fit cleanly into one; confusing skills straddle several.

| Category | Purpose | Examples |
|----------|---------|----------|
| **Library & API Reference** | How to correctly use a library, CLI, or SDK | Internal billing lib, design system guide, CLI wrapper docs |
| **Product Verification** | Test/verify that code works correctly | Signup flow driver, checkout verifier, headless browser tests |
| **Data Fetching & Analysis** | Connect to data/monitoring stacks | Funnel queries, cohort comparison, Grafana dashboard lookup |
| **Business Process Automation** | Automate repetitive workflows | Standup post, ticket creation, weekly recap |
| **Code Scaffolding & Templates** | Generate framework boilerplate | New service scaffold, migration template, app bootstrap |
| **Code Quality & Review** | Enforce code quality standards | Adversarial review, code style enforcement, testing practices |
| **CI/CD & Deployment** | Fetch, push, deploy code | PR babysitter, deploy pipeline, cherry-pick workflow |
| **Runbooks & Operations** | Investigate symptoms, produce reports | Service debugging, oncall runner, log correlator, orphan cleanup |

## Design Principles

### 1. Don't State the Obvious

Claude already knows a lot about coding. Focus on information that pushes Claude **out of its normal way of thinking** — your org's specific patterns, edge cases, and opinions that differ from defaults.

### 2. Build a Gotchas Section

The highest-signal content in any skill. Build this up over time from actual failure points Claude hits. Update the skill as new gotchas emerge.

```markdown
## Gotchas
- Our billing API returns 200 even on validation errors — check `response.errors` array
- The `user_id` in events table is NOT the canonical one — join through `identity_mapping` first
- Rate limit is 10/s per API key but 2/s per user — the per-user limit is what you'll hit
```

### 3. Progressive Disclosure via Filesystem

Use the folder structure as layered context. Tell Claude what files exist and when to read them.

```
my-skill/
├── SKILL.md              # Overview + when to use (~200-500 lines)
├── references/
│   ├── api.md            # Detailed function signatures (read when implementing)
│   ├── gotchas.md        # Edge cases by domain (read when hitting errors)
│   └── examples/         # Working code snippets (read when generating)
├── scripts/
│   ├── fetch-data.py     # Reusable data fetcher (execute, don't read)
│   └── validate.sh       # Output validator (execute after generation)
├── assets/
│   └── template.md       # Output template (copy and fill in)
└── config.json           # User-specific settings (generated on first run)
```

**Key patterns:**
- SKILL.md points to reference files with guidance on **when** to read them
- Scripts can be executed without loading into context
- Templates in `assets/` for output formats
- For large reference files (>300 lines), include a table of contents

### 4. Avoid Railroading

Be specific about **what** Claude should know, but flexible about **how** it applies the knowledge. Overly rigid instructions break when the situation doesn't match your assumptions.

```markdown
# ❌ Too rigid
Step 1: Run `npm test`. Step 2: If it fails, check line 42. Step 3: Fix the import.

# ✅ Informative but flexible
The test suite has known issues with circular imports in the auth module.
When tests fail with "Cannot access X before initialization", the root cause
is usually a circular dependency — check the import chain.
```

### 5. The Description Field Is for the Model

Claude scans skill descriptions to decide which to invoke. The description is a **triggering mechanism**, not a summary.

```yaml
# ❌ BAD: Summarizes what it does
description: Formats standup posts by aggregating tickets, GitHub activity, and Slack messages

# ✅ GOOD: Describes when to trigger (slightly "pushy")
description: Use when writing standups, daily updates, or status reports. Also use when
  the user mentions standup, daily sync, status update, or wants to summarize recent work
  activity, even if they don't say "standup" explicitly.
```

**Make descriptions slightly pushy** — Claude tends to under-trigger skills. Include adjacent phrases and contexts where the skill would help.

### 6. Setup & Configuration

Some skills need user-specific config. Store it in a `config.json` in the skill directory:

```markdown
## First Run

If `config.json` doesn't exist, ask the user:
1. Which Slack channel for posting? (use AskUserQuestion for structured input)
2. What's your GitHub username?
3. Preferred timezone?

Save responses to `config.json` and reference in future runs.
```

### 7. Memory & Data Storage

Skills can maintain state across invocations:

- **Append-only log**: `standups.log` — Claude reads history to know what changed
- **JSON state**: `state.json` — track progress, previous results
- **SQLite**: For complex queryable data

**Important**: Data in the skill directory may be deleted on upgrade. Use `${CLAUDE_PLUGIN_DATA}` for stable storage.

### 8. Bundle Scripts & Libraries

Give Claude code to compose rather than reconstruct. If test runs show all subagents independently writing similar helper scripts, bundle that script in `scripts/`.

```markdown
## Available Scripts

- `scripts/fetch_events.py` — Fetches events from our warehouse. Pass --start-date and --end-date.
- `scripts/build_chart.py` — Generates chart from CSV. Supports bar, line, area.

Use these directly. Generate new scripts only for analysis logic specific to the current task.
```

### 9. On-Demand Hooks

Skills can register hooks that activate only when invoked and last for the session:

- **/careful** — blocks `rm -rf`, `DROP TABLE`, force-push via PreToolUse Bash matcher
- **/freeze** — blocks Edit/Write outside a specific directory

Use for opinionated guardrails you don't want running all the time.

## Writing Tips

### Explain the Why, Not Just the What

Today's LLMs respond better to understanding motivation than to rigid `MUST`/`NEVER` directives:

```markdown
# ❌ Rigid
You MUST ALWAYS use the v2 endpoint. NEVER use v1.

# ✅ Explains why
Use the v2 endpoint — v1 doesn't support pagination and will silently truncate
results over 100 items, which has caused data loss in production reports.
```

### One Excellent Example Beats Many Mediocre Ones

Don't provide examples in 5 languages. One complete, well-commented, runnable example that shows the pattern clearly is enough.

### Keep SKILL.md Under 500 Lines

If approaching this limit, split into reference files with clear pointers about what to read next.

## Distribution

### In-Repo (small teams, few repos)
Check skills into `.claude/skills/` in your repo. Every checked-in skill adds to model context, so be deliberate.

### Plugin Marketplace (scaling teams)
For larger orgs, use a plugin marketplace so team members choose which to install.

**Curation process:**
1. Author uploads skill to a sandbox folder in GitHub
2. Points people to it in Slack
3. Once it has traction (author's judgment), PR to move into marketplace

### Composing Skills
Reference other skills by name — the model invokes them if installed:
```markdown
After generating the report, use the **file-upload** skill to publish it.
```

### Measuring Skills
Use a PreToolUse hook to log skill usage. Track:
- Which skills are popular
- Which are under-triggering vs. expectations
- Which need description optimization

## Self-Improving Mechanisms

This skill accumulates knowledge over time through three files:

### 1. `config.json` — Your Preferences
On first use, Claude asks for your preferences (preferred skill categories, distribution method, default location). Stored so future sessions don't re-ask.

### 2. `creation-log.md` — Skill Creation History
After each skill creation session, Claude appends an entry: what was built, what category, what worked, what didn't. Future sessions read this to spot patterns in your skill-building and avoid repeating mistakes.

### 3. `references/gotchas.md` — Accumulated Failures
When a skill doesn't trigger correctly, produces poor results, or hits an unexpected edge case, Claude adds the failure to this file with symptom, root cause, and fix. Read this before every new skill creation.

**Maintenance:** Before creating a new skill, read `creation-log.md` and `references/gotchas.md`. After creating a skill, append to both if anything noteworthy happened.

## Quick Reference: Skill Quality Checklist

- [ ] Fits cleanly into one taxonomy category
- [ ] Description is a trigger mechanism, not a summary
- [ ] Description is slightly "pushy" to prevent under-triggering
- [ ] Has a Gotchas section (or plan to build one)
- [ ] Uses progressive disclosure (reference files for details)
- [ ] Explains **why**, not just **what**
- [ ] Doesn't state things Claude already knows
- [ ] Flexible enough to adapt to varied situations
- [ ] Under 500 lines (splits details to reference files)
- [ ] Scripts bundled for repeated boilerplate
- [ ] Setup/config pattern if user-specific info needed
