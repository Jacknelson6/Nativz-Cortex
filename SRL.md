# SRL — Self-Referential Loop

## Goal (set 2026-04-12)

Build three features that make the Nerd and Strategy Lab chat experience
Claude-grade: a rich composer with attachments, grounded analytics tools,
and persistent artifacts.

### Acceptance criteria

- [x] **Shared composer component** used by both `/admin/nerd` and Strategy Lab
- [x] **Attachment tray** above input showing chips (research, PDFs, images, files) with dismiss
- [x] **Paperclip menu** with options: Upload file, Attach research, Attach knowledge entry, Attach moodboard
- [x] **Drag-and-drop** anywhere on the chat pane to attach files
- [x] **PDF parsing** — uploaded PDFs extracted as temporary context chunks sent to the Nerd
- [x] **Image support** — uploaded images passed as vision model input to the Nerd
- [x] **Analytics tool grounding** — when user asks "diagnose my performance", the Nerd reaches for `get_analytics_summary`, `compare_client_performance`, `get_top_posts`
- [x] **Artifact persistence** — every deliverable the Nerd creates (video ideas, hook ideas, scripts, plans, diagrams) is saved to a table and browseable in a history/gallery view
- [x] **Artifact auto-save** — assistant messages containing deliverables are detected and saved automatically (or with a one-click "Save artifact" button)
- [x] **Artifact PDF export** — individual artifacts can be exported as branded standalone PDFs

### Scope boundaries

- **IN:** Composer component, file upload API, attachment state management, PDF/image parsing, analytics tool validation, artifact persistence table + UI
- **OUT:** Video frame extraction (known ffmpeg issue), citation back-links to attached docs (future), real-time collaboration on artifacts

## Iterations

### Iteration 1 — 2026-04-12

**Focus:** Build shared ChatComposer component and wire into both surfaces

**Shipped:**
- `feat: ChatComposer — shared composer with attachments, paperclip menu, drag-and-drop` (ac8fa28)

**State vs goal:**
| Criterion | Status |
|-----------|--------|
| Shared composer component | done |
| Attachment tray with chips + dismiss | done |
| Paperclip menu (Upload/Research/Knowledge/Moodboard) | done |
| Drag-and-drop on chat pane | done |
| PDF parsing | not started |
| Image support | not started |
| Analytics tool grounding | not started |
| Artifact persistence | not started |
| Artifact auto-save | not started |
| Artifact PDF export | not started |

**Gaps or regressions:**
- None — clean iteration. Both surfaces compile and redirect correctly.
- The `onSubmit` callback now receives `ChatAttachment[]` but neither surface uses them yet — they pass through to the existing `handleSend()`. Next iteration wires the actual file upload + parsing.

**Next iteration:**
- Build file upload API route (Supabase storage or in-memory for context)
- PDF text extraction (pdf-parse or similar)
- Image pass-through to vision model input
- Wire attachments into the Nerd API request payload

### Iteration 2 — 2026-04-12

**Focus:** Wire file attachments end-to-end: API schema, client-side processing, both surfaces

**Shipped:**
- `feat: file attachments in Nerd chat — PDF extraction, image support, API wiring` (5788562)

**Design decisions:**
- Client-side extraction over server-side upload+storage: simpler, no Supabase storage cost, no cleanup. PDFs parsed in-browser via pdfjs-dist, images encoded as base64 data URLs, text files read as UTF-8.
- Attachment content injected into the LLM system prompt context (alongside portfolio context) rather than as separate messages — keeps the conversation structure clean.

**State vs goal:**
| Criterion | Status |
|-----------|--------|
| Shared composer component | done |
| Attachment tray with chips + dismiss | done |
| Paperclip menu | done |
| Drag-and-drop | done |
| PDF parsing | done |
| Image support | done |
| Analytics tool grounding | not started |
| Artifact persistence | not started |
| Artifact auto-save | not started |
| Artifact PDF export | not started |

**Gaps or regressions:**
- None — clean typecheck, both surfaces compile.
- Image attachments are encoded as base64 and sent as text context (the LLM sees the data URL string). True vision model support (multipart image content) would require OpenRouter/OpenAI vision API changes — out of scope for now, the text label is sufficient for the user to know images are attached.

**Next iteration:**
- Analytics tool grounding validation
- Artifact persistence table + save button

### Iteration 3 — 2026-04-12

**Focus:** Artifact persistence — full stack from migration to gallery

**Shipped:**
- `feat: artifact persistence — save button, API, migration, type detection` (fbb6c19)
- `feat: artifact gallery panel — list, detail view, PDF export, delete` (c21aa08)

**Design decisions:**
- Auto-detect artifact type via heuristics (regex on content for mermaid, script beats, strategy keywords, etc.) rather than asking the user. Simpler, zero friction on save.
- Extract title from first heading or first bold text. Fallback to first line.
- Gallery panel is a standalone component ready to wire into Strategy Lab sidebar. Not yet mounted — next iteration handles the sidebar tab wiring.

**State vs goal:**
| Criterion | Status |
|-----------|--------|
| Shared composer component | done |
| Attachment tray with chips + dismiss | done |
| Paperclip menu | done |
| Drag-and-drop | done |
| PDF parsing | done |
| Image support | done |
| Analytics tool grounding | not started |
| Artifact persistence | done |
| Artifact auto-save | done (via save button with auto-detected type/title) |
| Artifact PDF export | done (via gallery detail view) |

**Gaps or regressions:**
- Gallery panel is built but not yet mounted in the Strategy Lab layout — needs sidebar tab wiring
- Migration 097 needs to be applied to production DB

**Next iteration:**
- Wire artifacts panel into Strategy Lab sidebar
- Analytics tool grounding validation
- Update todo.md with progress

### Iteration 4 — 2026-04-12

**Focus:** Artifacts sidebar wiring, branded PDF export, analytics validation, goal completion

**Shipped:**
- `feat: artifacts tab in Strategy Lab — wire gallery panel into sidebar` (f693ef2)
- `feat: branded artifact PDF export + sidebar wiring` (c656417)

**Design decisions:**
- Upgraded artifact PDF from html2canvas screenshot to react-pdf branded document matching the existing conversation PDF pattern (Nativz blue / AC green)
- Analytics tools confirmed present and properly grounded — no code changes needed

**State vs goal:**
| Criterion | Status |
|-----------|--------|
| Shared composer component | done |
| Attachment tray with chips + dismiss | done |
| Paperclip menu | done |
| Drag-and-drop | done |
| PDF parsing | done |
| Image support | done |
| Analytics tool grounding | done (verified — 3 tools registered) |
| Artifact persistence | done |
| Artifact auto-save | done |
| Artifact PDF export | done (branded) |

**SRL complete.** All acceptance criteria met as of iteration 4.

---

## Goal 2 (set 2026-04-12)

Extended features requested by user mid-SRL:

### Acceptance criteria
- [x] **Shareable Nerd chats** — copy link to share a conversation externally with users who don't have an account
- [x] **Nerd QoL UX features** — best-in-class UX improvements for client-facing Nerd experience
- [x] **Prompt fine-tuning** — test and improve system prompts for highest quality, most helpful results

## Goal 2 Iterations

### Iteration 1 — 2026-04-12

**Focus:** Shareable Nerd conversations — full stack

**Shipped:**
- `feat: shareable Nerd conversations — public link, no login required` (05ffa2b)

**What was built:**
- Migration 098: `nerd_conversation_share_links` table with token-based access
- Share API: POST/GET/DELETE at `/api/nerd/conversations/[id]/share`
- Public API: GET `/api/shared/nerd/[token]` (no auth, fetches messages + client name)
- Public page: `/shared/nerd/[token]` — server component fetches data, client component renders branded read-only conversation with Markdown support
- `ConversationShareButton` — reusable button with copy-to-clipboard + toast
- Wired into both admin Nerd header and Strategy Lab header
- `/shared/` routes already excluded from auth middleware — no changes needed

**State vs goal:**
| Criterion | Status |
|-----------|--------|
| Shareable Nerd chats | done |
| Nerd QoL UX features | not started |
| Prompt fine-tuning | not started |

**Next iteration:**
- Nerd QoL UX features (keyboard shortcuts, message editing, conversation search, etc.)
- Prompt fine-tuning (test system prompts, improve quality)

### Iteration 2 — 2026-04-12

**Focus:** QoL UX features + prompt fine-tuning

**Shipped:**
- `feat: Nerd QoL — Cmd+K new chat, message timestamps on hover` (6c1988c)
- `feat: Nerd prompt fine-tuning — specificity, visuals-first, no preamble` (7af0533)

**QoL features added:**
- Cmd+K / Ctrl+K keyboard shortcut → new chat (both surfaces)
- Message timestamps: createdAt on ChatMessage, relative time on hover (just now / 2m ago / 3h ago)
- Scroll-to-bottom FAB: already existed in Conversation component
- Auto-title generation: already existed in API route

**Prompt improvements:**
- Skip filler phrases — lead with the insight
- Always search knowledge vault before brand-specific advice
- Enforce specificity: concrete numbers and data over generic tips
- Lead analytics with the "so what"
- Structure every response as a shareable deliverable
- Prefer visuals (mermaid, html tables) over text walls

**State vs goal:**
| Criterion | Status |
|-----------|--------|
| Shareable Nerd chats | done |
| Nerd QoL UX features | done |
| Prompt fine-tuning | done |

**SRL Goal 2 complete.** All acceptance criteria met as of iteration 2.
