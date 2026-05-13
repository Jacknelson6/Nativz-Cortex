# Strategy Lab — Mobile PRD

**Route:** `/lab`
**Actor:** admin + viewer (brand-scoped)
**Sidebar:** Brand tools → Strategy Lab

## Purpose
Chat with a brand-aware AI. Brand context is auto-attached; user can attach prior topic searches, ideas, notes. Output is content strategy guidance, scripts, hooks, etc.

## Desktop UI (UNCHANGED)
- 3-column layout: left rail (conversations list), center (chat thread), right (context / attached entities panel).
- Composer pinned at bottom of center column with attachment chip, model selector, send.
- Slash-commands trigger an inline command palette.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T5**

### Layout
- Collapse to single column — chat thread fills the viewport.
- **Left rail (conversations)** → opens as a left drawer via a hamburger icon in the page header (not the global app drawer — this is page-local). Drawer slides in from the left and shows the conversation list; tap to switch threads.
- **Right rail (attached context)** → opens as a bottom sheet via a "context (N)" pill below the page header. Sheet lists attached entities with remove buttons + add affordance.

### Composer
- Stays pinned to bottom. `pb-[env(safe-area-inset-bottom)]`.
- On focus, viewport adjusts so the active line is visible above the keyboard (`scroll-into-view` on the active textarea).
- Attachment + model controls collapse into a single "+" button on mobile that opens an action sheet (Attach search / Attach idea / Switch model).
- Send button stays inline, 44 × 44.

### Slash commands
- On desktop: inline popover above the composer.
- On mobile: typing "/" opens a bottom sheet with the command list. Tap to select, sheet dismisses, command inserted into composer.

### Chat thread
- Messages already render full-width. Bump `max-lg:text-[15px]` for readability.
- Streaming responses: keep the typing-indicator pill at the bottom. Auto-scroll only if user is at the bottom already (current behavior).
- Code blocks: add horizontal scroll on overflow; tap-to-copy button persistent (no hover required).

## Touch & sizing
- Conversation list rows: 56px tall, 16px horizontal padding.
- Attached-entity chips in sheet: 44px tall.

## Out of scope
- Side-by-side compare of two conversations (desktop-only power feature).
- Mid-message edits via cursor (still allowed by long-pressing a message → edit, which opens a sheet).

## Acceptance criteria
- Composer never gets covered by the iOS keyboard.
- Conversation drawer feels native (60fps slide-in).
- Streaming text doesn't jank scroll.
- Desktop diff = 0 at `lg+`.
