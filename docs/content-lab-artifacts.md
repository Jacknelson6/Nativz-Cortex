# Content Lab — artifact canvas

> Shipped April 10–11 sessions (see `SRL.md` for iteration log).
> This doc covers the end-to-end flow so future sessions don't rebuild it.

## Goal

A user can:
1. Run a topic search under a client (or unattached).
2. Click **Open in Content Lab** from the search results page.
3. Land in the lab with that search auto-pinned in the chip bar.
4. Chat with the Nerd, grounded in the attached research.
5. Ask for strategy, scripts, video ideas, performance analysis.
6. Receive **artifacts** — mermaid diagrams, html-visual blocks, GFM
   tables, structured scripts — rendered inline like Claude web.
7. Click any diagram to expand full-size with Download SVG + PNG.
8. Export a single message or the whole conversation as PDF.

## Entry points

### From a topic search results page
`app/admin/search/[id]/results-client.tsx` renders an **Open in Strategy
Lab** button next to Export PDF and Share in the header.

- **Attached to a client:** writes `[search.id]` to the client's
  `strategyLabTopicSearchStorageKey(clientId)` in localStorage, then
  `router.push('/admin/content-lab/[clientId]')`. Single-pin replace —
  the user lands on exactly this search.
- **No client:** opens `StrategyLabAttachClientDialog`
  (`components/content-lab/content-lab-attach-client-dialog.tsx`),
  which fetches `/api/clients`, lets the user pick, PATCHes
  `/api/search/[id]` with `{ client_id }` to persist, then pins and
  navigates as above.

### From research history (bulk)
The research history feed's bulk-select path calls
`mergeTopicSearchSelectionIntoLocalStorage(clientId, ids[])` and routes
to `/admin/content-lab/[clientId]`. The workspace's multi-pin state
(see below) loads the full array.

### Direct
`/admin/content-lab/[clientId]` from the sidebar. The workspace
auto-selects the most recent completed topic search if nothing is
pinned in localStorage.

## State plumbing

`content-lab-workspace.tsx` holds the canonical `pinnedTopicSearchIds: string[]`
state. On mount it:
1. Reads `strategyLabTopicSearchStorageKey(clientId)` from localStorage.
2. Filters the ids against `topicSearches[]` to prune stale references.
3. Re-persists the pruned array so deleted searches don't re-appear.
4. Falls back to `[mostRecentCompletedSearch.id]` if the user has
   nothing pinned.

The chip bar (`content-lab-topic-search-chip-bar.tsx`) receives the
full `pinnedTopicSearchIds` array and auto-attaches each one on first
mount (only if `attachedSearchIds.length === 0`, so the user's manual
detach stays sticky).

The chat (`content-lab-nerd-chat.tsx`) receives `pinnedTopicSearchIds`
as a prop and passes the final `attachedSearchIds` to `/api/nerd/chat`
via the `searchContext: string[]` field.

`/api/nerd/chat` (`app/api/nerd/chat/route.ts`) reads each ID's full
`topic_searches` row (query, summary, trending_topics, metrics,
emotions, content_breakdown) and injects the formatted content into
the system prompt. Same path `/admin/nerd` uses.

## Rendering pipeline

### Markdown → live visuals

`components/ai/markdown.tsx` is a handwritten line-by-line parser. It
recognizes:

| Syntax | Renderer | Notes |
|---|---|---|
| `# / ## / ###` | Styled `<h2>/<h3>/<h4>` | |
| `- / * / +` bullets | Dense bullet rows | |
| `1.` numbered lists | Same dot marker | |
| `**bold**` / `*italic*` / `` `code` `` | Inline runs | |
| `![alt](url)` | Thumbnail image | |
| `---` | `<hr>` | |
| GFM tables (header + `\|---\|---\|` divider) | Dark-theme `<table>` | Added April 11 |
| ``` ```mermaid ``` | `MermaidDiagramBlock` (live SVG via mermaid lib) | |
| ``` ```html-visual ``` / ``` ```html ``` | `HtmlVisualBlock` (sandboxed iframe via DOMPurify) | |
| ``` ```other ``` | `<pre>` with language label | |

Unclosed fenced blocks (while streaming) render a `Rendering diagram…`
skeleton instead of handing partial code to the mermaid/html renderers
— prevents syntax-error flashes. See `components/ai/markdown.tsx`
tail-handler.

### Inline visuals

`components/ai/rich-code-block.tsx`:

- `MermaidDiagramBlock` dynamically imports `mermaid`, renders the
  fenced body via `mermaid.render`, and injects the SVG into a
  container. Hover reveals an **Expand** button → opens
  `ArtifactZoomModal`.
- `HtmlVisualBlock` sanitizes the body with DOMPurify (SVG + CSS
  allowed, scripts stripped) and renders inside a sandboxed iframe.
  Also hover-zoomable.
- Both components accept `disableZoom` so the zoom modal can reuse
  them without stacking recursive expand buttons.

### Zoom canvas

`components/ai/artifact-zoom-modal.tsx` (`ArtifactZoomModal`) opens on
click/Enter. Reuses the same renderers at `variant="present"` with
`disableZoom` set. Actions:
- **Copy source** (both kinds)
- **Download SVG** (mermaid only — re-queries the modal DOM for the
  live SVG, serializes, downloads)
- **Download PNG** (mermaid only — rasterizes the SVG via a canvas
  round trip with a dark background fill)

## PDF export

Two paths:

### Per-message PDF — `lib/chat-export-pdf.ts`
html2canvas rasterizes the DOM subtree containing the assistant
message, then jsPDF wraps it in a single-page A4. Captures live
mermaid SVGs directly because they're already rendered in the DOM at
export time. Triggered by the inline FileDown button on each
assistant message + the header Export PDF button when in a single-
message context.

### Full conversation PDF — `content-lab-conversation-pdf.tsx`
`@react-pdf/renderer` builds a structured multi-page document with
cover page, attached research grounding, and message list. Uses
`components/content-lab/pdf-markdown.tsx` to parse each assistant
message's markdown into react-pdf primitives.

**Mermaid handling** (April 11): before the PDF renders,
`components/content-lab/content-lab-conversation-export-button.tsx`
calls `rasterizeMermaidBlocks` (`lib/content-lab/rasterize-mermaid.ts`)
which:
1. Extracts every ``` ```mermaid ``` body from the assistant messages.
2. Renders each unique body via the real mermaid module into an
   off-screen DOM container (light theme, because PDF pages are white).
3. Rasterizes the resulting SVG to a PNG data URL via canvas.
4. Returns a `Map<hashMermaidBody(body), pngDataUrl>`.

The map is passed into `StrategyLabConversationPdf` → down to
`renderMarkdownToPdfBlocks(source, mermaidImages)`. Inside
`pdf-markdown.tsx`, when we hit a mermaid code block, we hash the body
and look up the PNG in the map. On hit → `<Image src={dataUrl} />`.
On miss → the existing labeled-source fallback (so rasterization
failures degrade gracefully).

Why PNG and not react-pdf `<Svg>`: react-pdf's SVG subset doesn't
implement `foreignObject`, filters, or mermaid's gradients, so direct
SVG embed silently drops half the node labels. PNG is lossy but
reliable.

html-visual blocks still fall back to labeled source in the PDF
(sandboxed iframes aren't capturable from outside the frame).

## System prompt — how the model knows to produce artifacts

`lib/nerd/content-lab-scripting-context.ts` exports
`STRATEGY_LAB_ADDENDUM` — a ~6400-char system prompt suffix that gets
appended whenever `/api/nerd/chat` receives `mode: 'content-lab'`. It
teaches the model:

1. **Ground every idea in the attached research** — trending topics,
   video ideas, sentiment signals from the `searchContext` injection.
2. **Reach for preloaded scripting skills and the client knowledge
   vault** before drafting.
3. **Respect the client's Brand DNA** — voice, pillars, ICPs.
4. **Short-form video only** — TikTok, Reels, Shorts. Vertical.
5. **Deliverable formats** — hook/angle/concept/why for video ideas;
   numbered beats for scripts; pillars + cadence + 2-week calendar for
   strategies.
6. **Hook composition rules** — specific > generic, negative/curiosity/
   story hooks, no `Hey guys`.
7. **Visual artifacts section** — which kinds of content become which
   kind of visual (`mermaid` for flowcharts/strategy maps/funnels/
   quadrantChart; `html-visual` for side-by-sides and scorecard cards).
   Includes mermaid syntax rules so outputs actually render.
8. **Artifact workflow** — five-part template (Title H1 → TL;DR →
   Visual → Detail sections → Next actions) so every reply stands
   alone as a shareable deliverable.

A regression guard (`scripts/smoke-content-lab-addendum.ts`) asserts
the load-bearing keywords are all present and the addendum stays under
10k chars. Run it anytime before shipping edits to the scripting
context.

## Entry prompts — quick-start pills

`content-lab-nerd-chat.tsx#SUGGESTIONS` defines the quick-start pills
rendered on empty-chat state:

1. **Full starter pack** — composite prompt that asks for strategy map
   + 3 scripts + quadrant + cadence table in one turn.
2. **Content strategy map** — mermaid flowchart.
3. **3 full scripts** — hook/beats/pattern-interrupt/CTA markdown.
4. **Effort vs impact** — mermaid quadrantChart.
5. **Performance diagnosis** — mermaid flowchart symptom → cause → fix.

Each pill appends `@{clientName}` so the first turn gets the mention
context.

## Diagnostic scripts

| Script | What it checks |
|---|---|
| `scripts/inspect-nerd-errors.ts` | Queries `api_error_log` via Supabase REST for the last N `/api/nerd/chat` failures. Use this first when the chat misbehaves — direct DB host is gone so this replaces the old psql path. |
| `scripts/smoke-nerd-tools.ts` | Registers all 48 nerd tools, asserts each `getToolsForAPI()` entry emits `type: "object"`, verifies the `max_completion_tokens` regex for gpt-5.4-mini / gpt-4.1 / o-series. Guards against Zod schema regressions and token-field regressions. |
| `scripts/smoke-markdown-tables.tsx` | renderToStaticMarkup of a markdown sample with a GFM table. Asserts `<table>` + 3 `<th>` + 6 `<td>` + divider row eaten. |
| `scripts/smoke-content-lab-addendum.ts` | 15 assertions on `STRATEGY_LAB_ADDENDUM` — all load-bearing sections + keywords + length budget. |

All four are `npx tsx scripts/<name>.ts` — no build step, pull env
from `.env.local` natively.

## Future work

- **Html-visual rasterization in the full PDF** — currently only
  mermaid is rasterized. html-visual blocks still fall back to labeled
  source. Would need either a DOM snapshot of the sandboxed iframe
  (tricky) or server-side rendering.
- **Artifact persistence** — artifacts currently live only inside
  their chat message. A first-class artifacts table would let users
  save/tag/share individual outputs.
- **Shareable artifact permalinks** — public URLs that open a single
  mermaid/html-visual/table in a standalone read-only view.
- **Streaming artifact detection** — detect the first `# H1` or
  mermaid block as the "primary artifact" of a message and render a
  dedicated side panel with a sticky download button while the rest
  of the message streams.
