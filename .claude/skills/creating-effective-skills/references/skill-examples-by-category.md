# Skill Examples by Category

Detailed examples and patterns for each skill category. Read this when you need inspiration for a specific type of skill.

## Table of Contents
1. [Library & API Reference](#1-library--api-reference)
2. [Product Verification](#2-product-verification)
3. [Data Fetching & Analysis](#3-data-fetching--analysis)
4. [Business Process Automation](#4-business-process-automation)
5. [Code Scaffolding & Templates](#5-code-scaffolding--templates)
6. [Code Quality & Review](#6-code-quality--review)
7. [CI/CD & Deployment](#7-cicd--deployment)
8. [Runbooks & Operations](#8-runbooks--operations)

---

## 1. Library & API Reference

**What makes these effective:** Include a folder of reference code snippets and a list of gotchas. Focus on edge cases and footguns Claude doesn't know about.

**Example structure:**
```
billing-lib/
├── SKILL.md            # Overview, when to use, common patterns
├── references/
│   ├── api.md          # Function signatures, return types
│   ├── gotchas.md      # Known edge cases, footguns
│   └── examples/
│       ├── charge.ts   # Working charge example
│       └── refund.ts   # Refund with partial amounts
```

**Key patterns:**
- Include code snippets Claude can directly adapt
- Document things that differ from what Claude would guess (e.g., "returns 200 even on validation errors")
- List which versions of the API are current vs deprecated

---

## 2. Product Verification

**What makes these effective:** Pair with external tools (Playwright, tmux). Include scripts for programmatic assertions. Worth investing a week of engineering time to make excellent.

**Advanced techniques:**
- Have Claude record video of its output for review
- Enforce programmatic assertions on state at each step
- Include helper scripts for common verification patterns

**Example structure:**
```
signup-flow-driver/
├── SKILL.md              # Flow description, steps, expected states
├── scripts/
│   ├── drive-signup.ts   # Playwright script for signup flow
│   ├── verify-email.ts   # Check email verification state
│   └── assert-state.ts   # Validate DB state at each step
```

---

## 3. Data Fetching & Analysis

**What makes these effective:** Include credentials/config, specific dashboard IDs, table names, and common query workflows. Give Claude composable helper functions.

**Key insight:** Give Claude a library of data-fetching functions. Claude then generates scripts on the fly to compose these for complex analysis like "What happened on Tuesday?"

**Example structure:**
```
funnel-query/
├── SKILL.md              # Which events to join, canonical user_id table
├── scripts/
│   ├── fetch_events.py   # Helper functions for event source
│   ├── cohort_utils.py   # Cohort comparison helpers
│   └── chart_builder.py  # Visualization from query results
├── references/
│   └── schema.md         # Table schemas, column definitions
```

---

## 4. Business Process Automation

**What makes these effective:** Usually simple instructions but complex dependencies on other skills/MCPs. Save previous results in log files so the model stays consistent across invocations.

**Example structure:**
```
standup-post/
├── SKILL.md              # Format, channels, what to aggregate
├── config.json           # User-specific: Slack channel, timezone
├── standups.log          # Append-only history of past standups
```

**Key pattern:** The log file means next time Claude runs, it reads its own history and knows what changed since yesterday.

---

## 5. Code Scaffolding & Templates

**What makes these effective:** Combine scripts that can be composed. Especially useful when scaffolding has natural language requirements that can't be purely covered by code.

**Example structure:**
```
new-service/
├── SKILL.md              # When to scaffold, naming conventions, integration points
├── scripts/
│   └── scaffold.sh       # Generates directory structure
├── assets/
│   ├── service.template  # Service file template
│   ├── config.template   # Config file template
│   └── test.template     # Test file template
```

---

## 6. Code Quality & Review

**What makes these effective:** Include deterministic scripts for maximum robustness. Consider running automatically via hooks or in GitHub Actions.

**Example: Adversarial Review**
Spawns a fresh-eyes subagent to critique, implements fixes, iterates until findings degrade to nitpicks.

**Example: Code Style**
Enforces styles that Claude doesn't do well by default — your org's specific conventions, naming patterns, import ordering.

---

## 7. CI/CD & Deployment

**What makes these effective:** Reference other skills for data collection. Handle the full lifecycle including error recovery.

**Example: PR Babysitter**
Monitors PR → retries flaky CI → resolves merge conflicts → enables auto-merge. Saves logs of actions taken.

**Example: Deploy Pipeline**
Build → smoke test → gradual traffic rollout with error-rate comparison → auto-rollback on regression.

---

## 8. Runbooks & Operations

**What makes these effective:** Map symptoms to tools to query patterns. Include guardrails for destructive actions with confirmation steps.

**Example: Service Debugging**
Maps symptoms → diagnostic tools → query patterns for your highest-traffic services.

**Example: Orphan Cleanup**
Finds orphaned resources → posts to Slack for visibility → soak period → user confirms → cascading cleanup. The soak period and confirmation are critical guardrails.

**Key pattern for destructive ops:** Always include a discovery phase (find the problem), a notification phase (tell someone), a waiting phase (soak period), and a confirmation phase (human approval) before any destructive action.
