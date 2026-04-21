# Nativz Cortex — Explainer Video Design System

## Style Prompt

Data Drift × Swiss Pulse hybrid. Deep-black canvas feels like the inside of a GPU. Electric blue and cyan carry the signal; hot magenta marks "AI decision" moments. Typography is disciplined and architectural — Inter in tight tracking for technical copy, Space Grotesk in display weight for hero beats. Motion is fast, confident, and purposeful: things snap into place with expo.out entrances, numbers count up from zero, particles coalesce into meaning. No floaty decoration. Every frame earns its pixels. This is the aesthetic of a system that already won — calm, bright, inevitable.

## Colors

- **Canvas Black** `#05060B` — base background (NOT pure black, has a trace of blue)
- **Surface** `#0D1020` — elevated panels, UI fragments
- **Grid Line** `#1C2344` — structural rules, dividers
- **Electric Blue** `#3B82F6` — Nativz accent, primary signal
- **Cortex Cyan** `#22D3EE` — data flow, "live" state, connections
- **Signal Magenta** `#F472B6` — AI-decision emphasis, "regeneration" moments (use sparingly)
- **Text Primary** `#F5F7FF` — headlines, key numbers
- **Text Secondary** `#8A93B8` — labels, timestamps, supporting copy

## Typography

- **Display** — `"Space Grotesk", sans-serif`, weight 700, tight tracking (-0.02em) for hero headlines (120–180px)
- **Technical** — `"Inter", sans-serif`, weight 500–700 for UI labels, stats, body (24–48px)
- **Mono** — `"JetBrains Mono", monospace` for code and terminal moments (20–28px)
- `font-variant-numeric: tabular-nums` on every number column

## Motion

- Entrances: `expo.out` / `power4.out` / `back.out(1.6)` — snap into place
- Ambient: `sine.inOut` at slow rates for particles and orbital motion only
- Stagger: 60–90ms for related elements, 150ms for major reveals
- Scene cuts: every ~3s, CSS transitions between scenes (zoom, push, blur, glitch) — no jump cuts
- No element appears fully-formed; every element has an entrance tween
- Numbers always count up from 0, never just fade in

## What NOT to Do

1. No pure black `#000` backgrounds — use `#05060B` to avoid dead-flat H.264 banding
2. No linear gradients that fill the whole frame — radial gradients and localized glows only
3. No decorative-only elements — every visual must support the story beat
4. No cutesy icons, no stock illustrations, no shadow-puppet SaaS art
5. No more than 2 colors beyond canvas/text in any single frame — discipline is the aesthetic
