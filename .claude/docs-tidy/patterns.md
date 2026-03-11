# Codebase Organization Patterns

Patterns that help Claude (and other AI tools) navigate your code faster with less wasted context.

## Feature-Based Organization

Group files by what they do, not what they are.

**Before (type-based):**
```
src/
  controllers/
    authController.ts
    billingController.ts
    userController.ts
  models/
    authModel.ts
    billingModel.ts
    userModel.ts
  services/
    authService.ts
    billingService.ts
    userService.ts
```

**After (feature-based):**
```
src/
  features/
    auth/
      controller.ts
      model.ts
      service.ts
      auth.test.ts
    billing/
      controller.ts
      model.ts
      service.ts
      billing.test.ts
  shared/
    utils/
    middleware/
```

Why this matters: When Claude works on authentication, it pulls in auth/controller.ts, auth/model.ts, and auth/service.ts. With type-based organization, it has to scan three different directories and mentally filter out the billing and user files. That burns tokens and dilutes attention.

## Progressive Documentation

Layer your docs from quick-reference to deep-dive.

```
CLAUDE.md          → What Claude needs right now (under 200 lines)
docs/
  architecture.md  → System design, data flow, key decisions
  api-reference.md → Endpoints, schemas, auth
  conventions.md   → Coding style, naming rules, PR process
```

CLAUDE.md should answer: "What is this project, how is it structured, and what are the rules?" Everything else goes in docs/.

## Convention Files

Use standard config files so Claude doesn't guess at formatting:

- `.editorconfig` for indent style and size
- `.prettierrc` or `.prettierrc.json` for JS/TS formatting
- `tsconfig.json` for TypeScript strictness settings
- `.eslintrc` or `eslint.config.js` for linting rules
- `pyproject.toml` or `.flake8` for Python style

When these files exist, Claude reads them and matches your style automatically. Without them, Claude guesses, and you spend tokens on formatting corrections.

## CLAUDE.md Best Practices

### What to include
- One-paragraph project overview (what it does, primary stack)
- Directory map with one-line descriptions
- Key file locations (entry points, config, database schema)
- How to run, test, and deploy (exact commands)
- Coding conventions and naming rules
- Things that are easy to get wrong ("always use UTC timestamps", "never import from internal/")
- Reference Docs section linking to docs/ files

### What NOT to include
- Full API documentation (put in docs/api-reference.md)
- Detailed architecture explanations (put in docs/architecture.md)
- Changelog or version history
- Long lists of every file in the project
- Onboarding guides for humans (Claude doesn't need to know where the coffee machine is)

### Ideal structure
```markdown
# Project Name

## Overview
[1 paragraph]

## Architecture
[directory map, 10-15 lines max]

## Key Files
[5-10 most important files with one-line descriptions]

## Development
[run, test, deploy commands]

## Conventions
[5-10 rules]

## Reference Docs
[links to docs/ files with one-line descriptions]
```

Target: 80-150 lines. If it's over 200, you're stuffing too much in.

## Small Project Layout

Not every project needs features/ and shared/. For projects under 20 files:

```
project/
  src/
    main.ts
    utils.ts
    types.ts
  tests/
    main.test.ts
  CLAUDE.md
  package.json
```

Don't over-engineer structure for a small project. Claude handles flat layouts just fine when there aren't many files.

## Monorepo Organization

```
monorepo/
  CLAUDE.md              → Top-level overview, links to package docs
  packages/
    api/
      CLAUDE.md          → API-specific context
      src/
    web/
      CLAUDE.md          → Web-specific context
      src/
    shared/
      src/
  docs/
    architecture.md
```

Each package gets its own CLAUDE.md with package-specific context. The root CLAUDE.md maps the landscape and explains how packages relate.

## Quick Decision Guide

| Situation | Do This |
|-----------|---------|
| Project has < 20 files | Flat src/ layout, minimal structure |
| Project has 20-100 files | Feature-based directories under src/features/ |
| Project has 100+ files | Feature-based + shared/ + docs/ + per-feature tests |
| Monorepo | CLAUDE.md per package, shared/ for cross-cutting code |
| Framework project (Next.js, Rails) | Follow framework conventions, don't fight them |
| CLAUDE.md over 200 lines | Split into CLAUDE.md (summary) + docs/ (details) |

## File Size Guidelines

| Lines | Status | Action |
|-------|--------|--------|
| < 200 | ✅ Ideal | No action needed |
| 200-500 | ⚠️ Watch | Consider splitting if it keeps growing |
| 500-1000 | 🔶 Split recommended | Look for natural split points |
| 1000+ | 🔴 Split required | This is a god file. Split immediately. |
