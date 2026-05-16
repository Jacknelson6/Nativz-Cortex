# Reliability practices

SKILL.md lists these in headline form. This file is the *why* behind each one — the failure mode each practice is preventing. Use it when reviewing a suite or building one, because the headline alone often does not survive contact with a stubborn flaky test.

## Precise, user-story goals

A goal like "test the checkout flow" generates a different test every time you run it. A goal like "Verify a guest user can complete checkout with a saved credit card and lands on the order confirmation page with the right order ID" generates the same test every time.

What goes wrong without precision: planner hallucinates intermediate steps, assertions drift, the same goal yields different specs on different days, and the reviewer cannot tell whether a re-run "passed" or just took a different path.

Practical fix: review goals with PM + eng before writing the test. A goal should be reviewable in one line. If you cannot fit it on one line, you have two goals.

## Accessibility-first locators

Order of preference: ARIA role + accessible name → label → text → test ID → CSS → XPath. CSS and XPath survive re-skins about as well as a sandcastle survives the tide.

Why this matters more than it sounds: the AOM is the contract between the app and assistive tech. If your locator survives a screen reader, it survives a redesign. If your locator is `.btn-primary:nth-child(3)`, it survives nothing.

When CSS/XPath is genuinely necessary (third-party widgets, shadow DOM with no exposed labels), leave a comment explaining *why*. Future-you will not remember.

## Behavioral assertions across multiple signals

Outcome > exact string > pixel. Examples:

- "An order was created" (DB row + URL + toast) beats "The toast text says 'Order placed!'" beats "This pixel is green."
- "User is logged in" (auth cookie + redirect destination + AOM has user menu) beats "URL is exactly /dashboard."

Multi-signal matters because any single signal lies eventually. A toast appears for 200ms and is gone; a URL changes but the page errored; a button rendered with the wrong handler. Combining two or three independent observations turns a flake into a contradiction you can debug.

## Multi-modal perception

AOM is the primary lens. Vision is the fallback for surfaces where AOM lies or is empty:

- Shadow DOM with sealed roots.
- Canvas and WebGL.
- Dynamic-id components (Tailwind UI auto-gen, React Aria, some Radix).
- A/B variants where DOM differs by bucket.
- Visual regression on charts and media.

Don't reach for vision first. It is slower, more expensive, and noisier. Reach for it when AOM is genuinely insufficient.

## Intelligent flake handling

Re-running a flaky test until it passes is not a fix; it is a way to push the bug into production. What actually works:

- Auto-retry *with smart waits*. A retry that waits for network idle is qualitatively different from a retry that just blindly re-fires.
- Visual thresholds: `maxDiffPixelRatio`, color tolerance, animation freezing.
- Aim for false-positive rate under 20% before scaling out. Under 5% at maturity.
- Track per-test flake rates and quarantine the top offenders into a healing queue rather than letting them poison the green-build signal.

## Self-healing everywhere

Two layers:

1. **Locator-level healing.** When `getByRole('button', { name: 'Submit' })` fails, try `getByRole('button', { name: /submit/i })`, then `getByText('Submit')`, then vision ("click the button labeled Submit"). Codify this as a ladder in the executor, not as bespoke logic per test.
2. **Plan-level healing.** When the entire step makes no sense (the page redirected somewhere unexpected), hand the trace back to the planner with the new observation and let it replan.

Where this earns its keep: agentic coding velocity. Five PRs a day means five tweaks to UI strings, ids, layouts. A locator-healing executor absorbs that churn; a brittle one breaks every morning.

## Sandbox + idempotency

Every test seeds and tears down its own fixtures via APIs or factories. Never share state between specs. Never depend on yesterday's seed data still being there.

Why this is non-negotiable for parallelization: shared state means crews race. Race means flake. Flake means re-runs. Re-runs mean the suite stops being trustworthy.

In this repo, the pattern landed in `tests/cup-03-review.spec.ts`: the test seeds its own drop + contact, runs the full lifecycle, and tears everything down in `finally`. Every E2E that touches DB rows should follow that shape. See [playwright-patterns.md](playwright-patterns.md).

## Human oversight loop

Treat the suite as a product, not a script. That means:

- Curated eval set with known-good and known-bad fixtures. Run it on every suite change.
- Periodic trace review: a human watches 5–10 traces a week, looking for "the agent did the right thing for the wrong reason."
- Calibration. When the agent says "this looks fine," does it actually correlate with no bugs in prod? If not, raise the bar on assertions.

The failure mode here is set-and-forget. An agentic suite without human oversight slowly drifts into a suite that always passes and catches nothing.

## Prompt engineering as product specs

The planner and generator prompts are not throwaway strings. They are the spec for how every test in your suite gets written. Treat them like code: review, version, lint.

Include in the planner/generator prompts:

- House style for the test suite (locator preferences, naming conventions, assertion patterns).
- The codebase's domain model: route names, page-object metadata, common fixtures.
- Explicit no-duplication directive ("before writing a new test, check whether an existing one covers this").
- Forbidden patterns (e.g., "never use `waitForTimeout`").

When the suite is misbehaving, fix the prompt before fixing individual tests.

## Start small and measure

Pilot on 3 to 5 highest-value flows. Measure before scaling:

- False-positive rate (flaky-but-code-is-fine failures).
- Maintenance hours saved vs the pre-agentic baseline.
- Coverage delta over time.
- Mean time to detect real bugs.

If the pilot does not move these numbers, expanding will not save it. The temptation is to scale to "full coverage" before the foundation works, which guarantees a suite nobody trusts.

## When to break a rule

These are not commandments. The point of stating the *why* is so you can judge edge cases. A test for a canvas-heavy dashboard will lean harder on vision than on AOM. A test for a brand-new feature with no DB schema may need to mock more than usual. A throwaway smoke test for a one-day spike does not need a healer.

Default to the practices. Deviate with a reason and leave a comment so the next reader understands why.
