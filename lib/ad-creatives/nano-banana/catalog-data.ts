import type { NanoBananaCatalogEntry, NanoBananaTypeGroup } from './types';

type Row = {
  sortOrder: number;
  slug: string;
  name: string;
  nanoType: NanoBananaTypeGroup;
  file: string;
  /** Visual/layout direction (replace with full Notion verbatim when available). */
  styleDirective: string;
};

function toEntry(r: Row): NanoBananaCatalogEntry {
  const previewPublicPath = `/nano-banana-previews/${r.file}`;
  const promptTemplate = [
    `NANO BANANA STYLE #${r.sortOrder} — ${r.name}.`,
    r.styleDirective,
    'Approved on-canvas copy (render exactly, no paraphrase):',
    'Headline: [HEADLINE]',
    'Subheadline: [SUBHEADLINE]',
    'Primary CTA (single control): [CTA]',
    'Offer line (omit if empty): [OFFER]',
    'Product/service focus: [PRODUCT_SERVICE]',
    'No layout reference image is provided — invent an original composition that matches this style and brand context. Obey brand palette and voice from BRAND CONTEXT.',
  ].join('\n');

  return {
    sortOrder: r.sortOrder,
    slug: r.slug,
    name: r.name,
    nanoType: r.nanoType,
    previewPublicPath,
    promptTemplate,
  };
}

/** 40 global styles; 33 = Faux press, 34 = Faux iPhone Notes (per product spec). */
const RAW: Row[] = [
  { sortOrder: 1, slug: 'headline', name: 'Headline', nanoType: 'headline_hero', file: '01-headline.png', styleDirective: 'One oversized headline band, generous negative space, hero visual mid-frame, single CTA pill bottom-third.' },
  { sortOrder: 2, slug: 'value-stack', name: 'Value stack', nanoType: 'headline_hero', file: '02-value-stack.png', styleDirective: 'Headline plus 2–3 tight benefit lines as typographic stack; no fake icons row; calm premium spacing.' },
  { sortOrder: 3, slug: 'stat-hero', name: 'Stat hero', nanoType: 'social_proof', file: '03-stat-hero.png', styleDirective: 'One dominant metric or percentage as display type; subhead explains it; avoid fake dashboards.' },
  { sortOrder: 4, slug: 'testimonial-card', name: 'Testimonial card', nanoType: 'social_proof', file: '04-testimonial-card.png', styleDirective: 'Quote-led layout with attribution line; soft card or none — editorial not social-post chrome.' },
  { sortOrder: 5, slug: 'ugc-handheld', name: 'UGC handheld', nanoType: 'ugc_native', file: '05-ugc-handheld.png', styleDirective: 'Handheld phone or casual crop feel without readable UI; warm natural light; product truth from supplied photos only.' },
  { sortOrder: 6, slug: 'founder-note', name: 'Founder note', nanoType: 'ugc_native', file: '06-founder-note.png', styleDirective: 'Personal note or letter vibe; serif or humanist body; signature line area — no fake @handles.' },
  { sortOrder: 7, slug: 'press-quote', name: 'Press quote', nanoType: 'social_proof', file: '07-press-quote.png', styleDirective: 'Publication-style pull quote; small masthead-like label without real outlet marks; monochrome or duotone.' },
  { sortOrder: 8, slug: 'split-screen', name: 'Split screen', nanoType: 'comparison', file: '08-split-screen.png', styleDirective: 'Clean vertical or horizontal split; product or abstract on one side, type on other; no before/after labels unless in copy.' },
  { sortOrder: 9, slug: 'before-after-implied', name: 'Before / after implied', nanoType: 'comparison', file: '09-before-after.png', styleDirective: 'Two-panel contrast without clinical UI; tasteful divider; headline bridges both sides.' },
  { sortOrder: 10, slug: 'feature-callout', name: 'Feature callout', nanoType: 'headline_hero', file: '10-feature-callout.png', styleDirective: 'Single feature anchored with short label; one focal callout line; avoid feature grids and fake settings panels.' },
  { sortOrder: 11, slug: 'price-anchor', name: 'Price anchor', nanoType: 'promo_offer', file: '11-price-anchor.png', styleDirective: 'Prominent price or offer line with supporting subhead; strikethrough only if offer copy includes it.' },
  { sortOrder: 12, slug: 'deadline-urgency', name: 'Deadline urgency', nanoType: 'promo_offer', file: '12-deadline.png', styleDirective: 'Time-bound banner feel without fake countdown widgets; typographic urgency; single CTA.' },
  { sortOrder: 13, slug: 'app-store-card', name: 'App store card', nanoType: 'faux_ui', file: '13-app-store.png', styleDirective: 'Subtle app-market framing without Apple/Google marks; focus on value prop + CTA; no readable store chrome.' },
  { sortOrder: 14, slug: 'notification-stack', name: 'Notification stack', nanoType: 'faux_ui', file: '14-notifications.png', styleDirective: 'Soft stacked cards suggesting alerts; abstract text in cards must match approved copy only.' },
  { sortOrder: 15, slug: 'chat-bubble', name: 'Chat bubble', nanoType: 'ugc_native', file: '15-chat-bubble.png', styleDirective: 'Conversation bubble motif; messages contain only approved strings; no messenger brand chrome.' },
  { sortOrder: 16, slug: 'carousel-hint', name: 'Carousel hint', nanoType: 'editorial', file: '16-carousel-hint.png', styleDirective: 'Multi-panel hint with dots or index; still one export frame; first-slide energy.' },
  { sortOrder: 17, slug: 'story-panels', name: 'Story panels', nanoType: 'editorial', file: '17-story-panels.png', styleDirective: 'Vertical thirds or panels; editorial rhythm; one clear CTA zone.' },
  { sortOrder: 18, slug: 'minimal-serif', name: 'Minimal serif editorial', nanoType: 'editorial', file: '18-minimal-serif.png', styleDirective: 'Magazine cover simplicity; large serif headline; lots of negative space; restrained palette.' },
  { sortOrder: 19, slug: 'neon-night', name: 'Neon night', nanoType: 'experimental', file: '19-neon-night.png', styleDirective: 'Night-city glow accents; controlled neon — not cyberpunk clutter; headline stays readable.' },
  { sortOrder: 20, slug: 'soft-gradient-product', name: 'Soft gradient product', nanoType: 'headline_hero', file: '20-soft-gradient.png', styleDirective: 'Soft gradient field with floating product hero; gentle shadow; premium packshot energy.' },
  { sortOrder: 21, slug: 'flat-illustration', name: 'Flat illustration', nanoType: 'editorial', file: '21-flat-illustration.png', styleDirective: 'Flat or semi-flat illustration supporting the offer; no stock clipart mascots; brand colors.' },
  { sortOrder: 22, slug: '3d-mockup', name: '3D mockup', nanoType: 'headline_hero', file: '22-3d-mockup.png', styleDirective: 'Single 3D object or packshot; studio lighting; minimal scene.' },
  { sortOrder: 23, slug: 'device-frame', name: 'Device frame', nanoType: 'faux_ui', file: '23-device-frame.png', styleDirective: 'One device silhouette; screen shows abstract blur or approved text only; no OS UI.' },
  { sortOrder: 24, slug: 'browser-chrome-lite', name: 'Browser chrome lite', nanoType: 'faux_ui', file: '24-browser-lite.png', styleDirective: 'Abstract browser bar suggestion; no URL text unless in approved copy; no fake tabs content.' },
  { sortOrder: 25, slug: 'bento-metrics', name: 'Bento metrics', nanoType: 'headline_hero', file: '25-bento-metrics.png', styleDirective: 'Soft bento tiles suggesting metrics; numbers must match approved copy if shown — otherwise abstract shapes only.' },
  { sortOrder: 26, slug: 'big-number', name: 'Big number', nanoType: 'social_proof', file: '26-big-number.png', styleDirective: 'Giant numeral or KPI as art; supporting line small; high contrast.' },
  { sortOrder: 27, slug: 'logo-wall', name: 'Logo wall', nanoType: 'social_proof', file: '27-logo-wall.png', styleDirective: 'Generic placeholder blocks for “trusted by” — no real third-party logos unless provided as product assets.' },
  { sortOrder: 28, slug: 'badge-row', name: 'Badge row', nanoType: 'social_proof', file: '28-badge-row.png', styleDirective: 'Award or certification row using neutral seals — no readable fake org names.' },
  { sortOrder: 29, slug: 'seasonal', name: 'Seasonal', nanoType: 'promo_offer', file: '29-seasonal.png', styleDirective: 'Seasonal color wash or motif without holiday IP; headline-led.' },
  { sortOrder: 30, slug: 'event-flyer', name: 'Event flyer', nanoType: 'promo_offer', file: '30-event-flyer.png', styleDirective: 'Poster/flyer hierarchy: date/time feel via typography only if in copy; else abstract.' },
  { sortOrder: 31, slug: 'podcast-cover', name: 'Podcast cover', nanoType: 'editorial', file: '31-podcast-cover.png', styleDirective: 'Square-forward cover energy; bold title lockup; mic or wave motif abstract.' },
  { sortOrder: 32, slug: 'recipe-card', name: 'Recipe card', nanoType: 'ugc_native', file: '32-recipe-card.png', styleDirective: 'Ingredient-list rhythm without fake nutrition labels; warm paper texture optional.' },
  { sortOrder: 33, slug: 'faux-press', name: 'Faux press', nanoType: 'faux_ui', file: '33-faux-press.png', styleDirective: 'Editorial article layout feel; headline + dek; no real newspaper masthead or bylines.' },
  { sortOrder: 34, slug: 'faux-iphone-notes', name: 'Faux iPhone Notes', nanoType: 'faux_ui', file: '34-faux-iphone-notes.png', styleDirective: 'Notes-app vibe; monospace/list rhythm; no Apple logo; system chrome abstract only.' },
  { sortOrder: 35, slug: 'thread-card', name: 'Thread card', nanoType: 'ugc_native', file: '35-thread-card.png', styleDirective: 'Thread-style card without platform marks; author line generic.' },
  { sortOrder: 36, slug: 'thought-leader', name: 'Thought leader', nanoType: 'editorial', file: '36-thought-leader.png', styleDirective: 'LinkedIn-adjacent polish without LinkedIn UI; portrait crop optional abstract.' },
  { sortOrder: 37, slug: 'listing-style', name: 'Listing style', nanoType: 'promo_offer', file: '37-listing-style.png', styleDirective: 'Marketplace listing hierarchy: title, price, bullets — only from approved copy.' },
  { sortOrder: 38, slug: 'handmade-marketplace', name: 'Handmade marketplace', nanoType: 'ugc_native', file: '38-handmade.png', styleDirective: 'Craft texture, soft shadows; artisan feel; product from reference photos only.' },
  { sortOrder: 39, slug: 'founder-letter', name: 'Founder letter', nanoType: 'ugc_native', file: '39-founder-letter.png', styleDirective: 'Typed letter layout; margin and signature block; sincere tone.' },
  { sortOrder: 40, slug: 'ugly-ad', name: 'Ugly ad', nanoType: 'experimental', file: '40-ugly-ad.png', styleDirective: 'Intentionally raw/brutalist contrast: clashing type scales allowed but copy must remain exact and legible.' },
];

export const NANO_BANANA_CATALOG: NanoBananaCatalogEntry[] = RAW.map(toEntry);
