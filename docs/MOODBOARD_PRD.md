# Nativz Cortex — Moodboard PRD

**Version:** 1.0  
**Author:** Atlas (AI Co-pilot)  
**Date:** February 24, 2026  
**Status:** Draft  

---

## 1. Overview & Vision

### Problem
Social media marketing agencies spend hours manually reviewing competitor content, screenshotting videos, writing notes in scattered Google Docs, and trying to reverse-engineer what makes viral content work. There's no purpose-built tool that combines visual content curation with AI-powered video intelligence.

### Vision
**"FigJam meets video intelligence."** The Moodboard is an infinite canvas where agency teams paste social media videos, automatically extract metadata and transcripts, run AI analysis on hooks/pacing/CTAs, and generate production-ready replication briefs — all in a collaborative, visual workspace.

### Current State
The moodboard exists as a functional MVP at `app/admin/moodboard/`. It uses React Flow for the canvas with four node types (video, image, website, sticky note). Video processing extracts metadata via oEmbed (YouTube, Instagram) and a custom TikTok scraper (`lib/tiktok/scraper.ts`). AI analysis runs via `createCompletion()` and returns hook, pacing, CTA, themes, and improvement areas. Comments and replication briefs exist.

**Key issues today:**
- TikTok metadata extraction is broken (returns "Untitled video", no thumbnail)
- No Twitter/X video support
- No freeform connections/arrows between items
- No multi-select, grouping, or alignment tools
- No filtering, tagging, or search within boards
- No board templates or sharing
- No real-time collaboration
- Analysis panel lacks tabbed UX for hook/pacing deep-dives
- No timestamp-linked comments on videos
- No PDF export for briefs

---

## 2. User Personas

### Creative Director (Jack)
- **Goal:** Quickly curate competitor/inspiration content, understand what's working, generate briefs for production
- **Behavior:** Pastes 10-20 video URLs at a time, wants instant analysis, needs to share boards with clients
- **Pain point:** Manually watching every video and taking notes is time-consuming

### Content Strategist (Agency Team)
- **Goal:** Deep-dive into video performance patterns, identify trends, build content calendars from insights
- **Behavior:** Filters by platform/theme, compares hooks across videos, annotates with sticky notes
- **Pain point:** No single tool connects curation → analysis → brief generation

### Client (View-Only)
- **Goal:** See what the agency is planning, approve creative direction, leave feedback
- **Behavior:** Views shared boards via portal, reads briefs, comments on items
- **Pain point:** Too many back-and-forth emails about creative direction

---

## 3. User Stories

### Canvas
| ID | Story | Priority |
|----|-------|----------|
| C1 | As a user, I can pan (space+drag) and zoom (cmd+scroll, pinch) the infinite canvas | P0 |
| C2 | As a user, I can paste a URL (Cmd+V) and it appears as a card at viewport center | P0 |
| C3 | As a user, I can draw freeform arrows/connections between any two items | P1 |
| C4 | As a user, I can multi-select items (shift+click or drag-select) and move them together | P1 |
| C5 | As a user, I can align selected items (top/bottom/left/right/center/distribute) | P2 |
| C6 | As a user, I can group items and collapse/expand groups | P2 |
| C7 | As a user, I can toggle the minimap for navigation | P0 |
| C8 | As a user, I can use keyboard shortcuts for all common actions | P1 |
| C9 | As a user, I see other users' cursors in real-time (future) | P3 |

### Video Items
| ID | Story | Priority |
|----|-------|----------|
| V1 | As a user, I can paste TikTok, IG Reel, YouTube Short, or Twitter/X video URLs | P0 |
| V2 | As a user, I see thumbnail, title, author, and engagement metrics auto-populated | P0 |
| V3 | As a user, I see a platform badge (TikTok/IG/YT/X icon) on each video card | P0 |
| V4 | As a user, I can hover a video card to see an inline preview | P1 |
| V5 | As a user, I can click to play the video in an expanded player without leaving the canvas | P1 |

### AI Analysis
| ID | Story | Priority |
|----|-------|----------|
| A1 | As a user, I can trigger AI analysis on any video item | P0 |
| A2 | As a user, I see a tabbed analysis panel (Overview, Transcript, Frames, Hook, Pacing, Brief) | P0 |
| A3 | As a user, I can read the full transcript with timestamps and search within it | P0 |
| A4 | As a user, I can view extracted key frames as a filmstrip with timestamps | P0 |
| A5 | As a user, I see a hook score and breakdown of why the first 3 seconds work | P1 |
| A6 | As a user, I see pacing visualization with cut markers on a timeline | P1 |
| A7 | As a user, I see auto-detected caption overlays with timestamps | P1 |
| A8 | As a user, I see identified music/sounds and whether they're trending | P2 |
| A9 | As a user, I see auto-generated content theme tags on each video | P0 |

### Collaboration
| ID | Story | Priority |
|----|-------|----------|
| CO1 | As a user, I can leave thread-based comments on any item | P0 |
| CO2 | As a user, I see comment count badges on items | P0 |
| CO3 | As a user, I can leave timestamp-linked comments on videos | P1 |
| CO4 | As a user, I can @mention team members in comments (future) | P3 |

### Replication
| ID | Story | Priority |
|----|-------|----------|
| R1 | As a user, I can generate a replication brief for any analyzed video | P0 |
| R2 | As a user, I can select which client the brief is for | P0 |
| R3 | As a user, the brief includes: concept adaptation, hook, script outline, shot list, music direction | P0 |
| R4 | As a user, I can export a brief as PDF | P1 |

### Board Management
| ID | Story | Priority |
|----|-------|----------|
| B1 | As a user, I can create multiple boards per client | P0 |
| B2 | As a user, I can create boards from templates | P1 |
| B3 | As a user, I can share a view-only board link for clients | P1 |
| B4 | As a user, I can archive and delete boards | P0 |

### Organization
| ID | Story | Priority |
|----|-------|----------|
| O1 | As a user, I can add manual tags to items | P1 |
| O2 | As a user, I can filter the canvas by tag, platform, or analysis status | P1 |
| O3 | As a user, I can search across all items in a board | P1 |
| O4 | As a user, I can sort items by date, engagement, or analysis score | P2 |

---

## 4. Feature Specifications

### 4.1 Canvas Experience

#### 4.1.1 Infinite Canvas (P0) — *Exists*
- **Current:** React Flow with pan/zoom, background grid, controls
- **File:** `app/admin/moodboard/[id]/page.tsx`
- **Acceptance criteria:**
  - [x] Pan via scroll/drag
  - [x] Zoom via ctrl+scroll
  - [x] Background grid
  - [x] Fit-to-view button

#### 4.1.2 Paste-to-Add (P0) — *Exists*
- **Current:** Cmd+V pastes URL at viewport center with random offset
- **File:** `app/admin/moodboard/[id]/page.tsx` → `addItemFromPaste()`
- **Acceptance criteria:**
  - [x] Detect URL from clipboard
  - [x] Auto-detect platform type
  - [x] Place at viewport center
  - [ ] Support pasting multiple URLs (one per line) → creates multiple items
  - [ ] Show drop zone animation on paste

#### 4.1.3 Freeform Connections (P1) — *New*
- **Description:** Users can draw arrows/lines between any two items to show relationships (e.g., "inspired by", "similar hook")
- **Implementation:** React Flow edges with custom edge types
- **Acceptance criteria:**
  - [ ] Drag from source handle to target handle creates a connection
  - [ ] Edge styles: solid arrow, dashed line, colored line
  - [ ] Optional label on edge (editable on double-click)
  - [ ] Delete connection via right-click or backspace when selected
  - [ ] Connections persist to database

#### 4.1.4 Multi-Select & Align (P1) — *New*
- **Acceptance criteria:**
  - [ ] Shift+click to add/remove from selection
  - [ ] Drag-select (rubber band) to select multiple items
  - [ ] Move all selected items together
  - [ ] Alignment toolbar appears when 2+ items selected: align left/right/top/bottom/center-h/center-v
  - [ ] Distribute evenly (horizontal/vertical)
  - [ ] Delete all selected (with confirmation)

#### 4.1.5 Keyboard Shortcuts (P1) — *New*
| Shortcut | Action |
|----------|--------|
| `Space + drag` | Pan canvas |
| `Cmd + scroll` | Zoom |
| `Cmd + A` | Select all |
| `Cmd + C` | Copy selected items |
| `Cmd + V` | Paste URL or duplicate copied items |
| `Backspace / Delete` | Delete selected |
| `Cmd + Z` | Undo |
| `Cmd + Shift + Z` | Redo |
| `N` | New sticky note at cursor |
| `Cmd + F` | Open search |
| `Cmd + +/-` | Zoom in/out |
| `Cmd + 0` | Fit to view |
| `?` | Show shortcut help |

#### 4.1.6 Minimap (P0) — *Partially exists*
- **Current:** Toggle minimap button exists in UI
- **Acceptance criteria:**
  - [x] Toggle minimap visibility
  - [ ] Minimap shows color-coded node types (video=purple, image=blue, website=green, sticky=yellow)
  - [ ] Click minimap to navigate

### 4.2 Video Items

#### 4.2.1 Platform Support (P0)
| Platform | Metadata | Thumbnail | Transcript | Status |
|----------|----------|-----------|------------|--------|
| YouTube | oEmbed ✅ | oEmbed ✅ | Captions API ✅ | Working |
| TikTok | Custom scraper | Scraper | Whisper via video_url | **Broken** |
| Instagram | oEmbed | oEmbed | Not implemented | Partial |
| Twitter/X | Not implemented | Not implemented | Not implemented | **New** |

**TikTok fix plan:**
- Current scraper at `lib/tiktok/scraper.ts` relies on HTML scraping which breaks frequently
- **Solution:** Use [Apify TikTok Scraper](https://apify.com/clockworks/tiktok-scraper) actor via existing Apify API key (`~/.config/apify/api_key`)
- Fallback: oembed endpoint `https://www.tiktok.com/oembed?url=...` for basic title/thumbnail

**Twitter/X plan:**
- Use [Apify Twitter Scraper](https://apify.com/apidojo/twitter-scraper) or Twitter oEmbed API
- Extract: thumbnail, tweet text, engagement metrics, video duration

#### 4.2.2 Video Card Node (P0) — *Exists, needs enhancement*
- **File:** `components/moodboard/nodes/video-node.tsx`
- **Current:** Shows thumbnail, title, filmstrip, transcript snippet, theme tags, status indicators, action buttons
- **Enhancements needed:**
  - [ ] Platform badge icon (top-left corner overlay)
  - [ ] Author name display
  - [ ] Engagement metrics row (views, likes, comments, shares)
  - [ ] Hover: show inline video preview (embed iframe or video element)
  - [ ] Click thumbnail: open expanded player modal
  - [ ] Comment count badge

#### 4.2.3 Metadata Extraction (P0)
For each video URL, extract:
```typescript
interface VideoMetadata {
  title: string;
  author_name: string;
  author_handle: string;
  author_avatar_url: string | null;
  thumbnail_url: string;
  duration: number; // seconds
  platform: 'tiktok' | 'instagram' | 'youtube' | 'twitter';
  stats: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
  };
  music: string | null; // sound/music name
  hashtags: string[];
  posted_at: string | null; // ISO date
}
```

### 4.3 AI Video Analysis Pipeline

#### 4.3.1 Pipeline Steps (P0)
When a user triggers "Process" on a video item:

```
1. METADATA EXTRACTION (immediate)
   ├─ Platform detection (URL pattern matching) ← exists in detectLinkType()
   ├─ oEmbed / Apify scraper for metadata
   └─ Update item with title, thumbnail, stats → DB write

2. VIDEO DOWNLOAD (background)
   ├─ Download video file to temp storage (Vercel /tmp or external)
   ├─ For TikTok: use video_url from scraper
   ├─ For YouTube: use yt-dlp or similar
   └─ Store temporarily for processing

3. TRANSCRIPT EXTRACTION (background)
   ├─ Send audio to OpenAI Whisper API
   ├─ Return timestamped transcript segments
   └─ Store transcript + segments in DB

4. FRAME EXTRACTION (background)
   ├─ Extract frames at key intervals (every 2-3 seconds)
   ├─ Use ffmpeg (via serverless function or external service)
   ├─ Upload frames to Supabase Storage
   └─ Store frame URLs + timestamps in DB

5. AI ANALYSIS (after transcript + frames ready)
   ├─ Send transcript + metadata + frame descriptions to LLM
   ├─ Structured output:
   │   ├─ Hook analysis (first 3 seconds)
   │   ├─ Pacing analysis (cuts, transitions)
   │   ├─ CTA identification
   │   ├─ Content themes (auto-tags)
   │   ├─ Winning elements
   │   ├─ Improvement suggestions
   │   ├─ Caption overlay detection
   │   └─ Music/sound identification
   └─ Store analysis in DB

6. STATUS UPDATE → 'completed'
```

#### 4.3.2 Hook Analysis Detail (P1)
```typescript
interface HookAnalysis {
  hook_text: string;              // First 1-3 sentences
  hook_type: string;              // "question" | "shocking_stat" | "controversy" | "visual_pattern_interrupt" | "relatable_moment" | "promise" | "curiosity_gap"
  hook_score: number;             // 1-10
  hook_reasoning: string;         // Why this hook works (or doesn't)
  first_frame_description: string; // What you see in the first frame
  attention_retention_estimate: string; // "high" | "medium" | "low"
  suggested_improvements: string[];
}
```

#### 4.3.3 Pacing Analysis Detail (P1)
```typescript
interface PacingAnalysis {
  total_cuts: number;
  cuts_per_minute: number;
  average_shot_duration: number;  // seconds
  pacing_style: string;           // "rapid-fire" | "moderate" | "slow-build" | "single-take"
  scene_transitions: Array<{
    timestamp: number;
    type: string;                 // "hard_cut" | "fade" | "zoom" | "swipe"
  }>;
  visual_rhythm_description: string;
  energy_curve: string;           // "builds" | "sustained" | "peaks_valleys" | "declining"
}
```

#### 4.3.4 Caption Overlay Detection (P1)
```typescript
interface CaptionOverlay {
  text: string;
  timestamp_start: number;
  timestamp_end: number;
  position: string;              // "top" | "center" | "bottom"
  style: string;                 // "bold_white" | "colored" | "subtitle_bar" | "handwritten"
}
```

### 4.4 Analysis Panel

#### 4.4.1 Side Panel (P0) — *Exists, needs redesign*
- **File:** `components/moodboard/video-analysis-panel.tsx`
- **Current:** Fixed right panel with tabs: Overview, Transcript, Frames, Pacing
- **Redesign:**

**Tabs:**
| Tab | Content |
|-----|---------|
| Overview | Video embed, concept summary, theme tags, engagement stats, winning elements, improvement areas |
| Transcript | Full timestamped transcript, search bar, click timestamp to jump in video |
| Frames | Key frame gallery (grid), click to expand, timestamp labels |
| Hook | Hook text highlight, hook type badge, score (1-10 visual), reasoning, first frame screenshot |
| Pacing | Timeline visualization with cut markers, pacing style badge, energy curve chart |
| Brief | Replication brief (if generated), or "Generate Brief" button |

**Acceptance criteria:**
- [ ] Panel slides in from right (600px wide)
- [ ] Each tab lazy-loads its content
- [ ] Transcript is searchable (Cmd+F within panel or dedicated search bar)
- [ ] Clicking a timestamp in transcript or frames scrolls/highlights the moment
- [ ] "Copy" button on each section (transcript, brief, etc.)
- [ ] "Regenerate Analysis" button to re-run AI pipeline

### 4.5 Commenting & Collaboration

#### 4.5.1 Thread Comments (P0) — *Exists*
- **File:** `components/moodboard/comment-thread.tsx`
- **API:** `app/api/moodboard/comments/route.ts`
- **Enhancements:**
  - [ ] Comment count badge on video/item cards
  - [ ] Unread indicator for new comments
  - [ ] Timestamp-linked comments: user clicks a timestamp, comment is linked to that moment

#### 4.5.2 Timestamp Comments (P1) — *New*
```typescript
interface TimestampComment extends MoodboardComment {
  video_timestamp: number | null; // seconds into video, null = general comment
}
```
- When viewing transcript, user can click a timestamp and leave a comment attached to that moment
- Comments with timestamps show a timestamp badge in the thread

### 4.6 Replication System

#### 4.6.1 Brief Generation (P0) — *Exists, needs enhancement*
- **File:** `components/moodboard/replication-brief-modal.tsx`
- **API:** `app/api/moodboard/items/[id]/replicate/route.ts`
- **Current:** Generates a text brief via AI with client selection

**Enhanced brief structure:**
```typescript
interface ReplicationBrief {
  client_id: string;
  client_name: string;
  source_video_title: string;
  source_video_url: string;
  
  concept_adaptation: string;      // How to adapt for client's brand
  suggested_hook: string;          // Adapted hook for client
  script_outline: string;          // Full script with timestamps
  shot_list: Array<{
    shot_number: number;
    description: string;
    duration: string;
    camera_angle: string;
    notes: string;
  }>;
  music_direction: string;         // Suggested sound/music style
  caption_strategy: string;        // Overlay text approach
  hashtag_suggestions: string[];
  estimated_duration: string;
  production_notes: string;
  
  generated_at: string;
}
```

#### 4.6.2 PDF Export (P1) — *New*
- Generate styled PDF from brief data using `@react-pdf/renderer` or server-side with Puppeteer
- Include: Nativz branding header, source video thumbnail, all brief sections
- Download button in analysis panel Brief tab and in brief modal

### 4.7 Board Management

#### 4.7.1 Board CRUD (P0) — *Exists*
- **Files:** `app/admin/moodboard/page.tsx`, `components/moodboard/create-board-modal.tsx`
- **API:** `app/api/moodboard/boards/route.ts`
- **Enhancements:**
  - [ ] Archive board (soft delete with `archived_at` timestamp)
  - [ ] Duplicate board (copy all items and positions)

#### 4.7.2 Board Templates (P1) — *New*
| Template | Pre-configured |
|----------|---------------|
| Competitor Analysis | Sections labeled by competitor (sticky note headers), comparison notes template |
| Content Inspiration | Grid layout, filter by platform, weekly curation areas |
| Campaign Planning | Timeline structure, brief generation workflow, client deliverable area |
| Blank | Empty canvas |

Implementation: Templates are just pre-populated boards (items, notes, positions) stored as JSON. On "Create from template", clone the template data into a new board.

#### 4.7.3 Board Sharing (P1) — *New*
- Generate a unique share token per board
- Share URL: `https://cortex.nativz.io/shared/moodboard/{token}`
- View-only: no editing, no commenting (unless authenticated)
- Optionally password-protected
- Expiration date (optional)

### 4.8 Content Organization

#### 4.8.1 Tagging (P1) — *New*
- AI auto-generates tags from `content_themes` (already exists in analysis)
- Users can add/remove manual tags on any item
- Tags are board-scoped (shared tag vocabulary per board)
- Tag colors (auto-assigned from palette)

#### 4.8.2 Filtering & Search (P1) — *New*
- **Filter bar** (top of canvas, collapsible):
  - Platform: TikTok, Instagram, YouTube, Twitter/X
  - Status: Pending, Processing, Completed, Failed
  - Tags: multi-select from available tags
  - Date range: added to board
- **Search:** Full-text search across title, transcript, tags, comments
- **Behavior:** Filtered-out items are dimmed (30% opacity) rather than hidden, so canvas layout is preserved
- **Sort:** Secondary panel for ordering (date added, views, likes, analysis score)

---

## 5. Data Model

### Existing Tables (inferred from code)

```sql
-- moodboard_boards
CREATE TABLE moodboard_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  client_id UUID REFERENCES clients(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- moodboard_items
CREATE TABLE moodboard_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES moodboard_boards(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('video', 'image', 'website')),
  url TEXT NOT NULL,
  title TEXT,
  thumbnail_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  
  -- Video-specific
  duration INTEGER,
  transcript TEXT,
  hook TEXT,
  hook_analysis TEXT,
  cta TEXT,
  concept_summary TEXT,
  pacing JSONB,
  frames JSONB DEFAULT '[]',
  caption_overlays JSONB DEFAULT '[]',
  content_themes JSONB DEFAULT '[]',
  winning_elements JSONB DEFAULT '[]',
  improvement_areas JSONB DEFAULT '[]',
  replication_brief TEXT,
  
  -- Website-specific
  screenshot_url TEXT,
  page_insights JSONB,
  
  -- Canvas
  position_x FLOAT DEFAULT 0,
  position_y FLOAT DEFAULT 0,
  width INTEGER DEFAULT 320,
  height INTEGER DEFAULT 400,
  
  -- Meta
  client_id UUID REFERENCES clients(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- moodboard_notes (sticky notes)
CREATE TABLE moodboard_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES moodboard_boards(id) ON DELETE CASCADE,
  content TEXT DEFAULT '',
  color TEXT DEFAULT 'yellow',
  position_x FLOAT DEFAULT 0,
  position_y FLOAT DEFAULT 0,
  width INTEGER DEFAULT 200,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- moodboard_comments
CREATE TABLE moodboard_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES moodboard_items(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### New Tables

```sql
-- moodboard_edges (connections between items)
CREATE TABLE moodboard_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES moodboard_boards(id) ON DELETE CASCADE,
  source_node_id TEXT NOT NULL,     -- "item-{uuid}" or "note-{uuid}"
  target_node_id TEXT NOT NULL,
  label TEXT,
  style TEXT DEFAULT 'solid',       -- 'solid' | 'dashed' | 'dotted'
  color TEXT DEFAULT '#888888',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- moodboard_tags
CREATE TABLE moodboard_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES moodboard_boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  UNIQUE(board_id, name)
);

-- moodboard_item_tags (junction)
CREATE TABLE moodboard_item_tags (
  item_id UUID REFERENCES moodboard_items(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES moodboard_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);

-- moodboard_share_links
CREATE TABLE moodboard_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES moodboard_boards(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  password_hash TEXT,               -- bcrypt hash, null = no password
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- moodboard_board_templates
CREATE TABLE moodboard_board_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  template_data JSONB NOT NULL,     -- { items: [], notes: [], edges: [] }
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ALTER existing tables
ALTER TABLE moodboard_boards ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE moodboard_boards ADD COLUMN template_id UUID REFERENCES moodboard_board_templates(id);

ALTER TABLE moodboard_items ADD COLUMN platform TEXT;          -- 'tiktok' | 'youtube' | 'instagram' | 'twitter'
ALTER TABLE moodboard_items ADD COLUMN author_name TEXT;
ALTER TABLE moodboard_items ADD COLUMN author_handle TEXT;
ALTER TABLE moodboard_items ADD COLUMN stats JSONB;            -- { views, likes, comments, shares }
ALTER TABLE moodboard_items ADD COLUMN music TEXT;
ALTER TABLE moodboard_items ADD COLUMN hashtags JSONB DEFAULT '[]';
ALTER TABLE moodboard_items ADD COLUMN hook_score INTEGER;     -- 1-10
ALTER TABLE moodboard_items ADD COLUMN hook_type TEXT;
ALTER TABLE moodboard_items ADD COLUMN pacing_detail JSONB;    -- expanded pacing analysis
ALTER TABLE moodboard_items ADD COLUMN transcript_segments JSONB DEFAULT '[]'; -- timestamped segments

ALTER TABLE moodboard_comments ADD COLUMN video_timestamp INTEGER; -- seconds, null = general comment

-- Indexes
CREATE INDEX idx_moodboard_items_board ON moodboard_items(board_id);
CREATE INDEX idx_moodboard_items_status ON moodboard_items(status);
CREATE INDEX idx_moodboard_items_platform ON moodboard_items(platform);
CREATE INDEX idx_moodboard_comments_item ON moodboard_comments(item_id);
CREATE INDEX idx_moodboard_edges_board ON moodboard_edges(board_id);
CREATE INDEX idx_moodboard_item_tags_item ON moodboard_item_tags(item_id);
CREATE INDEX idx_moodboard_share_links_token ON moodboard_share_links(token);
```

---

## 6. API Routes

### Existing Routes
| Method | Route | Purpose | File |
|--------|-------|---------|------|
| GET/POST | `/api/moodboard/boards` | List/create boards | `app/api/moodboard/boards/route.ts` |
| GET/PUT/DELETE | `/api/moodboard/boards/[id]` | Board CRUD | `app/api/moodboard/boards/[id]/route.ts` |
| PUT | `/api/moodboard/boards/[id]/positions` | Batch update positions | `app/api/moodboard/boards/[id]/positions/route.ts` |
| GET/POST | `/api/moodboard/items` | List/create items | `app/api/moodboard/items/route.ts` |
| GET/PUT/DELETE | `/api/moodboard/items/[id]` | Item CRUD | `app/api/moodboard/items/[id]/route.ts` |
| POST | `/api/moodboard/items/[id]/process` | Trigger video processing | `app/api/moodboard/items/[id]/process/route.ts` |
| POST | `/api/moodboard/items/[id]/replicate` | Generate replication brief | `app/api/moodboard/items/[id]/replicate/route.ts` |
| GET/POST | `/api/moodboard/items/[id]/insights` | Website insights | `app/api/moodboard/items/[id]/insights/route.ts` |
| GET/POST | `/api/moodboard/comments` | Comments CRUD | `app/api/moodboard/comments/route.ts` |
| PUT/DELETE | `/api/moodboard/comments/[id]` | Comment update/delete | `app/api/moodboard/comments/[id]/route.ts` |
| GET/POST | `/api/moodboard/notes` | Sticky notes CRUD | `app/api/moodboard/notes/route.ts` |
| PUT/DELETE | `/api/moodboard/notes/[id]` | Note update/delete | `app/api/moodboard/notes/[id]/route.ts` |

### New Routes
| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/moodboard/edges` | List/create connections |
| PUT/DELETE | `/api/moodboard/edges/[id]` | Update/delete connection |
| GET/POST | `/api/moodboard/boards/[id]/tags` | List/create tags for board |
| DELETE | `/api/moodboard/tags/[id]` | Delete tag |
| POST/DELETE | `/api/moodboard/items/[id]/tags` | Add/remove tag from item |
| POST | `/api/moodboard/boards/[id]/share` | Create share link |
| DELETE | `/api/moodboard/boards/[id]/share` | Revoke share link |
| GET | `/api/shared/moodboard/[token]` | Public view-only board |
| GET | `/api/moodboard/templates` | List available templates |
| POST | `/api/moodboard/boards/[id]/duplicate` | Duplicate board |
| POST | `/api/moodboard/boards/[id]/archive` | Archive/unarchive board |
| POST | `/api/moodboard/items/[id]/reprocess` | Re-run AI analysis |
| GET | `/api/moodboard/items/[id]/brief/pdf` | Export brief as PDF |
| GET | `/api/moodboard/boards/[id]/search` | Full-text search across board items |

---

## 7. Component Architecture

```
app/admin/moodboard/
├── page.tsx                           # Board list (exists)
├── [id]/page.tsx                      # Board canvas (exists)
└── shared/[token]/page.tsx            # Public shared view (new)

components/moodboard/
├── nodes/
│   ├── video-node.tsx                 # Video card (exists, enhance)
│   ├── image-node.tsx                 # Image card (exists)
│   ├── website-node.tsx               # Website card (exists)
│   └── sticky-node.tsx                # Sticky note (exists)
├── edges/
│   └── labeled-edge.tsx               # Custom edge with label (new)
├── panels/
│   ├── video-analysis-panel.tsx       # Analysis side panel (exists → refactor)
│   ├── analysis-tabs/
│   │   ├── overview-tab.tsx           # Summary + stats (new)
│   │   ├── transcript-tab.tsx         # Searchable transcript (new)
│   │   ├── frames-tab.tsx             # Frame gallery (new)
│   │   ├── hook-tab.tsx               # Hook deep-dive (new)
│   │   ├── pacing-tab.tsx             # Pacing visualization (new)
│   │   └── brief-tab.tsx              # Replication brief (new)
│   └── filter-panel.tsx               # Filter/search sidebar (new)
├── toolbar/
│   ├── canvas-toolbar.tsx             # Top toolbar: add, filter, search, zoom (new)
│   ├── selection-toolbar.tsx          # Appears on multi-select: align, group (new)
│   └── keyboard-shortcuts-modal.tsx   # Shortcut reference (new)
├── modals/
│   ├── add-item-modal.tsx             # Add item (exists)
│   ├── create-board-modal.tsx         # Create board (exists)
│   ├── replication-brief-modal.tsx    # Brief modal (exists, enhance)
│   ├── share-board-modal.tsx          # Share settings (new)
│   ├── template-picker-modal.tsx      # Template selection (new)
│   └── video-player-modal.tsx         # Expanded video player (new)
├── comment-thread.tsx                 # Comments (exists, enhance)
└── hooks/
    ├── use-moodboard-shortcuts.ts     # Keyboard shortcut handler (new)
    ├── use-canvas-paste.ts            # Paste URL handler (refactor from page)
    └── use-board-filters.ts           # Filter state management (new)

lib/
├── types/moodboard.ts                # Types (exists, extend)
├── tiktok/scraper.ts                  # TikTok scraper (exists, fix)
├── video/
│   ├── metadata.ts                    # Platform-agnostic metadata extraction (new)
│   ├── transcript.ts                  # Whisper API integration (new)
│   ├── frames.ts                      # Frame extraction (new)
│   └── platforms/
│       ├── tiktok.ts                  # TikTok via Apify (new)
│       ├── instagram.ts               # Instagram metadata (new)
│       ├── youtube.ts                 # YouTube metadata + captions (new)
│       └── twitter.ts                 # Twitter/X metadata (new)
└── pdf/
    └── brief-template.tsx             # PDF brief template (new)
```

---

## 8. AI Pipeline — Detailed

### Step 1: Metadata Extraction
- **Input:** Video URL
- **Process:** Detect platform → call platform-specific extractor
- **TikTok:** Apify actor `clockworks/tiktok-scraper` → returns title, thumbnail, stats, music, duration, video_url
- **YouTube:** oEmbed API + YouTube Data API v3 (for stats)
- **Instagram:** oEmbed API (limited — may need Apify fallback)
- **Twitter/X:** Apify actor or Twitter API v2
- **Output:** `VideoMetadata` object → save to `moodboard_items`
- **Latency:** 2-5 seconds

### Step 2: Video Download (Temporary)
- **Input:** Video URL or direct video file URL from metadata
- **Process:** Download to Vercel `/tmp` (limited to 512MB, 10s timeout on Hobby, 60s on Pro)
- **Constraint:** Vercel serverless functions have a 50MB response/body limit and /tmp is ephemeral
- **Alternative for large files:** Use Supabase Edge Function or external worker (e.g., Inngest background job)
- **Output:** Local file path in `/tmp`

### Step 3: Transcript Extraction
- **Input:** Video file or audio extracted from video
- **Process:** 
  1. Extract audio from video (ffmpeg: `ffmpeg -i video.mp4 -vn -acodec libmp3lame audio.mp3`)
  2. Send to OpenAI Whisper API (`whisper-1` model)
  3. Request `verbose_json` response format for timestamped segments
- **Output:** Full transcript text + timestamped segments array
- **Latency:** 5-30 seconds depending on duration
- **Fallback:** If video download fails, try platform-specific caption/subtitle APIs

### Step 4: Frame Extraction
- **Input:** Video file
- **Process:**
  1. Use ffmpeg to extract frames: `ffmpeg -i video.mp4 -vf "fps=1/3" frame_%03d.jpg` (1 frame every 3 seconds)
  2. Upload frames to Supabase Storage bucket `moodboard-frames`
  3. Generate public URLs
- **Output:** Array of `{ url, timestamp, label }` objects
- **Constraint:** For a 60s video, ~20 frames at ~50KB each = ~1MB total
- **Alternative:** Use a cloud video processing service (Mux, Cloudinary) for frame extraction

### Step 5: AI Analysis
- **Input:** Transcript, metadata, frame URLs (for multimodal), platform context
- **Process:** Single LLM call with structured output
- **Model:** GPT-4o or Claude (via `createCompletion()` in `lib/ai/client.ts`)
- **Prompt structure:**
  ```
  System: You are a video content strategist for a social media marketing agency.
  
  User: Analyze this {platform} video.
  Title: {title}
  Author: {author} ({handle})
  Stats: {views} views, {likes} likes, {comments} comments, {shares} shares
  Duration: {duration}s
  Music: {music}
  Transcript: {transcript}
  
  Return a JSON object with the following structure:
  {
    hook: string,
    hook_type: "question" | "shocking_stat" | ... ,
    hook_score: 1-10,
    hook_analysis: string,
    cta: string,
    concept_summary: string,
    pacing: { ... },
    caption_overlays: [...],
    content_themes: [...],
    winning_elements: [...],
    improvement_areas: [...],
    music_analysis: string
  }
  ```
- **Output:** Structured `VideoAnalysis` object
- **Latency:** 3-10 seconds

### Step 6: Status Update
- Set `status = 'completed'`
- Emit real-time event via Supabase Realtime (for live UI updates)

### Error Handling
- If any step fails, set `status = 'failed'` with error message in a new `error_message` column
- Allow retry via "Reprocess" button
- Partial success: if metadata works but transcript fails, still save metadata and mark as `completed` with `transcript = null`

---

## 9. Technical Constraints

### Vercel Serverless Limits
| Constraint | Hobby | Pro |
|-----------|-------|-----|
| Function timeout | 10s | 60s |
| Body size | 4.5MB | 4.5MB |
| `/tmp` storage | 512MB | 512MB |
| Concurrent executions | 10 | 1000 |

**Impact on video processing:**
- Video download + ffmpeg cannot reliably run in a 10s function
- **Solution:** Use Vercel Pro (60s) OR offload to:
  - **Option A:** Supabase Edge Functions (longer timeout, Deno runtime)
  - **Option B:** Inngest (background jobs, unlimited duration, already popular with Next.js)
  - **Option C:** External worker (Railway/Fly.io) triggered via webhook
- **Recommended:** Inngest for background video processing. It handles retries, timeouts, and step functions natively.

### Inngest Architecture (Recommended)
```typescript
// lib/inngest/functions/process-video.ts
import { inngest } from '../client';

export const processVideo = inngest.createFunction(
  { id: 'process-moodboard-video', retries: 2 },
  { event: 'moodboard/video.added' },
  async ({ event, step }) => {
    const { itemId, url, platform } = event.data;
    
    const metadata = await step.run('extract-metadata', async () => { ... });
    const videoPath = await step.run('download-video', async () => { ... });
    const transcript = await step.run('extract-transcript', async () => { ... });
    const frames = await step.run('extract-frames', async () => { ... });
    const analysis = await step.run('ai-analysis', async () => { ... });
    
    await step.run('save-results', async () => { ... });
  }
);
```

### Supabase Storage
- Bucket: `moodboard-frames` (public read, authenticated write)
- Frame naming: `{board_id}/{item_id}/frame_{timestamp}.jpg`
- Cleanup: Delete frames when item is deleted (cascade via DB trigger or application logic)

### Real-time Updates
- Use Supabase Realtime subscriptions on `moodboard_items` table
- When `status` changes from `processing` → `completed`, UI auto-updates the node
- Future: Supabase Realtime for cursor presence (Broadcast channel)

---

## 10. Milestones

### Phase 1: Foundation Fix (1-2 weeks)
**Goal:** Fix what's broken, stabilize core experience

- [ ] Fix TikTok metadata extraction (switch to Apify)
- [ ] Add `platform`, `author_name`, `author_handle`, `stats` columns
- [ ] Platform badges on video cards
- [ ] Author name and engagement stats display on cards
- [ ] Improved error handling in process route
- [ ] Add "Reprocess" button for failed items
- [ ] Comment count badges on item cards

### Phase 2: Analysis Upgrade (2-3 weeks)
**Goal:** Deep AI analysis with rich presentation

- [ ] Set up Inngest for background video processing
- [ ] Whisper API integration for transcript extraction
- [ ] Timestamped transcript segments
- [ ] Frame extraction pipeline (ffmpeg via Inngest worker)
- [ ] Enhanced AI analysis prompt (hook scoring, pacing detail, caption overlays)
- [ ] Redesigned analysis panel with 6 tabs
- [ ] Hook tab with visual scoring
- [ ] Pacing tab with timeline visualization
- [ ] Searchable transcript tab

### Phase 3: Canvas Power Features (2 weeks)
**Goal:** FigJam-level canvas interactions

- [ ] Freeform connections/arrows between items (custom edges)
- [ ] Multi-select with shift+click and drag-select
- [ ] Alignment toolbar (align, distribute)
- [ ] Keyboard shortcuts (full set)
- [ ] Improved minimap with color-coded nodes
- [ ] Multi-URL paste (paste multiple URLs at once)
- [ ] Twitter/X video support

### Phase 4: Organization & Collaboration (2 weeks)
**Goal:** Tag, filter, search, share

- [ ] Manual + auto tags on items
- [ ] Filter bar (platform, status, tags)
- [ ] Full-text search across board items
- [ ] Board templates (3 templates)
- [ ] Board archiving
- [ ] Board duplication
- [ ] Timestamp-linked comments

### Phase 5: Sharing & Export (1-2 weeks)
**Goal:** Client-facing deliverables

- [ ] Board share links (view-only, optional password)
- [ ] Shared board view page
- [ ] PDF export for replication briefs
- [ ] Enhanced brief generation (shot list, music direction)

### Phase 6: Real-time & Polish (Future)
- [ ] Real-time cursor presence (Supabase Broadcast)
- [ ] @mentions in comments
- [ ] Undo/redo system
- [ ] Item grouping
- [ ] Board-level analytics (most-used tags, avg hook scores)
- [ ] Music/sound identification with trending detection

---

## 11. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Videos processed per week | 50+ | Count of items reaching `completed` status |
| Time from paste to analysis complete | < 60 seconds | Timestamp diff: `created_at` → `status = completed` |
| Replication briefs generated | 10+ per week | Count of brief generations |
| Boards created per month | 20+ | Board count |
| TikTok metadata success rate | > 95% | Successful metadata extraction / total TikTok URLs |
| Analysis accuracy (subjective) | Team rates 4+/5 | Periodic team survey |
| Client board views | 5+ per shared board | Share link access logs |
| Canvas interaction depth | Avg 15+ items per board | Items per board |

---

## Appendix A: Existing Code Reference

| Component | Path | Status |
|-----------|------|--------|
| Board list page | `app/admin/moodboard/page.tsx` | Working |
| Board canvas page | `app/admin/moodboard/[id]/page.tsx` | Working |
| Video node | `components/moodboard/nodes/video-node.tsx` | Working, needs enhancement |
| Image node | `components/moodboard/nodes/image-node.tsx` | Working |
| Website node | `components/moodboard/nodes/website-node.tsx` | Working |
| Sticky node | `components/moodboard/nodes/sticky-node.tsx` | Working |
| Analysis panel | `components/moodboard/video-analysis-panel.tsx` | Working, needs redesign |
| Brief modal | `components/moodboard/replication-brief-modal.tsx` | Working, needs enhancement |
| Comment thread | `components/moodboard/comment-thread.tsx` | Working |
| Add item modal | `components/moodboard/add-item-modal.tsx` | Working |
| Create board modal | `components/moodboard/create-board-modal.tsx` | Working |
| Type definitions | `lib/types/moodboard.ts` | Working, needs extension |
| TikTok scraper | `lib/tiktok/scraper.ts` | **Broken** |
| AI client | `lib/ai/client.ts` | Working |
| Process route | `app/api/moodboard/items/[id]/process/route.ts` | Working, needs refactor |

## Appendix B: Environment & Dependencies

**Current:**
- Next.js 15 (App Router)
- React Flow (`reactflow`)
- Supabase (Auth, Database, Storage)
- Vercel (deployment)
- Sonner (toasts)
- Lucide React (icons)
- Zod (validation)

**To Add:**
- `inngest` — Background job processing for video pipeline
- `@react-pdf/renderer` — PDF export for briefs (or server-side Puppeteer)
- `ffmpeg` — Frame extraction (via Inngest worker, not Vercel function)
- OpenAI Whisper API — Transcript extraction (already have OpenAI key via `lib/ai/client.ts`)
- Apify SDK — TikTok/Instagram/Twitter scraping (`@apify/client`)

---

*This PRD is a living document. Update as implementation reveals new constraints or opportunities.*
