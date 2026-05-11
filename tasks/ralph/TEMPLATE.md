# TEMPLATE for PRD.md and progress.txt

Copy when writing a new PRD. Replace `<...>` everywhere. Keep section order. Trim sections that genuinely don't apply (e.g. no LLM call → drop the Prompts section).

---

# PRD: <Series> · <slug> · <Short title>

> <Series>/<NN> · <draft date>

## Purpose & Value
<2-4 sentences: what this PRD does and the strategic value it adds.>

## Problem
<2-4 sentences: what specifically is broken or missing.>

## Primary User
<role + situation, e.g. "Strategist preparing a client call.">

## SMART Goals
- <measurable goal 1>
- <measurable goal 2>
- ...

## User Stories
- **US-01** — As a <role>, I can <action> so that <value>.
- ...

## In Scope
- <bulleted file/component/cron items>

## Out of Scope
- <bulleted, explicit>

## Resolved Decisions
- **D-01** — <Question.> **→ <Decision.>** Rationale: <one sentence.>
- ...
(no Open Questions; decide them all here or push to a follow-up PRD.)

## Data Model

### Migration <NNN>_<slug>.sql
```sql
-- full SQL: CREATE TABLE, indexes, ALTER, RLS policies
```

(Skip if no schema change. Reference existing tables in CONTEXT.md instead.)

## API Contracts

### <METHOD> /api/<path>
Auth: <admin | portal | cron-secret | public>
Request:
```ts
const RequestSchema = z.object({ ... });
```
Response (200):
```ts
{ ... }
```
Errors: 400 invalid input, 401 unauthorized, 404 not found, 500 server.

(Repeat per route.)

## LLM Prompts

### Prompt: <name>
Model: `anthropic/claude-sonnet-4.5` (or `google/gemini-2.5-flash` for video)
Temperature: <value>
Max tokens: <value>

System:
```
<exact text>
```

User template:
```
<exact text with {placeholders}>
```

Output schema:
```ts
const OutputSchema = z.object({ ... });
```

Banned topics (if applicable):
- <list>

## UI Components

### `<path/to/component.tsx>`
Purpose: <one sentence>
Props:
```ts
type Props = { ... };
```
Layout: <terse, e.g. "9:16 card, overlay bottom 40% gradient, title top, descriptor below">
Copy:
- Title: "<exact text>"
- CTA: "<exact text>"
States: loading, empty, error, success
Tokens: `bg-surface`, `accent-text`, etc.

(Repeat per component.)

## File Map

Create:
- `<path>` — <one-line purpose>

Modify:
- `<path>` — <what changes>

## Env Vars

New:
- `<NAME>` — <purpose, where consumed>

(None if reusing existing.)

## Edge Cases
- <bulleted; what could break, what we do about it>

## Test Plan
- Unit: <files + key cases>
- Integration: <if any>
- E2E (Playwright): <if any>
- Manual QA: <bullets a human runs>

## Architecture Wiring
<2-5 sentences: how this PRD plugs into existing patterns from CONTEXT.md>

## Done When
- <binary check 1>
- <binary check 2>
- ...

---

# progress.txt template

```
# Progress: <slug>
# Read CONTEXT.md + PRD.md before each task. Update this file after each task.

[ ] T01: <imperative title>
    Files: <comma-separated>
    Acceptance: <one sentence binary>
    Verify: <commands>
    Notes:

[ ] T02: ...

# Done When (final verify gate)
[ ] T<NN>: Smoke-check PRD's Done When checklist
    Acceptance: every bullet in PRD's Done When section passes
    Notes:
```

Task title style:
- imperative, no period
- ≤ 60 chars
- start with a verb: Create, Add, Wire, Render, Seed, Migrate, Refactor, Test, Verify
