/**
 * Shared instructions for the topic search `summary` field (executive summary).
 * Rendered in-app with Markdown — use **bold** for short emphasis spans only.
 */

/** Core rules — used by narrative pipeline + JSON schema hints. */
export const EXECUTIVE_SUMMARY_CORE = `EXECUTIVE SUMMARY (the "summary" JSON field)

Voice
- Sound like a **briefing for a busy stakeholder**: direct, conversational, confident. Not academic and not “market research report” tone.
- Avoid canned analyst phrases such as: “the research landscape”, “conversation clusters”, “this analysis reflects”, “approximately X references unless the number itself is the insight”.
- One **single paragraph** in the string — no line breaks, bullets, or headings inside the JSON value.
- About **4–7 sentences** (~90–160 words).

Markdown bold (**…**)
- Use **3–6 short bold spans** total (roughly 2–8 words each): the non-negotiable insights — **tensions**, **opportunities**, **named players**, **metrics that matter**, or **strategic pivots**.
- Do **not** bold entire sentences; keep most of the paragraph in normal weight.

What to prioritize (“pick the gold”)
- Open with the **sharpest takeaway** from the data — not a generic restatement of the search query.
- Name **who** is driving the conversation and **what** actually earns saves or engagement when the data supports it.
- Surface the **central tension** (tradeoff, debate, fear, or split audience) and **one clear implication** for brands or creators.
- Ground claims in the **computed analytics** and **cross-platform themes** (and platform context when provided). Do not invent facts or URLs.`;

/** Extra line when the search is client-scoped (client strategy mode). */
export function executiveSummaryClientLens(brandName: string): string {
  return `Brand lens: frame the paragraph for **${brandName}** — relevance to their audience, opportunity, and risk. Mention the brand by name only where it reads natural, not every sentence.`;
}
