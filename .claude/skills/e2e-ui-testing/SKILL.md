---
name: e2e-ui-testing
description: Best practices for building agentic E2E UI testing systems. Use this skill whenever the user is designing, extending, or debugging end-to-end UI tests (Playwright, Appium, vision-based), setting up self-healing or multi-agent test orchestration, planning E2E CI coverage, investigating flakiness, or asking how to make a test suite resilient to UI churn. Trigger even if the user only mentions "Playwright tests", "flaky tests", "visual regression", "self-healing tests", or "test agents", since those often mean an E2E system is being built or extended.
---

# Agentic E2E UI Testing

E2E suites built on rigid scripts break the moment the UI changes. The system this skill describes treats testing as outcome-driven exploration: an agent (or set of agents) is given a user-story goal, perceives the UI through multiple channels, reasons about next steps, and verifies behavior rather than DOM structure. The payoff is coverage that survives agentic coding velocity without daily script maintenance.

Use this skill whenever you are touching E2E test infrastructure, writing or generating tests, debugging flakiness, designing self-healing strategies, or evaluating tools (Playwright, mabl, QA Wolf, TesterArmy, custom multi-agent rigs).

## Core principles (read these first)

1. **Behavioral over structural.** Verify outcomes ("toast appears", "cart total updates", "auth redirect lands on /login?next=…"), not exact DOM/pixel state. Pixel-perfect assertions are the #1 source of false positives.
2. **Accessibility-first locators.** Prefer ARIA roles, accessible names, and accessibility-tree snapshots (`getByRole`, `getByLabel`, `getByText`). They are an order of magnitude more stable than CSS or XPath because they survive re-skins.
3. **Hybrid execution.** Run deterministic code (Playwright scripts) for the happy path and fall back to vision/LLM reasoning only when the deterministic path stalls. This keeps cost and flake low while still adapting to dynamic UI.
4. **Goals, not scripts.** Test inputs should read like user stories ("Verify a non-admin user cannot modify org settings and gets a clear error"). Vague intent yields unpredictable paths; precise goals make every agent decision auditable.
5. **Idempotency by construction.** Every test seeds its own fixtures and cleans them up in `finally`. Tests must not depend on previous state or leave residue, or you get the worst kind of flake: the kind that goes away when you re-run it locally.
6. **Audit trail by default.** Traces, screenshots, network logs, and reasoning steps should be saved for every run. Flaky tests are diagnosed from traces, not by re-running.

## The agentic loop

Every test execution follows the same five-step loop. Build the system so it can repeat this loop on failure rather than crashing out.

1. **Intent** — A precise user-story goal. Should fit on one line.
2. **Plan** — The planner deduces the steps required, explores the app if needed, and emits a dynamic roadmap. Do not hardcode the step list.
3. **Execute + observe** — Multi-modal perception (DOM + accessibility tree + screenshot + network + console). Interact like a user (click, type, scroll). Adapt mid-flight to modals, delays, A/B variants.
4. **Verify + adapt** — Behavioral assertions across multiple signals. On failure: reason, self-heal (retry, alt locator, vision fallback), or stop with a root cause.
5. **Report + feed back** — Logs, screenshots, video, trace. Feed structured failure context back to the planner (for the next run) or to the calling AI coder (for a PR fix).

## Multi-agent architecture

Single-agent systems hallucinate, run out of context, and bury reasoning. The proven shape is a small crew with focused responsibilities. Build toward this even if you only have one model behind the scenes today; the seams matter more than the agent count.

- **Orchestrator** — Owns the run. Allocates work, manages context handoff, decides when to stop.
- **Planner** — Translates a user-story goal into an executable plan. Also scans the codebase or product spec for coverage gaps.
- **Generator** — Emits either executable code (Playwright TS) or step-level commands the executor can run. Versioned, reviewable output is preferred over black-box runs.
- **Executor** — Drives the browser. Sandboxed. Streams perception (DOM + AOM + visual) back to the orchestrator.
- **Healer / reviewer** — Critiques output, deduplicates, opens PRs that patch failing tests, enforces house style on generated code.

Why specialization matters: each subagent keeps its context narrow, which suppresses hallucinations and lets you parallelize across multiple test cases. A dedicated reviewer is what closes the loop — embedding review logic inside the generator does not work in practice.

For a deeper architecture walkthrough including handoff contracts and parallelization patterns, see [references/architecture.md](references/architecture.md).

## Tech stack defaults

When the user has no strong preference, recommend this stack. It is what production systems converge on.

| Layer | Default | Why |
| --- | --- | --- |
| Execution engine | Playwright | First-class accessibility snapshots, stable locators, traces + video, headless in CI |
| Mobile / desktop | Appium or AskUI | Same agentic loop, vision-first for non-web surfaces |
| LLM (reasoning) | Claude Sonnet 4.6+ | Strong code-gen + reasoning; Opus for harder planning |
| LLM (vision) | Gemini 2.x or GPT-4o | Best price/perf for screen understanding, chart correctness, canvas |
| Orchestration | LangChain / AutoGen / CrewAI, or a custom MCP server | Pick the one that already lives in your stack |
| Perception | AOM + DOM + visual diff | Hybrid: AOM is primary, visual is fallback for canvas/shadow DOM |
| Observability | Playwright trace + screenshots + video + structured logs | Required, not optional |
| Sandboxing | Browserbase, Vercel Sandbox, or a CI runner with sealed network | Tests never touch prod data |
| CI | GitHub Actions + matrix runners | Wire it on day one, not week eight |

Commercial accelerators (QA Wolf, TesterArmy, mabl, Autify) are reasonable starting points when the team's pain is "we have no E2E coverage at all"; build custom when you need deep codebase integration or proprietary models.

For concrete Playwright patterns including hermetic fixture seeding, `globalSetup` wiring, and the recently-shipped `tests/cup-03-review.spec.ts` lifecycle pattern in this repo, see [references/playwright-patterns.md](references/playwright-patterns.md).

## Reliability practices

These separate "kind of works" suites from production-grade ones. Pull from [references/best-practices.md](references/best-practices.md) for the full list with rationale; the headlines:

- **Precise, user-story goals.** Review intent with PM + eng before writing the test.
- **Accessibility-first locators.** ARIA roles, labels, AOM snapshots, in that order. CSS/XPath only as a last resort with a comment explaining why.
- **Behavioral assertions across multiple signals.** Outcome > exact text > pixel.
- **Multi-modal perception.** Combine AOM with vision to handle shadow DOM, dynamic IDs, A/B tests.
- **Intelligent flake handling.** Auto-retry with smart waits, visual thresholds (`maxDiffPixelRatio`, color tolerance), aim for false-positive rate under 20% before scaling.
- **Self-healing everywhere.** Vision fallback for locators; healer agent that reads traces and patches tests.
- **Sandbox + idempotency.** Tests seed and clean up their own data via APIs/factories. Never share state between specs.
- **Human oversight loop.** Eval sets, periodic trace review, never set-and-forget. Treat the suite as a product.
- **Prompt engineering as product specs.** Include codebase patterns, style rules, no-duplication directives in the planner/generator prompts.
- **Start small and measure.** Pilot on 3 to 5 highest-value flows. Track false-positive reduction, maintenance hours saved, coverage delta.

## Where this skill shines

Some surfaces are dramatically better handled by an agentic system than by a fixed Playwright suite. Bias toward agentic flows for:

- **High-churn / A/B-tested UIs** — Adapts without script churn.
- **Accessibility testing** — AOM snapshots are already part of perception; trivial to add screen-reader and keyboard-only flows.
- **Visual + layout regression** — Screenshot every state, let the vision model classify "meaningful" diffs.
- **Multimodal apps** (dashboards, canvases, video) — Vision verifies chart correctness, media playback, etc.
- **Mobile / cross-platform parity** — Appium + vision for iOS/Android/desktop.
- **Performance + auth smoke tests** — Agent notices slow loads or unexpected redirects without a dedicated harness.
- **Agentic coding integration** — After an AI coder submits a PR, the test agent runs E2E flows in a sandbox and feeds structured failure context back to the coder.
- **Exploratory testing** — Agent autonomously explores from a goal, surfacing edge cases humans miss.

Full case studies and prompt scaffolds for each: [references/use-cases.md](references/use-cases.md).

## Roadmap to deploying one

When the user is starting from zero, recommend phasing the build so they can demonstrate ROI early. Each phase exits with a measurable outcome.

1. **Assess + pilot** (1 to 2 weeks). Audit current false-positive rate. Pick 3 to 5 critical flows. Stand up a single-agent Playwright + LLM prototype.
2. **Core loop** (2 to 4 weeks). Planner → executor → healer. Wire AOM + screenshots + trace. Land in CI.
3. **Multi-agent + reviewer** (2 weeks). Add orchestrator + reviewer with domain-specific prompts and house style rules.
4. **Reliability hardening** (ongoing). Visual thresholds, retry policies, sandbox sealing, idempotent seed/cleanup.
5. **Scale + evaluate** (ongoing). Expand coverage. Add vision for the hardest surfaces. Measure ROI: maintenance hours saved, outages caught, coverage delta.
6. **Productionize**. Cost monitoring (vision is expensive), human calibration dashboard, eval set CI.

## Buy vs build

- **Buy** (QA Wolf, TesterArmy, mabl, Autify) when the team has no existing E2E infrastructure, wants Playwright code generated for them, and needs ROI in weeks.
- **Build** when you need deep codebase integration, proprietary model use, sensitive-data handling, or the test agent has to ride alongside an internal AI coding agent.

## Evaluation metrics

Track these. Without them you cannot tell if the suite is improving.

- **Pass rate** on the eval set (real failures should fail; healthy code should pass).
- **False-positive rate** — flaky-but-real-code-is-fine failures. Target under 20% before scaling, under 5% at maturity.
- **Coverage %** — flows under E2E vs total user-visible flows.
- **Maintenance hours saved** vs pre-agentic baseline.
- **Mean time to detect** for real production bugs.
- **Trajectory success** — did the agent complete its goal without human assistance?
- **Tool-use accuracy** — did it call the right tool with the right args?
- **Adaptation frequency** — how often did the agent self-heal vs fail?

## Common challenges and the fix that actually works

| Challenge | Real fix |
| --- | --- |
| Non-determinism / flake | Multi-modal + behavioral assertions + healer agent. Re-running is not a fix. |
| LLM cost runaway | Hybrid code + vision. Cache common perceptions. Run deterministically wherever possible. |
| ROI skepticism | Start narrow. Measure relentlessly. Use a reviewer agent to keep human review time low. |
| False positives / negatives | Audit historical failures. Make assertions explicit. Calibrate with human-judged eval sets. |
| Context window exhaustion | Specialized subagents + summarization between steps. Do not stuff the whole DOM into one prompt. |
| "Tests pass but bug shipped" | Behavioral assertions across multiple signals, not single-string text matches. |

## Anti-patterns to flag immediately

When reviewing existing test code or proposed designs, push back hard on:

- Locators built on CSS class names or auto-generated IDs.
- Assertions that match exact strings of UI copy ("Welcome back, Jack!") — those break on every copy tweak.
- `waitForTimeout(5000)` — replace with `waitFor` against an actual signal.
- Tests that depend on data seeded by an earlier test in the file.
- Suites that swallow errors silently and only check the final URL.
- `--no-verify` or `--retries=10` to make a flaky test "pass".
- Single 1,000-line test that walks a whole user journey — split into focused specs.
- No trace, no screenshot, no video captured on failure.

## Reference index

- [references/architecture.md](references/architecture.md) — Multi-agent shape, handoff contracts, parallelization.
- [references/best-practices.md](references/best-practices.md) — Reliability practices with the why behind each.
- [references/use-cases.md](references/use-cases.md) — Special-case patterns (a11y, visual, multimodal, exploratory, agentic-coding loop).
- [references/playwright-patterns.md](references/playwright-patterns.md) — Concrete patterns for this Nativz Cortex repo: hermetic seeding, `globalSetup`, share-link lifecycle tests, common pitfalls (e.g., querying non-existent DB columns silently).
