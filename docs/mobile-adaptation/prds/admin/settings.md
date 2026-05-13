# Settings — Mobile PRD

**Routes:** `/admin/settings`, `/admin/settings/ai`, `/admin/settings/production-updates`, `/admin/settings/usage`
**Actor:** admin
**Sidebar:** Admin → Settings

## Purpose
Cortex platform-wide settings. AI configuration (models, defaults), production updates feed, usage metering, plus root settings index.

## Desktop UI (UNCHANGED)
- Settings index with section cards linking to sub-pages.
- **AI:** model selector, default temperature, per-feature model overrides, prompt-cache toggles.
- **Production updates:** internal changelog / what's new editor.
- **Usage:** Cortex platform usage metering (different from `/admin/usage`; this is the settings-flavored view).

## Mobile transformations
**Apply from playbook: T1, T2, T3, T5**

### Index
- Section cards stack 1-up.

### AI settings
- Single-column form. Model selectors via sheet picker (T5) showing each model's gloss + recommended use.
- Per-feature override list as cards, each tappable to edit.

### Production updates
- Long-form editor → "Edit on desktop" hint at top. Read-only listing on mobile.

### Usage (settings flavor)
- Mirror `/admin/usage` PRD treatment.

## Out of scope
- Side-by-side model comparison UI.

## Acceptance criteria
- Changing the default model + saving takes <30s on phone.
- Desktop diff = 0 at `lg+`.
