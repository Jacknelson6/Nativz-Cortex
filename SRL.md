# SRL — Self-Referential Loop

## Goal (set 2026-04-12)

Build three features that make the Nerd and Strategy Lab chat experience
Claude-grade: a rich composer with attachments, grounded analytics tools,
and persistent artifacts.

### Acceptance criteria

- [ ] **Shared composer component** used by both `/admin/nerd` and Strategy Lab
- [ ] **Attachment tray** above input showing chips (research, PDFs, images, files) with dismiss
- [ ] **Paperclip menu** with options: Upload file, Attach research, Attach knowledge entry, Attach moodboard
- [ ] **Drag-and-drop** anywhere on the chat pane to attach files
- [ ] **PDF parsing** — uploaded PDFs extracted as temporary context chunks sent to the Nerd
- [ ] **Image support** — uploaded images passed as vision model input to the Nerd
- [ ] **Analytics tool grounding** — when user asks "diagnose my performance", the Nerd reaches for `get_analytics_summary`, `compare_client_performance`, `get_top_posts`
- [ ] **Artifact persistence** — every deliverable the Nerd creates (video ideas, hook ideas, scripts, plans, diagrams) is saved to a table and browseable in a history/gallery view
- [ ] **Artifact auto-save** — assistant messages containing deliverables are detected and saved automatically (or with a one-click "Save artifact" button)
- [ ] **Artifact PDF export** — individual artifacts can be exported as standalone PDFs

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
