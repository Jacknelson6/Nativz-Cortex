# Supabase MCP — Nativz Cortex

One-time setup. CLAUDE.md keeps the *preference* (use MCP for schema/SQL/RLS); install + auth steps live here.

## Project

- **Project ref:** `phypsgxszrvwdaaqpxup`
- **MCP URL:** `https://mcp.supabase.com/mcp?project_ref=phypsgxszrvwdaaqpxup`

## Claude Code

```bash
claude mcp add --scope project --transport http supabase \
  "https://mcp.supabase.com/mcp?project_ref=phypsgxszrvwdaaqpxup"
```

Writes `.mcp.json` (gitignored). Authenticate once: run `/mcp` in a normal terminal → select **supabase** → **Authenticate**.

## Cursor

`.cursor/mcp.json` already registers the same HTTP MCP server for this workspace.

## Optional extras

`npx skills add supabase/agent-skills` — extra Supabase-oriented agent skills (install once per machine if desired).
