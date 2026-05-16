# Multi-agent architecture

The agentic loop in SKILL.md describes what each run does. This file describes how to *structure* the system that runs it, with the handoff contracts and parallelization decisions that determine whether the system scales past a demo.

## Why multi-agent at all

A single agent with the full responsibility (plan + execute + verify + heal) runs out of context, hallucinates between roles, and produces unauditable runs. Splitting responsibilities gives you three concrete wins:

1. **Narrow contexts.** Each agent sees only what it needs. The planner does not need DOM snapshots; the executor does not need product specs.
2. **Parallelization.** Independent test cases run as independent crews. The orchestrator is the only shared state.
3. **Trustable review.** A reviewer that is structurally separate from the generator catches house-style violations, duplicated tests, and bad assertions. A reviewer inlined into the generator is just a longer system prompt that gets ignored.

## The five roles

### Orchestrator

Owns the run. Holds a queue of test cases. Allocates work to planners/executors. Decides when to stop (success, retry, give up). Owns the global timeout and cost budget.

Inputs: a list of test goals plus run config (env, model, budget, parallelism).
Outputs: per-case results, aggregate report, the audit trail.

### Planner

Translates a user-story goal into an executable plan. Can also do upstream work: scan the codebase, read product specs, identify coverage gaps.

Inputs: user-story goal + product context (recent diffs, route map, page object metadata).
Outputs: ordered list of steps with intent + expected observable outcome for each. The output is structured (JSON or typed objects), not free text.

### Generator

Emits either executable code (Playwright TS) or step-level commands the executor can consume. Two flavors:

- **Code-emit**: produces a versioned `.spec.ts` file. Preferred when the test is repeatable and high-value. Easier to review, version, run in CI without LLM cost.
- **Step-emit**: produces a sequence of low-level commands (`click {role: "button", name: "Approve"}`, `expect-toast {text: "Approved"}`) that the executor runs through a deterministic interpreter. Use for exploratory or one-shot runs.

Output should always be reviewable. Black-box "the agent did something" is not acceptable.

### Executor

Drives the browser. Runs in a sandbox (Browserbase / Vercel Sandbox / CI container). Streams perception back to the orchestrator: DOM snapshot, AOM tree, screenshot, console, network, request fingerprints.

Critical property: the executor is *thin*. It does not reason. It interprets commands and reports observations. Reasoning lives in the planner/healer. Keep it that way.

### Healer / reviewer

Two tightly coupled responsibilities, often the same agent:

- **Heal**: when a step fails, read the trace, propose either a retry strategy (re-locate via alt role, wait for network idle, fall back to vision-based locator) or a new plan. Hand back to the planner if the test design is wrong.
- **Review**: critique emitted code or step lists for house style, duplication, weak assertions, accessibility coverage. Open PRs when it finds problems in the existing suite.

## Handoff contracts

Make the handoff between agents typed and explicit. Loose handoffs are where context bleeds and hallucinations creep in.

```
TestGoal → Planner → Plan(steps[]) → Generator → SpecOrCommands → Executor → Trace + Verdict → Healer → ReviewedResult
                                                                            ↘ (failure) → Planner (replan)
```

Each arrow is a structured payload. Concretely:

- `Plan` includes `steps[]`, each with `intent`, `expectedObservation`, `recoverableFailures`, `nonRecoverableFailures`.
- `Trace` includes per-step `observations` (AOM + screenshot ref + network requests), `verdict` (pass/fail/uncertain), and `errorClass` if applicable.
- `Verdict` is structured: `{ status, evidence[], confidence }`. Never just a boolean.

## Parallelization

Independent test cases are embarrassingly parallel. Run N crews in parallel up to your sandbox budget. Two rules:

1. **Sandbox per crew.** Tests must not share browser context, cookies, or seed data. The whole point of idempotent fixtures is to enable this.
2. **Shared cost ceiling.** The orchestrator owns the total LLM budget for the run. Individual crews see their slice, not the global pool.

Do not parallelize *within* a single test (the executor and planner for one case). The serial loop is what gives you a coherent trace.

## When to start with a simpler shape

Two or three roles is fine to start. The decomposition that earns its keep first is:

1. Planner + executor (one crew). Single LLM call planning, deterministic execution.
2. Add a healer. Now you get self-healing on failure.
3. Add the reviewer. Now you get house-style enforcement and PR generation.
4. Split planner from a generator only if you need both step-emit and code-emit outputs from the same plan.

Premature multi-agent splits add latency and cost without adding reliability. Wait for the seam to *hurt* before adding it.

## Stop conditions

Define these up front per run, owned by the orchestrator:

- Hard wall-clock timeout per test case.
- Hard LLM cost ceiling per test case.
- Max retry count for healer-driven replans.
- Global run timeout.

Without explicit stop conditions, a healer-planner pair can ping-pong forever on a real bug, burning cost and never reporting.
