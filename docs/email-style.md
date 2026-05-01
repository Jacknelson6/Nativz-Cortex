# Email Style Guide

> **Status:** Locked in 2026-05-01. Required reading before authoring or
> modifying any sender in `lib/email/resend.ts` or any template in
> `lib/email/templates/*`.
>
> The bar: every email Cortex sends should look like it came from Nativz
> (or Anderson Collaborative when `agency='anderson'`), full stop. No
> generic emails. No raw `<p>` blocks on a white background. If a new
> sender doesn't already match `welcome`, `weekly_social_report`, or
> `calendar_comment_digest` visually, it isn't done.

---

## The single rule

**Every outbound email goes through `layout(body, agency, { eyebrow, heroTitle })`.**

```ts
import { layout, getEmailBrand } from '@/lib/email/resend';

const html = layout(innerCard, agency, {
  eyebrow: 'Weekly recap',
  heroTitle: `${clientName} - this week`,
});
```

`layout()` paints the dark hero, brand wordmark, eyebrow, hero title,
white card, footer, and unsubscribe link. The `body` you pass is the
inner card content only. Never assemble your own outer shell.

`agency` is `'nativz' | 'anderson'`. The shell automatically picks the
right wordmark, font stack, blue accent, and footer copy. Do not branch
on agency inside the body unless you have agency-specific copy.

---

## Two authoring modes

### A. Admin-composed markdown (`buildUserEmailHtml`)

Use this when the body is written by a person (Jack, the team, a
template stored in the DB). The renderer in
`lib/email/templates/user-email.ts` understands a small markdown subset
and promotes it into branded HTML.

| Markdown                                         | Renders as                                                               |
|--------------------------------------------------|--------------------------------------------------------------------------|
| `# Heading`                                      | 24px hero heading on the white card                                      |
| `## Section`                                     | 11px uppercase **branded eyebrow** (accent color)                        |
| `**Outstanding items:**` then bullets            | Branded panel **card** with eyebrow + bulleted list                      |
| `- Item`                                         | Plain bulleted list                                                      |
| `[label](url)` on its own line                   | Full-width pill **CTA button**                                           |
| `[text](url)` inline                             | Branded inline link                                                      |
| `**bold**`, `*italic*`                           | `<strong>`, `<em>`                                                       |
| `---`                                            | Horizontal divider                                                       |
| `- Name` (final block)                           | Muted signoff line                                                       |
| Blank line                                       | Paragraph break                                                          |

Authoring template (copy this for any new admin-composed email):

```text
# Hi Jack,

Short opener that explains why this email exists.

## Where we are

A paragraph of plain context. Inline links go here: [open the portal](https://cortex.nativz.io/portal).

**Outstanding items:**
- Brand guidelines PDF
- Logo SVGs, light + dark variants
- Top three reference accounts

## What happens next

A second paragraph if you need one.

[Open the client portal](https://cortex.nativz.io/portal)

Thanks,
- The Nativz team
```

### B. Hand-rolled HTML cards

Use this when the body is data-driven (weekly recap, competitor report,
calendar delivery). Files live in `lib/email/templates/*-html.ts`.

Required:

1. **Inline styles only.** Gmail strips `<style>` blocks for everything
   but the head, and we don't control the head.
2. **Pull every color from `getEmailBrand(agency)`** -
   `brand.textPrimary`, `brand.textBody`, `brand.textMuted`,
   `brand.blue`, `brand.blueCta`, `brand.blueSurface`, `brand.bgCard`,
   `brand.borderCard`, `brand.panelBg`, `brand.border`, `brand.fontStack`.
   No hardcoded hex values for chrome. The two carve-outs are
   semantic deltas (the `#0a8a4a` / `#b42318` follower-delta colors and
   the `#34d399` / `#f87171` competitor-trend colors), kept because
   green-up / red-down readability beats brand tokens.
3. **Use `<table cellpadding cellspacing border width>` for layout.**
   No flexbox. No grid. Outlook renders neither.
4. **Fall back gracefully on null data.** No empty grey image boxes
   (use `platformSwatch()` style fallbacks), no "undefined" strings,
   no broken date ranges.
5. **Always html-escape user/client data.** Every template has a local
   `escapeHtml()` helper. Use it for client names, captions, usernames,
   URLs, dates - anything that isn't your own static markup.

Reference templates to copy patterns from:

- `weekly-social-report-html.ts` - KPI tiles + breakdown tables + thumbnail rows
- `competitor-report-html.ts` - 2-cell header pattern, badge + delta colors
- `affiliate-weekly-report-html.ts` - the original template all three follow

---

## Recipient addressing

Calendar / brand-scoped senders that have access to a client's POCs MUST
use the `pocFirstNames` argument and the `greetingFor()` helper.

```ts
greetingFor(['Jack'])              // "Hey Jack"
greetingFor(['Jack', 'Sara'])      // "Hey Jack and Sara"
greetingFor(['Jack', 'Sara', 'Matt']) // "Hey Jack, Sara, and Matt"
greetingFor([])                    // "Hi team"
greetingFor(undefined, 'team')     // "Hi team"
```

Every sender in `resend.ts` that accepts a list of internal recipients
already takes `pocFirstNames?: string[]` - thread it through. Generic
"Hi there" / "Hello" greetings are not acceptable for client-context
emails.

---

## CTAs

Every transactional email should have **one** primary CTA. Two acceptable
shapes:

- **Markdown body:** `[label](url)` on its own line. The renderer
  promotes it to a full-width pill button.
- **Hand-rolled HTML:** copy the pill pattern from
  `competitor-report-html.ts`:

  ```html
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:28px 0;">
    <tr><td align="center">
      <a href="${url}" style="display:inline-block;background:${brand.blueCta};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.02em;padding:14px 36px;border-radius:10px;">
        ${label}
      </a>
    </td></tr>
  </table>
  ```

No raw `<a>` tags as primary CTAs. No "click here" link-style CTAs. The
pill button is the call to action; everything else is supporting copy.

---

## Em-dash ban (hard rule)

Per CLAUDE.md, U+2013 and U+2014 are banned everywhere - email copy,
date ranges, signoff dashes, Markdown source for DB-stored templates.
Use the ASCII hyphen `-` only.

The signoff regex in `user-email.ts` is intentionally narrow
(`/^(-)\s+(.+)$/`) so an em-dash never silently renders as a "muted
name line". If the regex stops matching, fix the source, not the regex.

Date ranges read "Jan 1 to Jan 7", not "Jan 1 - 7" with a fancy dash.

---

## Copy register

- **Sentence case** in body copy. Eyebrows are SHOUTING ALL CAPS by
  styling, not by literal capitalization (the `text-transform:uppercase`
  CSS does the work, you write "Outstanding items").
- "Posts" not "drops" in anything a client reads. The codebase says
  "drops" internally (`drop_comment_*` sender names, etc.) but the
  rendered subject / body should always read "post".
- Short. Most emails should fit above the fold on a phone. If it
  doesn't, ask whether you really need that paragraph or whether the
  CTA + a sentence does the job.

---

## Test rig requirement

Every new sender ships with a fixture in
`scripts/test-send-all-emails.ts` covering both agencies (`nativz` and
`anderson`). Verify visually with:

```bash
TO=jack@nativz.io npx tsx scripts/test-send-all-emails.ts
```

For local iteration without burning Resend sends, use:

```bash
npx tsx scripts/preview-all-emails.ts
```

It writes static HTML files you can open in a browser and reload as you
edit the templates.

Real production refs (calendar share tokens, search id, invite tokens)
are pinned in the `REFS` block at the top of `test-send-all-emails.ts`.
Replace with new live refs when they go stale; do not regress to
`SAMPLE-*` placeholders that don't resolve.

---

## Brand tokens cheatsheet

From `lib/email/brand-tokens.ts` via `getEmailBrand(agency)`:

| Token            | Use for                                                  |
|------------------|----------------------------------------------------------|
| `bgCard`         | inner card / nested panel background                     |
| `panelBg`        | branded `**Heading:**` + bullets card background          |
| `border`         | panel border (matches panelBg in tone)                   |
| `borderCard`     | hairline rules between table rows                        |
| `textPrimary`    | hero text, KPI values, names                             |
| `textBody`       | paragraphs, table cells                                  |
| `textMuted`      | metadata, eyebrows on muted surfaces, signoff line       |
| `blue`           | inline links, accent eyebrow text                        |
| `blueCta`        | pill button background                                   |
| `blueSurface`    | KPI tile background, soft accent surfaces                |
| `fontStack`      | typeface stack (set on the outermost cell of any swatch) |

If you find yourself reaching for a hex code that isn't in the table,
stop and add a token to `brand-tokens.ts` instead.
