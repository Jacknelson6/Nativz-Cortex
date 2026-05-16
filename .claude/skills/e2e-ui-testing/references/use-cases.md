# Where agentic E2E earns its keep

SKILL.md lists the surfaces where agentic testing dramatically outperforms a fixed script. This file goes one level deeper: for each surface, what the agent actually does differently, and a prompt scaffold you can adapt.

## High-churn / A/B-tested UIs

**Why agentic wins:** the UI changes faster than humans can rewrite assertions. A traditional suite is in permanent triage. An agentic suite re-locates by intent ("the primary CTA on the pricing page") rather than by exact selector.

**What the agent does differently:**
- Re-derives locators from accessibility roles + visible names each run.
- Treats minor text drift ("Start free trial" → "Try it free") as a non-event when the surrounding context still matches the intent.
- Detects A/B variant via observed DOM differences and adapts the plan rather than failing.

**Prompt scaffold (planner):**
```
Goal: Verify a logged-out visitor can reach the pricing page from the homepage,
click the primary call-to-action for the highest tier, and land on a checkout
page scoped to that tier.

The site runs A/B variants on hero copy and CTA placement. Identify the primary
CTA by *role* and *destination*, not exact text. Capture the variant ID from
the cookie or AOM if present so failures are diagnosable by variant.
```

## Accessibility testing

**Why agentic wins:** AOM snapshots are already part of perception. Adding a11y is free.

**What the agent does:**
- Asserts that every interactive element has an accessible name.
- Walks the page with keyboard-only navigation, recording focus order and trapping.
- Runs an axe-core pass per page and surfaces criticals.
- Optionally drives the app through VoiceOver / NVDA via OS automation for high-stakes flows.

**Prompt scaffold:**
```
Goal: Verify the checkout form is fully usable with keyboard only and a screen
reader. Specifically: every input has an accessible label, tab order matches
visual order, error states are announced, and the submit button is reachable
without a mouse.

Report: AOM snapshot at form entry, focus order, any axe-core criticals, and a
screenshot of the page after each focus step.
```

## Visual + layout regression

**Why agentic wins:** classical pixel diffs explode on font hinting, anti-aliasing, and animation. A vision model classifies *meaningful* diffs.

**What the agent does:**
- Screenshots each state with animations frozen and fonts pinned.
- Sends "before" + "after" to the vision model with a question, e.g. "Is the call-to-action visually prominent in both? Has the page hierarchy changed?"
- Returns structured verdicts (no-change / cosmetic-change / structural-change) rather than a pixel delta.

**Prompt scaffold (vision verifier):**
```
You are reviewing two screenshots of the same page. Identify:
1. Whether any user-visible content has been added, removed, or repositioned.
2. Whether the primary call-to-action is still in the visual hero.
3. Whether the page hierarchy (header / nav / main / footer) is intact.

Classify the diff: none, cosmetic, structural. Report which.
```

## Multimodal apps (dashboards, canvas, video)

**Why agentic wins:** AOM is blind here. Vision verifies chart correctness, media playback, color encoding, and so on.

**What the agent does:**
- Loads a known fixture (e.g. last week's analytics).
- Asks vision: "Is the bar chart sorted descending? Does the legend match the data series? Are any tooltips truncated?"
- For video: scrubs to specific timestamps, asserts a frame matches a reference, or that captions are present.

**Prompt scaffold:**
```
Goal: After loading the /analytics page with fixture "fixture-2026-04-week",
verify the engagement-rate chart matches the snapshot in
tests/fixtures/analytics-week-snapshot.png. Specifically the ordering of bars
and the y-axis range. Cosmetic differences (font, border) are not failures.
```

## Mobile / cross-platform parity

**Why agentic wins:** the same user-story goal can drive iOS, Android, and web with shared planner output and per-platform executors.

**What the agent does:**
- Planner emits steps in terms of intent ("tap the share button").
- Per-platform executor maps intent to the platform locator (Appium accessibility id on iOS, content-description on Android, role on web).
- Vision is the universal fallback when accessibility metadata is missing on a given platform.

## Performance + auth smoke

**Why agentic wins:** an agent notices "this took 8 seconds" and "I was redirected to /login unexpectedly" without a dedicated harness, because perception already includes timing and URL.

**What the agent does:**
- Captures per-step duration from the trace.
- Flags steps whose duration exceeds a baseline by Nx.
- Detects unexpected redirects (auth bounce, error page) and reports them as a distinct failure class.

## Agentic coding integration

**Why agentic wins:** the test agent and the coding agent share a vocabulary. When the test fails, the structured trace + failure summary can be fed straight back to the coder as context.

**The loop:**
1. AI coder ships a PR.
2. Test agent runs the relevant E2E flows in a sandbox against the PR's preview deploy.
3. On failure, the test agent emits a structured `FailureReport` (the offending step, the observation that violated the assertion, the trace ref, and a one-sentence root cause hypothesis).
4. The coder reads the report and proposes a fix or asks for human review.

**FailureReport schema:**
```jsonc
{
  "goal": "string",
  "failingStep": { "intent": "string", "expected": "string", "observed": "string" },
  "rootCauseHypothesis": "string",
  "evidence": ["trace://...", "screenshot://..."],
  "confidence": 0.0
}
```

Keep confidence honest. A low-confidence hypothesis is fine; a hallucinated high-confidence one poisons the loop.

## Exploratory testing

**Why agentic wins:** humans miss edge cases because they walk the happy path. An agent with a goal like "find a way to break the org-settings flow" will try odd inputs, race conditions, and back-button shenanigans without getting bored.

**Prompt scaffold:**
```
Goal: As a non-admin user, find any path that lets you modify organization
settings (members, billing, integrations). Try the obvious UI buttons, then
direct URL navigation, then API endpoints discovered via the network panel.

Report any successful or partially-successful path, with the trace.
```

This is where the suite catches the bugs humans never thought to write a test for. It is also where you most want a healer-reviewer in the loop, because the exploration trace gets long.

## A note on cost

The agentic loop is more expensive per run than a deterministic script. The trade is: lower maintenance + better coverage on dynamic surfaces, in exchange for more LLM tokens and slower individual runs.

When the surface is stable and high-volume (the login form, the checkout happy path), prefer the code-emit pattern: have the generator produce a Playwright spec, review it, and run it deterministically without LLM cost. When the surface is dynamic or low-volume, lean into the step-emit pattern. Most production setups need both.
