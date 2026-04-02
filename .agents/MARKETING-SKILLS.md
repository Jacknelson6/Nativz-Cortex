# Marketing skills (Corey Haines)

This repository vendors **[marketingskills](https://github.com/coreyhaines31/marketingskills)** — agent skills for CRO, copywriting, SEO, analytics, paid media, lifecycle email, and growth strategy. **All agents** in this monorepo should use them whenever the user’s task matches a skill’s description.

## Where the files live

| Location | Purpose |
|----------|---------|
| `.agents/skills/<skill-name>/SKILL.md` | Source of truth (committed) |
| `.claude/skills/<skill-name>` | Symlink to `.agents/skills/...` for Claude Code |
| `skills-lock.json` | Installed versions / hashes from `npx skills add` |

## How to use (every agent)

1. If the task involves **positioning, ICP, or messaging**, read **`product-marketing-context`** first (create/update `.agents/product-marketing-context.md` if missing).
2. Otherwise, pick the **one** skill whose description best matches the task and read **`SKILL.md`** in that folder before producing deliverables.
3. Follow cross-references inside that skill (“Related skills”) instead of guessing.

## Skill index (folder names)

`ab-test-setup`, `ad-creative`, `ai-seo`, `analytics-tracking`, `churn-prevention`, `cold-email`, `competitor-alternatives`, `content-strategy`, `copy-editing`, `copywriting`, `customer-research`, `email-sequence`, `form-cro`, `free-tool-strategy`, `launch-strategy`, `lead-magnets`, `marketing-ideas`, `marketing-psychology`, `onboarding-cro`, `page-cro`, `paid-ads`, `paywall-upgrade-cro`, `popup-cro`, `pricing-strategy`, `product-marketing-context`, `programmatic-seo`, `referral-program`, `revops`, `sales-enablement`, `schema-markup`, `seo-audit`, `signup-flow-cro`, `site-architecture`, `social-content`.

## Refresh / install

Non-interactive full install (from repo root):

```bash
npx skills add coreyhaines31/marketingskills -y
```

See upstream [README](https://github.com/coreyhaines31/marketingskills?tab=readme-ov-file) for plugins, subsets, and `SkillKit`.
