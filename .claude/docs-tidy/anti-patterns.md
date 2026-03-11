# Codebase Anti-Patterns

These patterns waste Claude's context window, confuse its mental model of your code, and degrade output quality. Each section includes what to do instead.

## The Junk Drawer Root

Your project root looks like this:

```
project/
  src/
  TODO.md
  TODO-old.md
  NOTES.md
  scratch.py
  test-thing.js
  old-prd-v2.md
  backup.sql.bak
  fix-later.ts
  package.json
  CLAUDE.md
```

Every file in root competes for Claude's attention. When it scans the project, it wastes tokens reading file names and trying to figure out what matters.

**Fix:** Move non-essential files to scratch/ or docs/archive/. Delete anything truly dead. Root should have config files, CLAUDE.md, README, and your source directory. That's it.

**Before:** 15 files in root, half of them junk
**After:**
```
project/
  src/
  scratch/        → TODO-old.md, scratch.py, test-thing.js
  docs/archive/   → old-prd-v2.md
  CLAUDE.md
  package.json
  README.md
```

## God Files

Any file over 1000 lines. These are the single biggest waste of Claude's context window.

When Claude needs one function from a 2000-line file, it often pulls in the whole thing. That's thousands of tokens spent on code it doesn't need.

**Fix:** Split along natural boundaries. Look for:
- Class definitions (one class per file)
- Related function groups (validation functions, formatting functions)
- Route handlers (one file per resource)

**Before:** `api/handlers.ts` at 1,800 lines with 12 route handlers
**After:**
```
api/
  handlers/
    auth.ts       → login, register, logout
    users.ts      → getUser, updateUser, deleteUser
    billing.ts    → createCharge, getInvoices
    index.ts      → re-exports all handlers
```

## Type-Based Organization

```
controllers/
models/
services/
helpers/
utils/
```

This forces Claude to jump between 3-5 directories to understand a single feature. Every jump costs tokens and risks losing context about what it was doing.

**Fix:** Reorganize by feature. See [patterns.md](patterns.md#feature-based-organization) for the full pattern.

## Documentation Duplication

The same information lives in README.md, CLAUDE.md, CONTRIBUTING.md, and docs/setup.md. When Claude finds conflicting versions, it doesn't know which to trust. It might follow the outdated one.

**Fix:** Single source of truth for each topic. CLAUDE.md for AI context. README for humans. docs/ for deep dives. No overlap.

## Front-Loaded Context Dump

A CLAUDE.md that's 500+ lines trying to explain every detail of the codebase upfront. Claude reads it all, burns a huge chunk of its context window, and then has less room for the actual code it needs to work on.

**Fix:** Keep CLAUDE.md under 200 lines. Move everything else to docs/ files and reference them from CLAUDE.md:

```markdown
## Architecture
See docs/architecture.md for the full system design.
Key points: [3-4 bullet summary]
```

## Orphaned AI Config Files

```
project/
  .cursorrules
  .windsurfrules
  .aider.conf.yml
  .github/copilot.md
  CLAUDE.md
```

Old AI tool configs sitting around confuse Claude. It might read .cursorrules and try to follow instructions meant for a different tool with different capabilities.

**Fix:** Pick your tool. If you're using Claude Code, keep CLAUDE.md and delete the rest. If any useful rules exist in the old configs, migrate them to CLAUDE.md first.

## Deep Nesting Hell

```
src/
  modules/
    features/
      auth/
        handlers/
          middleware/
            validation/
              schemas/
                authSchema.ts
```

More than 4 levels of nesting makes Claude lose track of where it is in the project tree. It burns tokens on long file paths, and when it needs to reference or import files, it produces wrong paths more often.

**Fix:** Flatten. Most projects need at most 3 levels: src/feature/file.ts. If you need sub-grouping within a feature, that's 4 levels max: src/features/auth/middleware/rateLimit.ts.

**Before:** `src/modules/features/auth/handlers/middleware/validation/schemas/authSchema.ts`
**After:** `src/features/auth/schemas/authSchema.ts`

## The Circular Import Web

```
// userService.ts
import { createOrder } from './orderService'

// orderService.ts
import { getUser } from './userService'

// billingService.ts
import { getOrder } from './orderService'
import { getUser } from './userService'

// userService.ts also imports from billingService...
```

Circular dependencies confuse Claude's mental model of how modules relate. When it tries to refactor or add features, it can't cleanly reason about the dependency graph and produces changes that break imports.

**Fix:** Extract shared logic into a separate module that both sides import from. Or use dependency injection.

**Before:** userService <-> orderService (circular)
**After:**
```
shared/
  userLookup.ts    → getUser (pure data access)
features/
  users/
    userService.ts → imports from shared/userLookup
  orders/
    orderService.ts → imports from shared/userLookup
```

The key principle: dependencies should flow one direction. If two modules need each other, there's a third module hiding inside them that should be extracted.

## The Barrel Export Maze

```
src/
  components/
    index.ts      → exports Button, Card, Modal, Table, Form, Input, Select, ...
  utils/
    index.ts      → exports formatDate, parseUrl, debounce, throttle, cn, ...
  hooks/
    index.ts      → exports useAuth, useFetch, useForm, useDebounce, ...
```

Every import resolves to index.ts, which re-exports from dozens of files. When Claude tries to trace where a function is defined, it hits the barrel file and has to fan out across every re-exported module. This burns context and makes Claude lose track of the actual source.

**Fix:** Import directly from source files instead of barrels. Keep barrel exports only for package boundaries (the public API of a package in a monorepo) where they serve a real purpose.

**Before:**
```typescript
import { Button, formatDate, useAuth } from '@/components'
// Claude has to read the entire barrel to find Button's source
```

**After:**
```typescript
import { Button } from '@/components/Button'
import { formatDate } from '@/utils/date'
import { useAuth } from '@/hooks/useAuth'
// Claude goes straight to the source file
```

## Quick Reference: Spotting Problems

| Symptom | Likely Anti-Pattern | Fix |
|---------|-------------------|-----|
| Root has 10+ non-config files | Junk Drawer Root | Move to scratch/ or delete |
| File over 1000 lines | God File | Split by class/function group |
| 3+ directories named by type | Type-Based Org | Reorganize by feature |
| Same info in multiple docs | Doc Duplication | Single source of truth |
| CLAUDE.md over 200 lines | Front-Loaded Dump | Slim down, move to docs/ |
| Multiple AI config files | Orphaned Config | Consolidate into CLAUDE.md |
| File paths with 5+ segments | Deep Nesting | Flatten to 3-4 levels |
| Module A imports B imports A | Circular Imports | Extract shared module |
| Every import goes through index.ts | Barrel Export Maze | Import from source files directly |
