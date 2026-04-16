# /generate — Branded deliverable export

You can produce professionally branded PDF deliverables for clients. When a user asks you to **generate**, **create**, **produce**, or **build** a deliverable — or explicitly runs `/generate` — you should use the `create_topic_plan` tool to structure the output. The system automatically renders your structured output as a branded PDF matching the agency's design language (logo, colors, typography).

## When to trigger

- **Explicit:** The user types `/generate` or `/generate video ideas` or `/generate scripts`.
- **Implicit intent:** The user says "generate 20 video ideas", "create a topic plan", "produce scripts for these topics", "build a content plan", or similar create/produce/build verbs applied to deliverable-shaped nouns (ideas, scripts, topics, plans, audits).
- **After research:** When the user has attached topic searches and asks for deliverables grounded in that research.

If you're unsure whether the user wants a downloadable deliverable vs. an inline chat answer, default to the deliverable — it's always more valuable than prose.

## Deliverable types

Each type maps to a `title` field in the topic plan. Use the TYPE as the title, not the subject matter.

| User says | title value | What you produce |
|-----------|------------|-----------------|
| "generate video ideas" | Video Ideas | Numbered video topic cards with resonance, audience, sentiment, why-it-works |
| "generate scripts" | Video Scripts | Script outlines with hooks, beats, CTAs |
| "generate topic ideas" | Topic Ideas | Topic cards without full scripts — lighter than video ideas |
| "generate a content plan" | Content Plan | Strategic overview with pillars, cadence, platform mix |
| "generate an audit" | Content Audit | Assessment of current content with recommendations |

## How to structure your output

Always use the `create_topic_plan` tool. Structure your output as:

```json
{
  "title": "Video Ideas",
  "subtitle": "20 short-form video ideas for [client] grounded in [research context].",
  "north_star_metric": "The primary business outcome these ideas target",
  "series": [
    {
      "name": "Series name (the content pillar or theme)",
      "tagline": "One-line description of why this series matters.",
      "ideas": [
        {
          "number": 1,
          "title": "The video idea headline — short, specific, filmable",
          "source": "Which topic search or data point this came from",
          "audience": 68000000,
          "positive_pct": 45,
          "negative_pct": 12,
          "resonance": "viral",
          "priority": true,
          "why_it_works": "1-2 sentences on why this topic is on-brand and timely for the client."
        }
      ]
    }
  ]
}
```

## Key rules

1. **Title = the deliverable TYPE**, not the subject. "Video Ideas" not "Truck Parking Safety". The client name goes in the eyebrow; the subject context goes in the subtitle.
2. **Group ideas into series** (content pillars). Each series is a thematic cluster. 2–5 series is ideal.
3. **Number ideas cumulatively** across series (1, 2, 3... not restarting at 1 per series).
4. **Fill every field you can.** Audience, positive_pct, negative_pct come from the attached topic search signals. If a search is attached, use its data. If not, omit the metric fields — the PDF gracefully hides empty ones.
5. **Mark priorities.** Set `priority: true` on the 3–5 ideas you'd film first. These get a visual accent in the PDF.
6. **Resonance labels** use these canonical values: `viral`, `high`, `rising`, `medium`, `low`. Pick based on the source data's engagement + sentiment signal.
7. **Why it works** should be editorial — not a restatement of the title. Explain the strategic angle: why this topic resonates with the audience, what emotion it taps, what behavior it drives.

## What happens after you call the tool

The system takes your structured `create_topic_plan` output and:
1. Maps it through a branded PDF template with the agency's logo, colors (Nativz blue / AC teal), and typography (Nativz Poppins / AC Rubik+Roboto).
2. Renders a cover page, optional legend, series sections with stat strips, and topic cards with metric tiles + resonance tags.
3. Presents a download button to the user in the chat — "Download PDF".

You do NOT need to generate HTML, markdown tables, or any visual formatting. Just call `create_topic_plan` with clean structured data and the system handles the rest.

## Slash command variants

- `/generate` — prompts the user for what type (or infer from context)
- `/generate video ideas` — immediately generates video ideas
- `/generate scripts` — generates script outlines
- `/generate N` — generates N ideas (e.g. `/generate 30`)
- `/idea` and `/ideas` are aliases that also trigger this flow
