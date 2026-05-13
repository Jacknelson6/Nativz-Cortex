# Content Calendar — Mobile PRD

**Routes:** `/calendar`, `/calendar/[id]`, `/calendar/review`
**Actor:** admin + viewer (brand-scoped)
**Sidebar:** Brand tools → Content → Calendar

## Purpose
The brand's content scheduling cockpit. View, create, edit, approve drops; preview captions; trigger schedule to Zernio; share links to clients for approval.

## Desktop UI (UNCHANGED)
- **`/calendar` landing:** drop list (table view default) + "new drop" CTA. Filter bar (month, status, platform).
- **`/calendar/[id]`:** drop editor — left column is a multi-platform composer (caption + media per platform), right column is preview pane.
- **`/calendar/review`:** rolled-up review queue across drops; cards show what's pending client comment / approval.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T4, T5, T6**

### `/calendar` landing
- **Table → card list** (T4). Each card: cover thumbnail (16:9 crop), title, scheduled date+time, platform icons row, status pill, kebab for actions.
- Filter bar becomes a sticky pill row (T6). "All / Drafts / Scheduled / Posted / Failed" segmented control.
- "New drop" becomes a floating action button (FAB) bottom-right, 56 × 56, brand accent. Sits above the bottom tab bar.
- Calendar month-grid view (if present): hide on mobile (`max-lg:hidden`); list view is canonical on mobile.

### `/calendar/[id]` (drop editor)
- Single column. Platform tabs (Instagram / TikTok / YouTube / LinkedIn / Facebook) become a horizontal-scroll pill row (T6) at the top.
- Active platform's composer fills the viewport. Each composer: media uploader (drag-drop → tap-to-upload on mobile), caption textarea, hashtags, CTA, cover image.
- Preview pane (right column on desktop) → "Preview" pill in the sticky header opens it as a bottom sheet (T5). 9:16 phone-frame mock fills the sheet.
- Save / Schedule / Send for review buttons collapse into a sticky bottom action bar. Primary action is full-width.

### `/calendar/review`
- Same card list pattern as `/calendar`. Add an extra status field per card: "X views, Y comments, last touched Z."
- Quick actions per card (mark approved, send followup): kebab opens sheet with options.

## Touch & sizing
- Caption textarea: min 6 lines, 16px font (no iOS zoom).
- Hashtag chip input: full-width below caption.
- Cover thumbnail: tap → open in lightbox sheet, swipe down to dismiss.

## Out of scope
- Drag-to-reorder drops (long-press → up/down chevrons on mobile; T7).
- Bulk schedule selection.
- The compositor preview-render dev tool — desktop only.

## Acceptance criteria
- Creating a drop with cover image + caption is doable one-handed on iPhone SE.
- Switching platforms inside the editor preserves form state.
- Schedule action shows a confirmation sheet before firing.
- Desktop diff = 0 at `lg+`.
