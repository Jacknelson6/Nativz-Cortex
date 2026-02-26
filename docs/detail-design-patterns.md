# Detail.design patterns for Nativz Cortex

Curated from [detail.design](https://detail.design/) — 95 total patterns reviewed, these are the ones applicable to our dual-dashboard platform.

---

## Motion and animation

| # | Pattern | What it does | Where to use it |
|---|---------|--------------|-----------------|
| 1 | **[Animated action button](https://detail.design/animated-action-button)** | Adds thoughtful animation timing and visual feedback to action buttons | Search button, approve/reject buttons, "new search" CTAs |
| 2 | **[Animated sidebar icon](https://detail.design/animated-sidebar-icon)** | Sidebar toggle icon animates to mirror the sidebar opening/closing motion | Admin and portal sidebar collapse toggle |
| 3 | **[ASCII loaders](https://detail.design/ascii-loaders)** | Text-based loading animations using character sequences | During the 1-2 minute AI search processing wait |
| 4 | **[Stagger for the event order](https://detail.design/stagger-for-the-event-order)** | Sequences element movement over time instead of all at once, creating visual hierarchy | Client list, search history rows, trending topics table, video idea cards |
| 5 | **[Interruptible animation](https://detail.design/interruptible-animation)** | Allows users to trigger close/cancel without waiting for animations to finish | Modal dialogs, sidebar transitions, dropdown menus |
| 6 | **[Smooth highlight block transition](https://detail.design/smooth-highlight-block-transition)** | Fluid animated transition when highlighting content blocks | Active nav items in sidebar, selected filter chips |
| 7 | **[Closing modal respects physics](https://detail.design/closing-modal-respect-physics)** | Modal tracks scroll position during close animation, maintaining user context | Approve/reject confirmation dialogs, client settings modals |
| 8 | **[Shake disabled button while clicking](https://detail.design/shake-disabled-button-while-clicking)** | Subtle shake animation when users click a disabled button | Disabled search button (missing required fields), disabled approve button |
| 9 | **[Reduced animation for frequently used features](https://detail.design/reduced-animation-for-frequently-used-feature)** | Minimal or no animation for repeated interactions to prioritize efficiency | Sidebar navigation, filter chip toggles, pagination |
| 10 | **[Music player layout shift](https://detail.design/music-player-layout-shift)** | Elements smoothly animate into new positions rather than jumping | Results page sections loading in, expanding topic rows |
| 11 | **[Liquid glass switcher](https://detail.design/liquid-glass-switcher)** | Frosted glass aesthetic with smooth fluid animations on toggle switches | Theme toggle (future dark mode), view mode switchers |

---

## Loading and progress

| # | Pattern | What it does | Where to use it |
|---|---------|--------------|-----------------|
| 12 | **[Self-explanatory load bar](https://detail.design/self-explanatory-load-bar)** | Progress bar that provides spatial context and clarifies what's happening | Search processing progress (Brave fetch → AI analysis → done) |
| 13 | **[Dynamic favicon](https://detail.design/dynamic-favicon)** | Updates browser tab icon to reflect real-time page state | Show search status (pending/processing/complete) in the tab icon |
| 14 | **[Colorful cursor blink](https://detail.design/colorful-cursor-blink)** | Input cursor cycles through brand colors while blinking | Search input field — cycle through Nativz brand colors to signal AI-powered search |

---

## Forms and input

| # | Pattern | What it does | Where to use it |
|---|---------|--------------|-----------------|
| 15 | **[Morphing button to input](https://detail.design/morphing-button-to-input)** | Button smoothly transforms into an input field | "Quick search" button on dashboard morphing into the search input |
| 16 | **[Pre-filled with example content](https://detail.design/pre-filled-with-example-content-not-empty)** | Forms show example content instead of empty fields to reduce friction | Search form placeholder with example topics like "sustainable fashion trends" |
| 17 | **[Dynamic role of enter key](https://detail.design/dynamic-role-of-enter-key)** | Enter key behavior adapts based on context | Enter submits search on the form, but adds a newline in notes/description fields |
| 18 | **[Form respects keyboard](https://detail.design/form-respects-keyboard)** | Users can complete and submit forms entirely with keyboard | Search form, login forms, client creation form |
| 19 | **[Clicking the input label focuses the input field](https://detail.design/clicking-the-input-label-focus-the-input-field)** | Proper `<label for>` associations expand hit area | All form inputs across admin and portal |
| 20 | **[Paste with intent](https://detail.design/paste-with-intent)** | App recognizes pasted content type and transforms it appropriately | Pasting a URL into search could auto-detect the topic/domain |

---

## Navigation and scrolling

| # | Pattern | What it does | Where to use it |
|---|---------|--------------|-----------------|
| 21 | **[Keep state in URL](https://detail.design/keep-state-in-url)** | Encodes filters, search queries, and view modes into the URL for sharing/bookmarking | Search filters, search history filters, client list filters |
| 22 | **[Scroll landmark](https://detail.design/scroll-landmark)** | Quick-return navigation shortcut to jump back to the top of the page | Long results pages with multiple sections (metrics, emotions, topics, video ideas) |
| 23 | **[Collapse instead of close](https://detail.design/collapse-instead-of-close)** | Hides elements temporarily instead of destroying them so users can bring them back | Sidebar on mobile, filter panels, executive summary card |
| 24 | **[Anchored scrolling](https://detail.design/anchored-scrolling)** | Stable visual anchor point during list navigation — highlight locks in place while list scrolls beneath | Trending topics table, search history list |
| 25 | **[Keep entry of active view visible](https://detail.design/keep-entry-of-active-view-visible)** | Currently selected item stays visible in the viewport during navigation | Active sidebar link always visible, selected client in client list |
| 26 | **[Tap tab again to reset state](https://detail.design/tap-tab-again-to-reset-state)** | Second tap on a tab scrolls to top / resets the view | Sidebar nav items — tap "dashboard" again to refresh and scroll to top |
| 27 | **[Overscroll nested scrollers](https://detail.design/overscroll-nested-scrollers)** | Smooth edge effects when reaching scroll boundaries in nested containers | Sidebar scroll inside the main page layout, modal content scroll |

---

## Visual polish and layout

| # | Pattern | What it does | Where to use it |
|---|---------|--------------|-----------------|
| 28 | **[Outer and inner border radius](https://detail.design/outer-and-inner-border-radius)** | Layered border-radius for refined corner treatments on nested elements | Cards within cards (e.g., metric cards inside a results section card) |
| 29 | **[Blurred gradient edge](https://detail.design/blurred-gradient-edge)** | Gradient overlay that blurs/fades at container edges | Horizontal scroll areas (filter chips row), long tables |
| 30 | **[Blur trick for the optical fit](https://detail.design/blur-trick-for-the-optical-fit)** | Strategic blur application for visual alignment refinement | Icon/text alignment in sidebar, badge positioning |
| 31 | **[Text overflow cutoff](https://detail.design/text-overflow-cutoff)** | Gradient fade + ellipsis for text exceeding fixed-width containers | Long topic names in tabs, long client names in sidebar, truncated search queries in history |
| 32 | **[Prevent layout shift from font weight change](https://detail.design/prevent-layout-shift-from-font-weight-change)** | Invisible pseudo-elements reserve bold-text width to prevent reflow | Active/inactive sidebar nav items, active/inactive filter chips |
| 33 | **[CSS text-box trim](https://detail.design/css-text-box-trim)** | Eliminates invisible spacing above/below text for precise vertical alignment | Stat cards, metric numbers, badge labels |
| 34 | **[Fade edge doesn't override scrollbar](https://detail.design/fade-edge-doesnt-override-scrollbar)** | Gradient fade effects on scroll containers don't obscure the scrollbar | Search history table, trending topics table, any scrollable card content |
| 35 | **[Liquid glass button](https://detail.design/liquid-glass-button)** | Frosted glass aesthetic using backdrop blur and semi-transparent backgrounds | Primary CTA buttons, floating action buttons |
| 36 | **[Dynamic visual guideline](https://detail.design/dynamic-visual-guideline)** | Visual guidelines enhance table readability, fade on hover to focus on active row | Trending topics table, search history table |
| 37 | **[Photo response to theme mode](https://detail.design/photo-response-to-theme-mode)** | Images adapt appearance between light and dark themes | Future dark mode — adjust chart colors, card backgrounds, image treatments |

---

## AI and content features

| # | Pattern | What it does | Where to use it |
|---|---------|--------------|-----------------|
| 38 | **[Bring life to AI features](https://detail.design/bring-life-to-ai-features)** | Adds personality to AI features through visual characters and varied language | AI-generated executive summary, "AI is analyzing..." states, report generation |
| 39 | **[Search by context instead of name](https://detail.design/search-by-context-instead-of-name)** | Search understands intent and context, not just exact keywords | Topic search — guide users that natural language queries work ("what should we film about sustainable living" vs just "sustainable living") |
| 40 | **[Convert internal URLs to rich previews](https://detail.design/convert-internal-urls-to-rich-previews)** | Internal links display as rich preview cards with visual context | Links to search results within the dashboard, client references in reports |
| 41 | **[Rich previews for external URLs](https://detail.design/rich-previews-for-external-urls)** | External links show metadata preview cards (title, description, image) | Trending topic source links, video idea reference URLs in results |
| 42 | **[Sync editing content to title](https://detail.design/sync-editing-content-to-title)** | Browser tab title updates in real-time as users type | Tab title reflects current search query as user types in search form |

---

## Accessibility and interaction

| # | Pattern | What it does | Where to use it |
|---|---------|--------------|-----------------|
| 43 | **[Larger hit area than it appears](https://detail.design/larger-hit-area-than-it-appears)** | Invisible interaction area extends beyond visible button bounds (44px mobile, 24px desktop) | Small icon buttons, filter chips, sidebar nav items, close buttons |
| 44 | **[Keep default focus ring](https://detail.design/keep-default-focus-ring)** | Preserves browser default focus indicators for keyboard users | All interactive elements across the platform |
| 45 | **[Describe link action](https://detail.design/describe-link-action)** | Descriptive info about link purpose for assistive technologies | Navigation links, "view report" links, "view client" links |
| 46 | **[Tooltip in a group](https://detail.design/tooltip-in-a-group)** | Tooltips within a set flow smoothly from one to another instead of abruptly switching | Action button groups (approve/reject/edit), sidebar icon tooltips when collapsed |
| 47 | **[No pointer cursor](https://detail.design/no-pointer-cursor)** | Only show pointer cursor when clicking navigates to a new page; use default cursor otherwise | Buttons that trigger actions (approve, search) vs links that navigate |
| 48 | **[Special cursor style while hovering on people](https://detail.design/special-cursor-style-while-hovering-on-people)** | Cursor changes to indicate additional info is available | Client avatars/names — hover shows client details tooltip |

---

## Technical and meta

| # | Pattern | What it does | Where to use it |
|---|---------|--------------|-----------------|
| 49 | **[Avoid using WebP for OG images](https://detail.design/avoid-using-webp-for-og)** | Social platforms have inconsistent WebP support for Open Graph images | Use PNG/JPG for any shared report OG images |
| 50 | **[Drop the WWW prefix](https://detail.design/drop-the-www-prefix)** | Modern DNS/CDN handles apex domains; www is legacy | Domain configuration on Vercel |
| 51 | **[Themed favicon](https://detail.design/themed-favicon)** | Favicon adapts to system light/dark mode preference via `prefers-color-scheme` | Serve different Nativz favicon for light vs dark OS theme |
| 52 | **[Dynamic theme color](https://detail.design/dynamic-theme-color)** | Browser meta theme-color matches page background and updates dynamically | Match browser chrome to the indigo brand color on key pages |
| 53 | **[Make the page portal-proof](https://detail.design/make-the-page-portal-proof)** | Ensures pages work properly when embedded within other sites/iframes | Future: if client portal reports are embedded elsewhere |
| 54 | **[Respect brand name](https://detail.design/respect-brand-name)** | Always use correct capitalization/formatting for brand names | "Nativz" (not "nativz"), client brand names displayed correctly |
| 55 | **[Interactive 404 page](https://detail.design/interactive-404-page)** | Transforms 404 error into an engaging branded experience | Custom 404 page for both admin and portal |
| 56 | **[Interactive error page](https://detail.design/interactive-error-page)** | Thoughtfully crafted error pages that turn frustration into delight | Custom error boundary pages with helpful recovery actions |

---

## Summary

**56 applicable patterns** out of 95 total, organized into 8 categories:

- **Motion and animation** — 11 patterns
- **Loading and progress** — 3 patterns
- **Forms and input** — 6 patterns
- **Navigation and scrolling** — 7 patterns
- **Visual polish and layout** — 10 patterns
- **AI and content features** — 5 patterns
- **Accessibility and interaction** — 6 patterns
- **Technical and meta** — 8 patterns

### Excluded patterns (not applicable)

The remaining 39 patterns were excluded because they're specific to native iOS/Android apps, file system UIs, code editors, music players, map interfaces, or other contexts that don't apply to a web-based dashboard platform.
