# PRD: Grounded Content Pillars from TikTok Video Analysis

> **Status:** Approved — ready to implement
> **Priority:** High (core pipeline upgrade)
> **Depends on:** Topic Search QA Fixes (phases 1–5 complete)

---

## Problem Statement

Content pillars are currently **LLM-estimated** — the merger model guesses what types of content exist and estimates engagement rates. This produces vague, unfilmable labels and unreliable stats.

**Goal:** Generate content pillars **bottom-up from actual TikTok data** — pull 500 videos, transcribe all, extract frames + vision-analyze the top 50, cluster into pillars with real engagement metrics, then feed grounded data to the merger.

---

## Decisions

- **TikTok only** for pillar synthesis. YouTube helps with the report but not pillar generation.
- **No search tiers.** One search config for everyone. Platform toggles and depth selectors removed from UI.
- **Fixed platforms:** Web, Reddit, TikTok, YouTube — always all four.
- **500 TikTok videos** per search (medium tier bumped from 100 → 500).
- **Transcribe all 500** (TikTok captions are free; Groq Whisper fallback ~$0.003/video).
- **FFmpeg frames + vision analysis on top 50** by engagement.
- **"Show more" in source browser** triggers on-demand analysis for the next batch — but does NOT update the report pillars. Pillars are locked from the initial 50.
- **Apify actor:** `5K30i8aFccKNF5ICs` (apidojo/tiktok-scraper, ~$0.30/1k posts).

---

## Pipeline Architecture

```
┌─────────────────────────┐     ┌──────────────────────────┐
│ Subtopic Research       │     │ TikTok Scraper           │
│ (LLM + SERP)           │     │ → 500 videos             │
│                         │     │ (Apify 5K30i8aFccKNF5ICs)│
└────────┬────────────────┘     └────────┬─────────────────┘
         │         IN PARALLEL            │
         │                                ▼
         │                      ┌──────────────────────────┐
         │                      │ Phase A: Transcribe All  │
         │                      │ → 500 videos (captions)  │
         │                      │ → Groq Whisper fallback  │
         │                      └────────┬─────────────────┘
         │                               │
         │                               ▼
         │                      ┌──────────────────────────┐
         │                      │ Phase B: Analyze Top 50  │
         │                      │ → FFmpeg frame extract    │
         │                      │ → Gemini vision classify  │
         │                      │ (5 concurrent workers)    │
         │                      └────────┬─────────────────┘
         │                               │
         │                               ▼
         │                      ┌──────────────────────────┐
         │                      │ Phase C: Cluster → Pillars│
         │                      │ → LLM clusters 500 videos│
         │                      │   (caption + transcript)  │
         │                      │ → Top 50 have frames too  │
         │                      │ → Real ER per pillar      │
         │                      └────────┬─────────────────┘
         │                               │
         └────────────┬──────────────────┘
                      ▼
              ┌───────────────────┐
              │ Merger LLM        │
              │ → GROUNDED pillars│
              │ (real video data) │
              │ → summary, topics │
              │ → emotions, etc.  │
              └───────────────────┘
```

---

## Phase A: Transcribe All 500

- Sort all 500 videos by engagement (views + likes) descending
- Transcribe in batches of 20 (5 concurrent)
- Primary: TikTok embedded captions ($0)
- Fallback: Groq Whisper (~$0.003/video)
- Store transcript on each `PlatformSource` object

**Cost:** ~$0–0.15 for 500 videos
**Time:** ~3 min with 5 workers

## Phase B: Analyze Top 50

After transcription, take the top 50 by engagement:

1. **FFmpeg frame extraction** — every 3 seconds, resize to 360×640, upload to Supabase
2. **Gemini Flash vision analysis** — classify each frame as talking_head, b_roll, product_focus, etc.
3. Store `frames[]`, `transcript_segments[]`, `visionBreakdown` on each source

**Cost:** ~$0.07 for 50 videos (storage + Gemini)
**Time:** ~3–5 min with 5 workers

## Phase C: Cluster → Pillars

Single LLM call with all 500 videos' metadata:

**Input per video:**
```json
{
  "id": "...",
  "caption": "first 150 chars",
  "hashtags": ["#goldback"],
  "transcript_snippet": "first 200 chars",
  "vision_types": ["talking_head: 60%", "product_focus: 30%"],  // only for top 50
  "views": 143000, "likes": 2810, "er": 2.2
}
```

**Prompt:** Cluster these 500 TikTok videos into 4–6 content pillar groups. Each pillar = a filmable content type. Report: name, video_ids, video_count, avg_er, pct_of_content, top_video_id, description.

**Output feeds directly into merger** as `content_breakdown.categories` — merger uses real data instead of estimating.

**Cost:** ~$0.02
**Time:** ~5–10 sec

---

## "Show More" On-Demand Analysis

When user clicks "Show more" in the Source Browser:
- Videos 51–62 (or whatever batch) become visible
- Auto-trigger transcribe + FFmpeg frames + vision analysis for newly visible videos
- This is purely for the source card detail view — NOT for re-running pillar clustering
- **Pillars are locked from the initial Phase C run**

---

## UI Changes (Done)

- ✅ Removed platform toggle buttons (was clickable checkboxes)
- ✅ Removed depth selector (Light/Medium/Deep dropdown)
- ✅ Replaced with static platform badges showing Web, TikTok, Reddit, YouTube
- ✅ Both brand intel and topic research cards always send fixed platforms + volume

---

## Cost Summary

| Component | Per Search |
|-----------|-----------|
| TikTok scraping (500 videos) | ~$0.15 |
| Transcription (500 videos, captions) | ~$0 |
| Frame extraction (top 50) | ~$0.05 |
| Vision analysis (top 50) | ~$0.02 |
| Clustering LLM call | ~$0.02 |
| Subtopic research (existing) | ~$0.10 |
| Merger LLM call (existing) | ~$0.10 |
| **Total** | **~$0.44** |

**Current cost:** ~$0.25 per search
**New cost:** ~$0.44 per search (+$0.19 for dramatically better, data-grounded pillars)

---

## Implementation Order

1. ✅ Remove platform toggles + depth selector from UI
2. Bump TikTok medium volume from 100 → 500 in `VOLUME_CONFIG`
3. Build `transcribeAllVideos()` — batch transcription for all scraped TikTok videos
4. Build `analyzeTopVideos()` — FFmpeg + vision for top 50
5. Build `clusterVideosToPillars()` — LLM clustering call
6. Wire phases A→B→C into `runLlmTopicPipeline()` after platform scraping, before merger
7. Update merger prompt to use grounded pillar data
8. Add "show more" on-demand analysis trigger in Source Browser
9. (Optional) Add pillar example thumbnail from top_video_id

---

---

## Strategy Lab Redesign

The Strategy Lab at `/admin/strategy-lab/[clientId]` becomes the central workspace for each client. Layout from Jack's wireframe:

### Layout
- **Left sidebar:** Standard admin nav (NATIVZ logo + nav items)
- **Center:** Full-height content area with floating top nav
- **Floating nav bar** (top center, pill-shaped): **Chat** | **Knowledge Base** | **Analytics**

### Tab 1: Chat (default)
- Full-screen LLM chatbot interface
- Chat input at bottom with send button
- Messages stream above
- Context: all topic searches for this client, brand DNA, knowledge base entries
- Previous chat history accessible
- This is the primary interface — everything else feeds into this

### Tab 2: Knowledge Base
- Brand knowledge entries
- Saved ideas from chat
- Analyzed videos (the video reference library — paste URLs, auto-analyze, save to folders)
- Previous chat artifacts (saved images, research, etc.)
- Topic search results linked to this client

### Tab 3: Analytics
- Coming soon placeholder for now
- Will eventually show social media analytics, performance data
- Can pull from existing reporting infrastructure

### Video Reference Library (inside Knowledge Base)
- Paste any video URL → auto-analyze (transcribe, frames, hook, rescript)
- Save analyzed videos to client-scoped folders
- Browse library of analyzed + rescripted videos
- Replaces the moodboard concept with scalable folder-based organization
- Same `VideoAnalysisPanel` pipeline, different storage + browsing UX

---

## Files to Modify

- `lib/search/platform-router.ts` — bump medium TikTok to 500
- `lib/search/llm-pipeline/run-llm-topic-pipeline.ts` — insert analysis phases between scraping and merger
- `lib/search/llm-pipeline/analyze-videos.ts` — new: batch transcribe + frames + vision
- `lib/search/llm-pipeline/cluster-pillars.ts` — new: LLM clustering call
- `components/results/source-browser.tsx` — "show more" triggers on-demand analysis
