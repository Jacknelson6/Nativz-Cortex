You are running the /tidy command. Your job is to audit the current codebase structure, report problems, estimate token waste, and fix them with the user's approval.

## Phase 0: Detect Framework

Before scanning, identify if the project uses a framework with strong conventions:
- **Next.js**: app/ or pages/ directory, next.config.js
- **Rails**: app/controllers, app/models, Gemfile
- **Django**: manage.py, settings.py, apps with models.py
- **Laravel**: artisan, app/Http, composer.json
- **SvelteKit**: svelte.config.js, src/routes/
- **Nuxt**: nuxt.config.ts, pages/

If a framework is detected, respect its conventions. Do not recommend restructuring framework-mandated directories. Note the framework in your report header.

## Phase 1: Scan

Analyze the project root and all subdirectories. Collect the following:

1. **File inventory**: Count total files, directories, and maximum nesting depth. Flag any nesting deeper than 4 levels.
2. **Large files**: Identify files over 500 lines (warning) and over 1000 lines (critical, "god files"). List each by name and line count.
3. **Root junk**: Look for these in the project root: .bak files, scratch/temp files, old PRDs, multiple TODO/NOTES/CHANGELOG files that aren't actively used, random one-off scripts.
4. **Orphaned AI config**: Check for .cursorrules, .windsurfrules, .aider.conf.yml, .github/copilot.md, or other AI tool configs that aren't actively used alongside CLAUDE.md.
5. **CLAUDE.md check**: Does it exist? How many lines? Is it over 200 lines (bloated)?
6. **Organization style**: Is the codebase organized by type (controllers/, models/, views/) or by feature (auth/, billing/, dashboard/)? Type-based is an anti-pattern for AI navigation. Skip this check if a framework mandates type-based structure.
7. **Documentation duplication**: Are there multiple files covering the same topic? Is critical context scattered across README, CLAUDE.md, CONTRIBUTING, and random docs?
8. **Circular dependencies**: Look for obvious circular import patterns between modules.
9. **Convention files**: Check for .editorconfig, .prettierrc, tsconfig.json, eslint config. Note which are missing.
10. **Barrel export maze**: Check for index.ts/index.js files that re-export large numbers of modules, making it hard to trace where things actually live.

## Phase 1.5: Estimate Token Waste

After scanning, estimate how many tokens are being wasted by the current structure. Use these formulas:

### Token estimation rules (approximate, 1 line ≈ 4 tokens)

**God files:**
When Claude needs to work on one part of a god file, it reads the whole thing. For each god file, estimate wasted tokens as:
- `(total_lines - 300) × 4` tokens wasted per read
- Assume Claude reads each god file ~2x per session
- Example: a 1,800-line file wastes ~(1800 - 300) × 4 × 2 = **12,000 tokens per session**

**Bloated CLAUDE.md:**
Every line over 150 loads into context every single session, whether needed or not.
- `(total_lines - 150) × 4` tokens wasted per session
- Example: a 450-line CLAUDE.md wastes ~(450 - 150) × 4 = **1,200 tokens per session**

**Root junk files:**
Claude scans root file names and may read junk files trying to understand the project.
- ~50 tokens per junk file for name scanning
- ~200 tokens per file if Claude reads it
- Estimate: `junk_file_count × 150` tokens wasted per session

**Type-based organization:**
Claude reads extra files when jumping between directories to understand a feature. For each feature scattered across type directories:
- ~500 tokens of extra navigation overhead per feature per session
- Estimate: `feature_count × 500` tokens wasted per session

**Barrel export maze:**
Each barrel file Claude reads to trace an import is wasted context.
- Count exports in each barrel file
- `barrel_exports_total × 8` tokens wasted per trace
- Estimate: `barrel_file_count × barrel_avg_exports × 8` tokens per session

**Deep nesting:**
Longer import paths burn more tokens in every file that references them.
- Each extra nesting level beyond 3 adds ~2 tokens per import statement
- Estimate: `excess_depth × files_at_that_depth × imports_per_file × 2` tokens per session

**Orphaned AI configs:**
Claude may read these trying to understand project rules.
- ~300 tokens per orphaned config file per session

**Documentation duplication:**
Duplicate content across files means Claude reads the same information multiple times.
- Estimate overlapping content in lines, then: `duplicate_lines × 4` tokens wasted per session

### Savings calculation
For each recommended action, estimate how many tokens it saves:
- Splitting a god file: `(original_lines - largest_split) × 4 × 2` tokens saved per session
- Slimming CLAUDE.md: `(lines_removed) × 4` tokens saved per session
- Cleaning root junk: `junk_files_removed × 150` tokens saved per session
- Feature-based reorg: `features_consolidated × 500` tokens saved per session
- Removing barrel exports: `barrel_exports_removed × 8` tokens saved per session
- Removing orphaned configs: `configs_removed × 300` tokens saved per session

## Phase 2: Report

Present findings in this format:

```
# Tidy Report

**Framework detected:** [framework name or "None"]
**Files:** [count] | **Directories:** [count] | **Max depth:** [count]

## 💰 Token Waste Estimate

| Source | Estimated waste per session |
|--------|---------------------------|
| God files (X files, Y total lines) | ~Z,000 tokens |
| Bloated CLAUDE.md (X lines) | ~Z tokens |
| Root junk (X files) | ~Z tokens |
| Type-based org (X features scattered) | ~Z tokens |
| Barrel exports (X barrels, Y exports) | ~Z tokens |
| Deep nesting (X files beyond 4 levels) | ~Z tokens |
| Orphaned AI configs (X files) | ~Z tokens |
| Doc duplication (~X duplicate lines) | ~Z tokens |
| **Total estimated waste** | **~Z,000 tokens/session** |

## 🔴 Critical
- [list critical issues: god files with exact line counts, junk drawer root, no CLAUDE.md, deep nesting]

## 🟡 Warning
- [list warnings: files 500-1000 lines with exact counts, type-based org, bloated CLAUDE.md, missing convention files, barrel export maze]

## 🟢 Good
- [list things already done well]

## Recommended Actions
1. [action] → saves ~X,000 tokens/session
2. [action] → saves ~X tokens/session
...

**Total potential savings: ~X,000 tokens/session**
**Estimated cost savings: ~$X.XX per 100 sessions** (at $3/M input tokens)
```

Be specific. Don't say "some files are large." Say "src/api/handler.ts is 1,247 lines."

## Phase 3: Dry Run

After presenting the report, ask the user: "Which of these would you like me to fix? I can handle all of them, or pick specific numbers. I'll show you exactly what I plan to do before making any changes."

When the user picks actions, present a dry run first:

```
## Planned Changes
- [ ] Move scratch.py → scratch/scratch.py
- [ ] Move old-prd-v2.md → docs/archive/old-prd-v2.md
- [ ] Split src/api/handlers.ts (1,847 lines) into:
      → src/api/handlers/auth.ts
      → src/api/handlers/users.ts
      → src/api/handlers/billing.ts
      → src/api/handlers/index.ts
- [ ] Generate CLAUDE.md (estimated 120 lines)

**Estimated token savings: ~X,000 tokens/session**

Proceed? (yes/no/modify)
```

Only execute after the user confirms.

## Phase 4: Fix

Based on confirmed changes, execute the relevant fixes:

### Creating structure
- Create feature directories based on what the code actually does (e.g., auth/, billing/, api/, shared/)
- Create docs/ if it doesn't exist
- Create scripts/ and move loose scripts there
- Respect framework conventions. Do not reorganize framework-mandated directories.

### Moving files
- Move files to their proper feature directories
- Move root junk to a scratch/ directory (or delete with explicit confirmation)
- Consolidate orphaned AI configs into CLAUDE.md where relevant, then remove the originals

### Splitting god files
- For files over 1000 lines, analyze the file and suggest logical split points based on class/function boundaries
- Propose the new file names and what goes in each
- Create an index.ts/index.js barrel export for backward compatibility
- Execute the split after user confirms

### CLAUDE.md management
If CLAUDE.md doesn't exist, generate one with this structure:

```markdown
# Project Name

## Overview
[one paragraph: what this project does, primary language/framework]

## Architecture
[key directories and what lives in each, 10-15 lines max]

## Key Files
[5-10 most important files with one-line descriptions]

## Development
[how to run, test, and deploy, exact commands]

## Conventions
[5-10 coding rules]

## Reference Docs
[auto-link to any docs/ files found in the project]
```

If CLAUDE.md is bloated (over 200 lines), slim it down:
- Move detailed API docs, architecture deep-dives, and reference material to docs/
- Keep CLAUDE.md focused on what Claude needs to know to work in this codebase
- Add a Reference Docs section pointing to the detailed docs

### Navigation comments
After reorganizing, update CLAUDE.md with a file map showing where key files moved:

```markdown
## File Map
- Authentication: src/features/auth/
- Database models: src/features/*/models/
- Shared utilities: src/shared/
- Scripts: scripts/
- Documentation: docs/
```

## Phase 5: Summary

After all fixes are applied, present a final summary:

```
# Tidy Complete ✅

## Changes Made
- [list of changes executed]

## Token Savings

| Change | Tokens saved per session |
|--------|------------------------|
| Split handlers.ts (1,847 → 4 files) | ~9,600 |
| Slimmed CLAUDE.md (450 → 130 lines) | ~1,280 |
| Cleaned 8 root junk files | ~1,200 |
| Removed 3 orphaned AI configs | ~900 |
| **Total savings** | **~12,980 tokens/session** |

**Over 100 sessions, that's ~1.3M tokens saved (~$3.90 at $3/M input tokens).**

Run `git diff` to review all changes before committing.
```

## Rules

- Always show a dry run of planned changes before executing
- Never delete files without explicit user confirmation. Default to moving to scratch/
- Preserve git history awareness: mention that the user should review `git diff` after tidying
- If the project uses a framework with strong conventions (Next.js, Rails, Django), respect those conventions instead of imposing generic structure
- Be specific in your report. Name every file and its line count.
- Reference docs/patterns.md and docs/anti-patterns.md when explaining why something is a problem (if those files exist in the project)
- When splitting god files, always create a barrel export (index.ts) so existing imports don't break
- Token estimates are approximate. Be honest about that. Say "estimated" not "exact." The goal is to give users a sense of scale, not precision.
- Use $3/M input tokens as the default cost rate for savings calculations (Sonnet-tier pricing). Mention this assumption.
