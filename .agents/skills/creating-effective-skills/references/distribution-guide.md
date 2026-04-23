# Skill Distribution Guide

Read this when deciding how to share skills with a team or when managing a skill marketplace.

## Distribution Methods

### 1. In-Repo (`.claude/skills/`)

**Best for:** Small teams, 1-3 repos, <10 skills total.

Every skill checked in adds to the model's context in every conversation. Be deliberate about what goes in.

**Pros:** Simple, version-controlled with the code, everyone gets them automatically.
**Cons:** Context overhead scales linearly, no opt-in/opt-out per person.

### 2. Plugin Marketplace

**Best for:** Larger orgs, many repos, 10+ skills.

Team members choose which skills to install. Skills are distributed as plugins.

**Pros:** Opt-in reduces context overhead, scales to large teams, allows personal customization.
**Cons:** Requires marketplace infrastructure, skills may go stale without maintenance.

## Marketplace Curation Process

Don't centralize decisions. Let skills emerge organically:

1. **Sandbox phase**: Author uploads skill to a sandbox folder in GitHub
2. **Evangelism**: Author points people to it in Slack or forums
3. **Traction**: Once the skill has users (author's judgment), PR to move into marketplace
4. **Curation gate**: Some method of review before marketplace release — prevents bad or redundant skills

**Warning:** It's easy to create bad or redundant skills. Quality gates matter.

## Composing Skills

Skills can reference each other by name. The model invokes referenced skills if they're installed.

```markdown
## After generating the report
Use the **file-upload** skill to publish it to the shared drive.
```

**No native dependency management yet** — just reference by name and trust the model to invoke if available.

## Measuring Skill Effectiveness

Use a PreToolUse hook to log skill usage:

**What to track:**
- Invocation count per skill (popularity)
- Trigger rate vs. expected triggers (under-triggering detection)
- User feedback / override rate (quality signal)

**What to act on:**
- Popular skills → invest in improving them
- Under-triggering → optimize the description field
- High override rate → skill may be too rigid or wrong

## Skill Lifecycle

1. **Draft** — Write initial version based on identified need
2. **Test** — Run against realistic scenarios
3. **Sandbox** — Share with a few teammates
4. **Traction** — Others find it useful organically
5. **Promote** — Move to marketplace or repo
6. **Maintain** — Update gotchas as new edge cases emerge
7. **Retire** — Remove when no longer relevant (check usage logs first)
