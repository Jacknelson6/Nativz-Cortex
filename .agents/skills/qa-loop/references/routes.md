# Cortex App Routes

## Admin Pages (require auth)

| Route | Page | Key Elements |
|-------|------|-------------|
| `/admin/dashboard` | Dashboard | Stats cards, recent activity, charts |
| `/admin/tasks` | Tasks | Todoist integration, task list |
| `/admin/pipeline` | Content pipeline | Board/List/Table views, client rows, status badges |
| `/admin/pipeline?stage=editing` | Editing filter | Filtered to editing stage only |
| `/admin/pipeline?stage=boosting` | Boosting filter | Filtered to boosting stage only |
| `/admin/scheduler` | Social scheduler | Calendar, media library, post editor |
| `/admin/search/new` | Research wizard | Multi-step wizard, topic input, platform toggles |
| `/admin/analysis` | Analysis hub | Quick analyze URL input, moodboard cards |
| `/admin/presentations` | Presentations | Card grid, create modal, tier list/slides types |
| `/admin/clients` | Client list | Client cards with brand colors |
| `/admin/clients/[id]` | Client detail | Tabs: overview, pillars, ideas, settings |
| `/admin/team` | Team grid | Member cards with avatars/initials, roles |
| `/admin/knowledge` | Knowledge graph | Sigma.js graph, node list sidebar, detail panel |
| `/admin/nerd` | AI chat | Chat interface, client context picker |
| `/admin/settings` | Settings | AI model config, usage dashboard |
| `/admin/analytics/monthly` | Monthly analytics | Charts, metrics |
| `/admin/analytics/platforms` | Platform analytics | Per-platform breakdowns |

## Auth
| Route | Page |
|-------|------|
| `/admin/login` | Admin login |
| `/portal/login` | Client portal login |

## Key interactions to test
- Research wizard: open → type topic → select context → next → configure → submit
- Pipeline: toggle Board/List/Table views
- Scheduler: navigate months, open post editor
- Analysis: paste URL → quick analyze
- Team: click member → modal opens
- Knowledge graph: search nodes, click node → detail panel
- Settings: switch AI model
- Brand toggle: switch between Nativz and AC modes (logo click in sidebar)

## AC Brand Mode
Toggle by clicking the logo in the sidebar header. All pages should adapt:
- Light background (#F4F6F8) instead of dark (#0a0e1a)
- Teal accent (#36D1C2) instead of blue (#5ba3e6)
- Navy text (#00161F) instead of light (#f1f5f9)
- All buttons, badges, gradients, charts should use AC tokens
