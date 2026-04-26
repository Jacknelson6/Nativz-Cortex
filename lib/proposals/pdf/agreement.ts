/**
 * Canonical Anderson Collaborative agreement PDF renderer.
 * Runs in Cloudflare Workers runtime.
 *
 * Brand typography (per AC brand system):
 *   - Display/headlines: Roboto Light 300
 *   - Body: Rubik Regular 400
 *   - Emphasis: Rubik Medium 500
 *   - Signature script: Caveat Semibold 600 (matches the typed-sig style on the sign page)
 * Palette: AC dark #00161F + teal #36D1C2 + teal-dark #2bb8aa.
 * Logo: Anderson Collaborative wordmark, embedded as base64 (light + dark variants).
 *
 * Legal integrity rule: the client never supplies the PDF.
 * The server builds the PDF from the template + captured form data + signature image.
 */
import { PDFDocument, rgb, type PDFFont, type PDFPage, type PDFImage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { ROBOTO_LIGHT_B64 } from './fonts/roboto-light';
import { RUBIK_REGULAR_B64 } from './fonts/rubik-regular';
import { RUBIK_MEDIUM_B64 } from './fonts/rubik-medium';
import { CAVEAT_SEMIBOLD_B64 } from './fonts/caveat-semibold';
import { LOGO_DARK_BG_B64, LOGO_LIGHT_BG_B64 } from './assets';
import { getEmailLogoUrl } from '@/lib/email/brand-tokens';
import type { AgencyBrand } from '@/lib/agency/detect';

// Email-only brand details. The PDF body is still Anderson-skinned (legal
// agreement template); this resolver only feeds the transactional emails.
type EmailAgencyBrand = {
  companyName: string;       // legal name in body copy + subjects
  signerName: string;        // counter-signer name in copy ("…executed by X on behalf of …")
  contactEmail: string;      // public-facing contact in footers
  marketingHost: string;     // marketing site host (no protocol)
  marketingUrl: string;      // marketing site URL with protocol
  logoUrl: string;           // hosted logo for email <img>
  postalAddress: string;     // street line for footer
};

function resolveEmailAgencyBrand(agency: AgencyBrand): EmailAgencyBrand {
  if (agency === 'nativz') {
    return {
      companyName: 'Nativz',
      signerName: 'Cole',
      contactEmail: 'cole@nativz.io',
      marketingHost: 'nativz.io',
      marketingUrl: 'https://nativz.io',
      logoUrl: getEmailLogoUrl('nativz'),
      postalAddress: '',
    };
  }
  return {
    companyName: 'Anderson Collaborative LLC',
    signerName: 'Trevor Anderson',
    contactEmail: 'trevor@andersoncollaborative.com',
    marketingHost: 'andersoncollaborative.com',
    marketingUrl: 'https://andersoncollaborative.com',
    logoUrl: 'https://docs.andersoncollaborative.com/assets/ac-logo-dark.png',
    postalAddress: '4000 Ponce de Leon Blvd Ste 470, Coral Gables FL 33146',
  };
}

export interface AgreementInputs {
  id: string;
  // Proposal-level identity (from client.json). Every contract is tied to one proposal.
  slug: string;               // e.g. "ecoview-dfw-website"
  projectName: string;        // e.g. "EcoView DFW Website Rebuild"
  projectShortName?: string;  // e.g. "EcoView DFW Website" (used in Stripe/subjects)
  proposalUrl: string;        // e.g. "https://docs.andersoncollaborative.com/ecoview-dfw-website/"
  scopeStatement?: string;    // e.g. "design, develop, and launch a new website..."
  agreementTitle?: string;    // e.g. "Web Development" or "Content Editing". Defaults to blank → single-line "Service Agreement".
  // Tier (free-form id, defined per proposal in client.json)
  tier: string;
  tierLabel: string;
  total: number;
  deposit: number;
  // Payment model. Subscription = monthly/periodic retainer; otherwise deposit-balance project billing.
  subscription?: boolean;
  cadence?: 'month' | 'year' | 'week';
  // Client
  clientLegalName: string;
  clientAddress: string;
  signerName: string;
  signerTitle: string;
  signerEmail: string;
  signatureDataUrl: string;
  signatureTimestamp: string;
  serverTimestamp: string;
  ip: string;
  userAgent: string;
  signatureMethod?: 'draw' | 'type';
  counterSigned?: {
    date: string;
    stripePaymentIntent: string;
    stripeCustomer: string;
    amountPaid: number;
  };
}

// Anderson Collaborative brand palette
const NAVY          = rgb(0.0,    0.0863, 0.1216); // #00161F (AC dark)
const NAVY_LIGHT    = rgb(0.004,  0.125,  0.169);  // #012029
const ELECTRIC      = rgb(0.2118, 0.8196, 0.7608); // #36D1C2 (AC teal)
const ELECTRIC_DARK = rgb(0.169,  0.722,  0.667);  // #2BB8AA
const ELECTRIC_TINT = rgb(0.898,  0.969,  0.961);  // #E5F7F4
const WHITE         = rgb(1,      1,      1);
const TEXT_DARK     = rgb(0.0588, 0.0784, 0.0980); // #0f1419
const TEXT_BODY     = rgb(0.2392, 0.2824, 0.3216); // #3d4852
const TEXT_MUTED    = rgb(0.4824, 0.5294, 0.5804); // #7b8794
const BORDER        = rgb(0.9098, 0.9255, 0.9412); // #e8ecf0
const CARD_BG       = rgb(0.969,  0.976,  0.984);  // #f7f9fb
const GREEN         = rgb(0.086,  0.639,  0.290);  // #16a34a
const GREEN_BG      = rgb(0.941,  0.992,  0.957);  // #f0fdf4

const PAGE   = { w: 612, h: 792 } as const;
const M      = { top: 96, bottom: 60, left: 56, right: 56 } as const;
const CONTENT_W = PAGE.w - M.left - M.right;

interface RenderCtx {
  doc: PDFDocument;
  page: PDFPage;
  display: PDFFont;   // Roboto Light — display titles only
  body: PDFFont;      // Rubik Regular — paragraph body, captions
  bold: PDFFont;      // Rubik Medium — emphasis, section headings, labels
  script: PDFFont;    // Caveat Semibold — Trevor's counter-signature script
  logo: PDFImage;
  y: number;
  input: AgreementInputs;
}

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(',') ? b64.split(',')[1] : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function splitLines(font: PDFFont, size: number, text: string, maxW: number): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];
  for (const para of paragraphs) {
    if (!para) { lines.push(''); continue; }
    const words = para.split(' ');
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxW) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Navy banner header + logo + thin electric accent bar, repeated on every page. */
function drawPageChrome(ctx: RenderCtx, pageIdx: number, pageTotal: number) {
  const { page, logo, input } = ctx;
  // Navy header band
  page.drawRectangle({ x: 0, y: PAGE.h - 60, width: PAGE.w, height: 60, color: NAVY });
  // Electric accent line
  page.drawRectangle({ x: 0, y: PAGE.h - 63, width: PAGE.w, height: 3, color: ELECTRIC });
  // Logo on dark bg (bumped from 20 → 24 for stronger brand presence).
  const logoH = 24;
  const logoW = logoH * (logo.width / logo.height);
  page.drawImage(logo, { x: M.left, y: PAGE.h - 44, width: logoW, height: logoH });
  // Right-side metadata
  const metaFont = ctx.body;
  const metaSize = 8.5;
  const lineA = 'Service Agreement';
  const lineB = input.clientLegalName.length > 42
    ? input.clientLegalName.slice(0, 40) + '…'
    : input.clientLegalName;
  const rightX1 = PAGE.w - M.right - metaFont.widthOfTextAtSize(lineA, metaSize);
  const rightX2 = PAGE.w - M.right - metaFont.widthOfTextAtSize(lineB, metaSize);
  page.drawText(lineA, { x: rightX1, y: PAGE.h - 32, size: metaSize, font: ctx.body, color: rgb(0.67, 0.75, 0.82) });
  page.drawText(lineB, { x: rightX2, y: PAGE.h - 44, size: metaSize, font: ctx.bold,  color: ELECTRIC });

  // Footer: two-line layout keeps the long brand address from colliding with the page counter.
  const footY = 30;
  page.drawRectangle({ x: M.left, y: footY + 22, width: CONTENT_W, height: 0.5, color: BORDER });
  const footLeftA = 'Anderson Collaborative LLC  ·  andersoncollaborative.com';
  const footLeftB = '4000 Ponce de Leon Blvd Ste 470, Coral Gables FL 33146';
  const footRight = `Doc ${input.id.slice(0, 8)}  ·  Page ${pageIdx} of ${pageTotal}`;
  page.drawText(footLeftA, { x: M.left, y: footY + 10, size: 7.5, font: ctx.bold, color: TEXT_MUTED });
  page.drawText(footLeftB, { x: M.left, y: footY,      size: 7.5, font: ctx.body, color: TEXT_MUTED });
  const frW = ctx.body.widthOfTextAtSize(footRight, 7.5);
  page.drawText(footRight, { x: PAGE.w - M.right - frW, y: footY + 10, size: 7.5, font: ctx.body, color: TEXT_MUTED });
}

function newPage(ctx: RenderCtx) {
  ctx.page = ctx.doc.addPage([PAGE.w, PAGE.h]);
  ctx.y = PAGE.h - M.top;
}

function ensureRoom(ctx: RenderCtx, needed: number) {
  if (ctx.y - needed < M.bottom + 10) newPage(ctx);
}

function drawText(
  ctx: RenderCtx,
  text: string,
  opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; indent?: number; gapAfter?: number; lineHeight?: number } = {}
) {
  const size = opts.size ?? 9.5;
  const font = opts.font ?? ctx.body;
  const color = opts.color ?? TEXT_BODY;
  const indent = opts.indent ?? 0;
  const x = M.left + indent;
  const maxW = CONTENT_W - indent;
  const lineHeight = opts.lineHeight ?? size * 1.45;
  const lines = splitLines(font, size, text, maxW);
  for (const line of lines) {
    ensureRoom(ctx, lineHeight);
    if (line) page.drawTextAt(ctx, line, x, size, font, color);
    ctx.y -= lineHeight;
  }
  ctx.y -= opts.gapAfter ?? 0;
}

// Small wrapper. Keeps drawText free of boilerplate.
const page = {
  drawTextAt(ctx: RenderCtx, t: string, x: number, size: number, font: PDFFont, color: ReturnType<typeof rgb>) {
    ctx.page.drawText(t, { x, y: ctx.y - size, size, font, color });
  },
};

function drawSection(ctx: RenderCtx, num: string, heading: string, body: string) {
  ensureRoom(ctx, 46);
  // Section number chip
  const chipW = ctx.bold.widthOfTextAtSize(num, 9) + 14;
  ctx.page.drawRectangle({
    x: M.left, y: ctx.y - 16, width: chipW, height: 16,
    color: NAVY,
  });
  ctx.page.drawText(num, {
    x: M.left + 7, y: ctx.y - 12, size: 9, font: ctx.bold, color: ELECTRIC,
  });
  // Heading beside chip
  ctx.page.drawText(heading, {
    x: M.left + chipW + 10, y: ctx.y - 12, size: 11, font: ctx.bold, color: NAVY,
  });
  ctx.y -= 24;
  drawText(ctx, body, { size: 9.5, gapAfter: 12 });
}

function drawDivider(ctx: RenderCtx, pad = 6) {
  ensureRoom(ctx, pad * 2);
  ctx.page.drawRectangle({ x: M.left, y: ctx.y - 1, width: CONTENT_W, height: 0.5, color: BORDER });
  ctx.y -= pad * 2;
}

function drawKeyVal(ctx: RenderCtx, key: string, val: string, indent = 14, size = 9) {
  ensureRoom(ctx, size * 1.5);
  const labelW = 92;
  ctx.page.drawText(key, {
    x: M.left + indent, y: ctx.y - size, size, font: ctx.body, color: TEXT_MUTED,
  });
  ctx.page.drawText(val, {
    x: M.left + indent + labelW, y: ctx.y - size, size, font: ctx.body, color: TEXT_DARK,
  });
  ctx.y -= size * 1.5;
}

export async function renderAgreementPdf(input: AgreementInputs): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${input.projectName} · Service Agreement · ${input.clientLegalName}`);
  doc.setAuthor('Anderson Collaborative LLC');
  doc.setSubject('Web Development Service Agreement');
  doc.setProducer('docs.andersoncollaborative.com');
  doc.setCreator('Anderson Collaborative Contract Pipeline');
  doc.setCreationDate(new Date(input.serverTimestamp));
  doc.setModificationDate(new Date(input.serverTimestamp));

  const display = await doc.embedFont(b64ToBytes(ROBOTO_LIGHT_B64));
  const body    = await doc.embedFont(b64ToBytes(RUBIK_REGULAR_B64));
  const bold    = await doc.embedFont(b64ToBytes(RUBIK_MEDIUM_B64));
  const script  = await doc.embedFont(b64ToBytes(CAVEAT_SEMIBOLD_B64));
  const logo    = await doc.embedPng(b64ToBytes(LOGO_DARK_BG_B64));

  const ctx: RenderCtx = {
    doc,
    page: doc.addPage([PAGE.w, PAGE.h]),
    display, body, bold, script, logo,
    y: PAGE.h - M.top,
    input,
  };

  // ========== PAGE 1: Title + Parties + Summary ==========

  // Large title. Per AC brand: Roboto Light 300 for headlines, two-line stacked display.
  const titleLine = (input.agreementTitle || '').trim();
  if (titleLine) {
    ctx.page.drawText(titleLine, {
      x: M.left, y: ctx.y - 38, size: 36, font: display, color: NAVY,
    });
    ctx.y -= 40;
    ctx.page.drawText('Service Agreement', {
      x: M.left, y: ctx.y - 24, size: 24, font: display, color: ELECTRIC_DARK,
    });
    ctx.y -= 30;
  } else {
    ctx.page.drawText('Service Agreement', {
      x: M.left, y: ctx.y - 38, size: 36, font: display, color: NAVY,
    });
    ctx.y -= 42;
  }

  drawText(ctx, `Agreement v2026.04.2  ·  Document ID  ${input.id}`, {
    size: 9, color: TEXT_MUTED, gapAfter: 2,
  });
  drawText(ctx, `Effective  ${new Date(input.serverTimestamp).toISOString()} UTC`, {
    size: 9, color: TEXT_MUTED, gapAfter: 22,
  });

  // Electric left-bar accent + parties side by side
  const colW = (CONTENT_W - 20) / 2;
  const partyTop = ctx.y;

  // Left column (PROVIDER)
  ctx.page.drawRectangle({
    x: M.left, y: partyTop - 100, width: colW, height: 100,
    borderColor: BORDER, borderWidth: 0.5, color: CARD_BG,
  });
  ctx.page.drawRectangle({
    x: M.left, y: partyTop - 100, width: 3, height: 100, color: ELECTRIC,
  });
  ctx.page.drawText('PROVIDER', { x: M.left + 14, y: partyTop - 18, size: 8.5, font: bold, color: ELECTRIC_DARK });
  ctx.page.drawText('Anderson Collaborative LLC', { x: M.left + 14, y: partyTop - 34, size: 13, font: bold, color: NAVY });
  ctx.page.drawText('4000 Ponce de Leon Blvd, Suite 470', { x: M.left + 14, y: partyTop - 50, size: 9, font: body, color: TEXT_BODY });
  ctx.page.drawText('Coral Gables, FL 33146',              { x: M.left + 14, y: partyTop - 62, size: 9, font: body, color: TEXT_BODY });
  ctx.page.drawText('Trevor Anderson · Chief Executive Officer', { x: M.left + 14, y: partyTop - 78, size: 9, font: body, color: TEXT_BODY });
  ctx.page.drawText('info@andersoncollaborative.com',                { x: M.left + 14, y: partyTop - 90, size: 9, font: bold, color: ELECTRIC_DARK });

  // Right column (CLIENT)
  const rightX = M.left + colW + 20;
  ctx.page.drawRectangle({
    x: rightX, y: partyTop - 100, width: colW, height: 100,
    borderColor: BORDER, borderWidth: 0.5, color: CARD_BG,
  });
  ctx.page.drawRectangle({
    x: rightX, y: partyTop - 100, width: 3, height: 100, color: ELECTRIC,
  });
  ctx.page.drawText('CLIENT', { x: rightX + 14, y: partyTop - 18, size: 8.5, font: bold, color: ELECTRIC_DARK });
  const clientNameLines = splitLines(bold, 12, input.clientLegalName, colW - 28);
  let cy = partyTop - 34;
  for (const l of clientNameLines.slice(0, 2)) {
    ctx.page.drawText(l, { x: rightX + 14, y: cy, size: 12, font: bold, color: NAVY });
    cy -= 14;
  }
  const addrLines = splitLines(body, 9, input.clientAddress, colW - 28);
  for (const l of addrLines.slice(0, 2)) {
    cy -= 2;
    ctx.page.drawText(l, { x: rightX + 14, y: cy, size: 9, font: body, color: TEXT_BODY });
    cy -= 10;
  }
  cy -= 4;
  ctx.page.drawText(`${input.signerName} · ${input.signerTitle}`, { x: rightX + 14, y: cy, size: 9, font: body, color: TEXT_BODY });
  cy -= 12;
  ctx.page.drawText(input.signerEmail, { x: rightX + 14, y: cy, size: 9, font: bold, color: ELECTRIC_DARK });

  ctx.y = partyTop - 116;

  // Project summary. Big navy card.
  ctx.page.drawRectangle({
    x: M.left, y: ctx.y - 100, width: CONTENT_W, height: 100,
    color: NAVY,
  });
  ctx.page.drawText('PROJECT SUMMARY', {
    x: M.left + 20, y: ctx.y - 20, size: 8.5, font: bold, color: ELECTRIC,
  });
  ctx.page.drawText(input.tierLabel, {
    x: M.left + 20, y: ctx.y - 44, size: 22, font: display, color: WHITE,
  });

  // Price grid. Subscription tiers: 2 cells (Monthly Fee + First Charge).
  // Deposit-balance tiers: 3 cells (Total / Deposit / Balance).
  const priceGridY = ctx.y - 62;
  const cadenceWord = input.cadence === 'year' ? 'year' : input.cadence === 'week' ? 'week' : 'month';
  const cells: [string, string][] = input.subscription
    ? [
        [`Monthly Fee`,       `$${input.total.toLocaleString()} / ${cadenceWord}`],
        [`First Charge`,      `$${input.deposit.toLocaleString()} on signing`],
      ]
    : [
        ['Total Project Fee',  `$${input.total.toLocaleString()}`],
        ['Deposit at signing', `$${input.deposit.toLocaleString()}`],
        ['Balance (60 days)',  `$${input.deposit.toLocaleString()}`],
      ];
  const colWidth = (CONTENT_W - 40) / cells.length;
  cells.forEach(([k, v], i) => {
    const x = M.left + 20 + i * colWidth;
    ctx.page.drawText(k, { x, y: priceGridY,      size: 7.5, font: body, color: rgb(0.6, 0.73, 0.85) });
    ctx.page.drawText(v, { x, y: priceGridY - 16, size: 16,  font: bold, color: ELECTRIC });
  });
  ctx.y -= 118;

  drawText(ctx, `Scope and deliverables for the selected tier are defined at ${input.proposalUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}, incorporated here by reference. Details of payment, ownership, and termination follow.`, {
    size: 9, color: TEXT_MUTED, gapAfter: 4,
  });

  // ========== PAGES 2–3: Terms ==========

  newPage(ctx);

  drawSection(ctx, '01', 'Services and Deliverables',
    `Anderson Collaborative LLC will ${input.scopeStatement || 'design, develop, and launch the deliverables described in the attached proposal'} per the tier selected above. Deliverables match the scope described at ${input.proposalUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}, which is incorporated by reference. The project associated with this Agreement is: ${input.projectName}.`);

  if (input.subscription) {
    const cw = cadenceWord;
    drawSection(ctx, '02', 'Payment Terms',
      `Monthly Fee. The Monthly Fee for the selected tier is $${input.total.toLocaleString()} per ${cw}, billed via Stripe on the same day each ${cw}. The first ${cw}'s Fee is charged upon signing and is non-refundable once payment is confirmed.

Term. This Agreement renews ${cw}-to-${cw} automatically. Either Party may cancel on thirty (30) days written notice to info@andersoncollaborative.com. Cancellation takes effect at the end of the current billing ${cw}; no partial-${cw} refunds.

Tier Changes. Client may change tiers with fifteen (15) days written notice. Pro-rata adjustments apply on the next invoice.

Out-of-Scope Work. Work beyond the selected tier's scope is billed at $150 per hour with prior written approval.

Late Payment. If a Monthly Fee charge fails, Anderson Collaborative may suspend Services until the account is current. After two (2) consecutive failed charges, this Agreement terminates automatically.`);

    drawSection(ctx, '03', 'Revisions',
      `Each deliverable within the selected tier includes two (2) rounds of revisions. Additional rounds are billed as out-of-scope work under Section 2.`);

    drawSection(ctx, '04', 'Delivery Cadence',
      `Anderson Collaborative delivers the selected tier's scope on a ${cw}ly cadence. Client agrees to provide source material, brand assets, and reviewer feedback within three (3) business days of each request. Client-caused delays do not reduce the Monthly Fee or extend the billing ${cw}.`);

    drawSection(ctx, '05', 'Ownership and Licenses',
      `Deliverables produced under this Agreement become Client's property upon payment of the Monthly Fee for the ${cw} in which they were produced, except for open-source components (retained under their original licenses), generic utility assets retained by Anderson Collaborative for reuse, and Anderson Collaborative's pre-existing intellectual property. Anderson Collaborative retains portfolio rights; Client may opt out in writing at any time. Client represents it owns or has license to all content provided and grants Anderson Collaborative a license to use that content solely to perform the Services.`);
  } else {
    drawSection(ctx, '02', 'Payment Terms',
      `Deposit. 50% of the Total Project Fee is due at signing via Stripe Checkout. The Deposit is non-refundable once payment is confirmed.

Balance. The remaining 50% is due on the earlier of (a) project launch, or (b) 60 days after signing. Client authorizes Anderson Collaborative to charge the payment method saved at Deposit for the Balance via Stripe off-session billing on the due date.

Care Plan (optional). If elected, monthly billing begins on the launch date. 12-month minimum term; 30-day cancellation notice thereafter.

Out-of-Scope Work. Billed at $150 per hour with prior written approval.

Late Payment. 1.5% per month or the maximum allowed by law, whichever is lower. Anderson Collaborative may suspend Services until the account is current.`);

    drawSection(ctx, '03', 'Revisions',
      `Two (2) rounds of revisions are included per project phase (Discovery, Build, QA, Launch). Additional rounds are billed as out-of-scope work under Section 2.`);

    drawSection(ctx, '04', 'Timeline',
      `The target launch date assumes Client delivers brand assets, content, and reviewer feedback within three (3) business days of each request. Client-caused delays do not extend Anderson Collaborative's payment entitlement.`);

    drawSection(ctx, '05', 'Ownership and Licenses',
      `Upon receipt of the Balance, custom code, content, and design deliverables created specifically for Client become Client's property, except for open-source components (retained under their original licenses), generic utility code retained by Anderson Collaborative for reuse, and Anderson Collaborative's pre-existing intellectual property. Anderson Collaborative retains portfolio rights; Client may opt out in writing before launch. Client represents it owns or has license to all content provided and grants Anderson Collaborative a license to use that content solely to perform the Services.`);
  }

  drawSection(ctx, '06', 'Confidentiality',
    `Each Party agrees to hold the other's non-public information in confidence and not to disclose or use it except as required to perform this Agreement. This obligation survives termination for three (3) years.`);

  drawSection(ctx, '07', 'Data and Privacy',
    `All visitor analytics and customer data collected by the website are Client's exclusive property. Anderson Collaborative acts as a processor (not controller) of Client's end-user data and will implement reasonable technical and organizational measures to protect such data during the engagement.`);

  drawSection(ctx, '08', 'Warranties and Limitation of Liability',
    `Anderson Collaborative warrants that Services will be performed in a professional and workmanlike manner. Deliverables are provided "as is" thirty (30) days after final delivery, except for defects reported in writing during that period. Except for payment obligations, indemnification, and breach of confidentiality, each Party's total liability is limited to the ${input.subscription ? 'Monthly Fees' : 'Total Project Fee'} paid in the twelve (12) months preceding the claim. Neither Party is liable for indirect, consequential, incidental, punitive, or lost-profit damages.`);

  drawSection(ctx, '09', 'Termination',
    input.subscription
      ? `Either Party may terminate this Agreement on thirty (30) days written notice. Termination takes effect at the end of the current billing ${cadenceWord}; the final Monthly Fee is non-refundable and Services continue through that ${cadenceWord}. Anderson Collaborative may terminate immediately on two (2) consecutive failed Stripe charges. Sections 5, 6, 7, 8, 10, and 11 survive termination.`
      : `Either Party may terminate this Agreement on thirty (30) days written notice. If Client terminates before launch, Anderson Collaborative is entitled to pro-rata compensation for work completed plus the non-refundable Deposit. Sections 2, 5, 6, 7, 8, 10, and 11 survive termination.`);

  drawSection(ctx, '10', 'Electronic Signatures and Audit Trail',
    `The Parties consent to conduct this Agreement by electronic means under the U.S. E-SIGN Act (15 U.S.C. § 7001 et seq.) and the Florida Uniform Electronic Transaction Act (Fla. Stat. § 668.50). A signature delivered through Anderson Collaborative's e-signing system (drawn or typed), together with Client's click to ${input.subscription ? 'start the subscription' : 'pay the Deposit'} via Stripe, constitutes Client's valid and legally binding signature.

Anderson Collaborative's system captures as part of the signature record: signer full name, signer email, signer IP address, signer user agent, signature UTC timestamp, the selected tier, and the SHA-256 hash of the signed PDF. This record is admissible as evidence of execution. Anderson Collaborative retains a copy for at least seven (7) years and delivers a PDF copy to Client's email upon signing.`);

  drawSection(ctx, '11', 'General',
    `Governing Law. State of Florida, without regard to conflict-of-laws principles.

Venue. Any dispute arising out of or relating to this Agreement will be brought exclusively in the state or federal courts located in Miami-Dade County, Florida.

Entire Agreement. This Agreement is the complete and exclusive agreement between the Parties regarding its subject matter and supersedes all prior agreements or communications.

Amendments. Any amendment must be in writing and signed (electronically or otherwise) by both Parties.

Severability. If any provision is held unenforceable, the remaining provisions remain in full force.

Notices. By email with delivery confirmation to info@andersoncollaborative.com and ` + input.signerEmail + `.`);

  // ========== PAGE 4: Signatures ==========
  newPage(ctx);

  ctx.page.drawText('Signatures', {
    x: M.left, y: ctx.y - 28, size: 28, font: display, color: NAVY,
  });
  ctx.y -= 42;
  drawText(ctx, 'Both Parties execute this Agreement as of the Effective Date above.', {
    size: 10, color: TEXT_MUTED, gapAfter: 14,
  });
  drawDivider(ctx, 10);

  // --- CLIENT signature ---
  ctx.page.drawText('CLIENT', { x: M.left, y: ctx.y - 10, size: 9, font: bold, color: ELECTRIC_DARK });
  ctx.y -= 16;
  ctx.page.drawText(input.clientLegalName, { x: M.left, y: ctx.y - 12, size: 13, font: bold, color: NAVY });
  ctx.y -= 24;

  try {
    const sigBytes = b64ToBytes(input.signatureDataUrl);
    const sigImg = await doc.embedPng(sigBytes);
    const sigW = 200;
    const sigH = Math.min(66, sigImg.height * (sigW / sigImg.width));
    ensureRoom(ctx, sigH + 14);
    ctx.page.drawImage(sigImg, { x: M.left, y: ctx.y - sigH, width: sigW, height: sigH });
    ctx.page.drawRectangle({ x: M.left, y: ctx.y - sigH - 2, width: 240, height: 0.75, color: rgb(0.7, 0.72, 0.78) });
    ctx.y -= sigH + 6;
    drawText(ctx, input.signatureMethod === 'type'
      ? 'Client signature (typed electronically under E-SIGN)'
      : 'Client signature (drawn electronically under E-SIGN)',
      { size: 8, color: TEXT_MUTED, gapAfter: 10 });
  } catch {
    drawText(ctx, '[signature image could not be embedded]', { size: 9, color: TEXT_MUTED, gapAfter: 12 });
  }

  drawKeyVal(ctx, 'Printed Name', input.signerName);
  drawKeyVal(ctx, 'Title',        input.signerTitle);
  drawKeyVal(ctx, 'Email',        input.signerEmail);
  drawKeyVal(ctx, 'Signed (UTC)', new Date(input.signatureTimestamp).toISOString());
  ctx.y -= 10;

  // Audit trail box
  ensureRoom(ctx, 70);
  const auditTop = ctx.y;
  ctx.page.drawRectangle({
    x: M.left, y: auditTop - 68, width: CONTENT_W, height: 68,
    borderColor: BORDER, borderWidth: 0.5, color: CARD_BG,
  });
  ctx.page.drawRectangle({ x: M.left, y: auditTop - 68, width: 3, height: 68, color: ELECTRIC });
  ctx.page.drawText('CLIENT SIGNATURE AUDIT TRAIL', {
    x: M.left + 14, y: auditTop - 14, size: 7.5, font: bold, color: ELECTRIC_DARK,
  });
  const auditItems: [string, string][] = [
    ['IP Address',  input.ip],
    ['User Agent',  input.userAgent.length > 100 ? input.userAgent.slice(0, 100) + '…' : input.userAgent],
    ['Document ID', input.id],
  ];
  let ay = auditTop - 30;
  auditItems.forEach(([k, v]) => {
    ctx.page.drawText(k,  { x: M.left + 14, y: ay, size: 8, font: body, color: TEXT_MUTED });
    ctx.page.drawText(v,  { x: M.left + 108, y: ay, size: 8, font: body, color: TEXT_DARK });
    ay -= 12;
  });
  ctx.y = auditTop - 80;

  drawDivider(ctx, 12);

  // --- PROVIDER signature ---
  ctx.page.drawText('PROVIDER', { x: M.left, y: ctx.y - 10, size: 9, font: bold, color: ELECTRIC_DARK });
  ctx.y -= 16;
  ctx.page.drawText('Anderson Collaborative LLC', { x: M.left, y: ctx.y - 12, size: 13, font: bold, color: NAVY });
  ctx.y -= 30;

  // Stylized handwritten signature "Trevor Anderson" in Caveat (matches sign page typed-sig style).
  const sigText = 'Trevor Anderson';
  const sigSize = 38;
  ctx.page.drawText(sigText, {
    x: M.left, y: ctx.y - 30, size: sigSize, font: ctx.script, color: ELECTRIC_DARK,
  });
  const sigW2 = ctx.script.widthOfTextAtSize(sigText, sigSize);
  ctx.page.drawRectangle({ x: M.left, y: ctx.y - 36, width: Math.max(sigW2 + 20, 220), height: 0.75, color: rgb(0.7, 0.72, 0.78) });
  ctx.y -= 44;
  drawText(ctx, 'Provider signature (typed electronically under E-SIGN)', { size: 8, color: TEXT_MUTED, gapAfter: 10 });

  drawKeyVal(ctx, 'Printed Name', 'Trevor Anderson');
  drawKeyVal(ctx, 'Title',        'Founder & CEO');
  drawKeyVal(ctx, 'Email',        'info@andersoncollaborative.com');

  if (input.counterSigned) {
    drawKeyVal(ctx, 'Counter-signed', new Date(input.counterSigned.date).toISOString() + ' UTC');
    ctx.y -= 10;
    ensureRoom(ctx, 80);
    const exTop = ctx.y;
    ctx.page.drawRectangle({
      x: M.left, y: exTop - 76, width: CONTENT_W, height: 76,
      borderColor: rgb(0.73, 0.93, 0.80), borderWidth: 0.75, color: GREEN_BG,
    });
    ctx.page.drawRectangle({ x: M.left, y: exTop - 76, width: 3, height: 76, color: GREEN });
    ctx.page.drawText(
      input.subscription ? 'EXECUTION RECORD  ·  FIRST CHARGE RECEIVED' : 'EXECUTION RECORD  ·  DEPOSIT RECEIVED',
      { x: M.left + 14, y: exTop - 14, size: 8, font: bold, color: GREEN }
    );
    const exItems: [string, string][] = [
      ['Amount Paid',           `$${(input.counterSigned.amountPaid / 100).toFixed(2)} USD`],
      ['Stripe PaymentIntent',  input.counterSigned.stripePaymentIntent],
      ['Stripe Customer',       input.counterSigned.stripeCustomer],
    ];
    let ey = exTop - 30;
    exItems.forEach(([k, v]) => {
      ctx.page.drawText(k, { x: M.left + 14,  y: ey, size: 8.5, font: body, color: TEXT_MUTED });
      ctx.page.drawText(v, { x: M.left + 140, y: ey, size: 8.5, font: body, color: TEXT_DARK });
      ey -= 14;
    });
    ctx.y = exTop - 86;
  } else {
    drawText(
      ctx,
      input.subscription
        ? 'Counter-signed on receipt of the first Monthly Fee via Stripe. First charge pending.'
        : 'Counter-signed on receipt of Deposit via Stripe. Deposit pending.',
      { size: 9, color: TEXT_MUTED, gapAfter: 12 }
    );
  }

  // Apply page chrome to every page
  const pages = doc.getPages();
  // Save original page for restoring context; we need to draw chrome on each
  for (let i = 0; i < pages.length; i++) {
    ctx.page = pages[i];
    drawPageChrome(ctx, i + 1, pages.length);
  }

  return doc.save();
}

/** Compute SHA-256 hex digest of PDF bytes. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Convert Uint8Array to base64 string. Chunked because apply() blows the stack on large PDFs. */
export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let bin = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(bin);
}

// ====================================================================
// EMAIL TEMPLATES (Anderson Collaborative brand)
// ====================================================================

const EMAIL_WRAPPER_CSS = `
  body { margin: 0; padding: 0; background: #f4f6f9; }
  .wrap { max-width: 620px; margin: 0 auto; padding: 32px 16px; font-family: 'Rubik', 'Roboto', system-ui, -apple-system, 'Segoe UI', sans-serif; color: #00161F; }
  .card { background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(10, 22, 40, 0.08); }
  .header { background: linear-gradient(135deg, #00161F 0%, #012029 100%); padding: 32px 34px 30px; position: relative; }
  .header::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: linear-gradient(to right, #36D1C2, #2BB8AA); }
  .logo { display: block; height: 38px; width: auto; margin-bottom: 20px; }
  .eyebrow { font-size: 11px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: #36D1C2; margin-bottom: 14px; font-family: 'Rubik', system-ui, sans-serif; }
  h1.title { font-family: 'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 24px; font-weight: 300; color: #ffffff; margin: 0; line-height: 1.3; letter-spacing: 0.01em; }
  .body { padding: 32px 32px 28px; }
  .body p { font-size: 14px; line-height: 1.65; color: #3d4852; margin: 0 0 14px; }
  .body strong { color: #00161F; }
  .stats { background: #f7f9fb; border: 1px solid #e8ecf0; border-left: 3px solid #36D1C2; border-radius: 8px; padding: 16px 18px; margin: 18px 0 6px; }
  .stats table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .stats td { padding: 5px 0; vertical-align: top; }
  .stats td.k { color: #7b8794; width: 140px; }
  .stats td.v { color: #00161F; font-weight: 600; }
  .stats code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; background: rgba(0,173,239,0.07); padding: 2px 5px; border-radius: 3px; }
  .cta-wrap { text-align: center; margin: 24px 0 8px; }
  .cta { display: inline-block; background: #36D1C2; color: #00161F; text-decoration: none; font-weight: 700; padding: 14px 32px; border-radius: 10px; font-size: 15px; letter-spacing: 0.01em; }
  .footer { padding: 20px 32px 24px; background: #fafbfc; border-top: 1px solid #e8ecf0; text-align: center; }
  .footer p { font-size: 11px; color: #7b8794; margin: 3px 0; line-height: 1.5; }
  .footer a { color: #2BB8AA; text-decoration: none; }
  .tagline { font-style: italic; color: #7b8794; font-size: 11px; letter-spacing: 0.01em; }
`;

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string));
}

function emailShell(innerHtml: string, title: string, brand: EmailAgencyBrand): string {
  const footerLine = brand.postalAddress
    ? `${brand.companyName} · ${brand.postalAddress} · <a href="${brand.marketingUrl}" style="color:#2BB8AA;">${brand.marketingHost}</a>`
    : `${brand.companyName} · <a href="${brand.marketingUrl}" style="color:#2BB8AA;">${brand.marketingHost}</a>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<!--[if !mso]><!--><link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500&family=Rubik:wght@400;500;600&display=swap" rel="stylesheet"><!--<![endif]-->
<style>${EMAIL_WRAPPER_CSS}</style></head>
<body>
<div class="wrap">
  ${innerHtml}
  <div class="footer" style="margin-top: 0; border-radius: 0 0 12px 12px;"></div>
  <p class="tagline" style="text-align:center; margin: 14px 0 0;">Solving the marketing problems of today with the strategies of tomorrow.</p>
  <p style="text-align:center; font-size:10.5px; color:#7b8794; margin: 6px 0 0;">${footerLine}</p>
</div>
</body></html>`;
}

export function emailClientSigned(input: {
  signerName: string;
  tierLabel: string;
  total: number;
  deposit: number;
  stripeUrl: string;
  signerEmail: string;
  id: string;
  pdfHash: string;
  projectName: string;
  projectShortName?: string;
  subscription?: boolean;
  cadence?: 'month' | 'year' | 'week';
  agency?: AgencyBrand;
  /** Anyone-with-link onboarding intake URL. When present, surfaced after the
   *  payment CTA so signers can start filling in footage / socials / Cortex
   *  account emails without waiting for payment to clear. */
  intakeUrl?: string;
}): string {
  const brand = resolveEmailAgencyBrand(input.agency ?? 'anderson');
  const first = input.signerName.split(' ')[0] || input.signerName;
  const href = `${input.stripeUrl}?prefilled_email=${encodeURIComponent(input.signerEmail)}&client_reference_id=${input.id}`;
  const cw = input.cadence === 'year' ? 'year' : input.cadence === 'week' ? 'week' : 'month';
  const isSub = !!input.subscription;
  const stats = isSub
    ? `
        <tr><td class="k">Tier</td><td class="v">${esc(input.tierLabel)}</td></tr>
        <tr><td class="k">Monthly Fee</td><td class="v">$${input.total.toLocaleString()} / ${cw}</td></tr>
        <tr><td class="k">First Charge</td><td class="v">$${input.deposit.toLocaleString()} now</td></tr>
        <tr><td class="k">Document ID</td><td class="v"><code>${input.id}</code></td></tr>
        <tr><td class="k">SHA-256</td><td class="v"><code>${input.pdfHash.slice(0, 32)}…</code></td></tr>`
    : `
        <tr><td class="k">Tier</td><td class="v">${esc(input.tierLabel)}</td></tr>
        <tr><td class="k">Total Project Fee</td><td class="v">$${input.total.toLocaleString()}</td></tr>
        <tr><td class="k">Deposit (50%)</td><td class="v">$${input.deposit.toLocaleString()}</td></tr>
        <tr><td class="k">Document ID</td><td class="v"><code>${input.id}</code></td></tr>
        <tr><td class="k">SHA-256</td><td class="v"><code>${input.pdfHash.slice(0, 32)}…</code></td></tr>`;
  const nextStep = isSub
    ? `<strong>Next step:</strong> complete your first ${cw}'s payment below. You will be billed $${input.total.toLocaleString()} / ${cw} on the same day each ${cw} after that; cancel anytime with 30 days notice.`
    : `<strong>Next step:</strong> complete your deposit payment below. Your card will be saved to auto-charge the 50% balance at launch (or within 60 days, whichever comes first).`;
  const ctaLabel = isSub
    ? `Pay $${input.deposit.toLocaleString()} first ${cw} →`
    : `Pay $${input.deposit.toLocaleString()} deposit →`;
  const clearedLine = isSub
    ? `Once the first ${cw} clears, we send a fully counter-signed copy of the agreement and kick off your first deliverables. Questions? Reply to this email.`
    : `Once the deposit clears, we send a fully counter-signed copy of the agreement. Questions? Reply to this email.`;
  const inner = `
  <div class="card">
    <div class="header">
      <img class="logo" src="${brand.logoUrl}" alt="${esc(brand.companyName)}">
      <div class="eyebrow">Agreement Signed</div>
      <h1 class="title">Thank you, ${esc(first)}. One step to kickoff.</h1>
    </div>
    <div class="body">
      <p>Your signed <strong>${esc(input.projectName)}</strong> Service Agreement with ${esc(brand.companyName)} is attached. We kept a copy for our records.</p>
      <div class="stats"><table>${stats}
      </table></div>
      <p style="margin-top: 18px;">${nextStep}</p>
      <div class="cta-wrap"><a class="cta" href="${esc(href)}">${esc(ctaLabel)}</a></div>
      ${input.intakeUrl ? `
      <hr style="border: none; border-top: 1px solid #e6e8eb; margin: 22px 0 18px 0;">
      <p style="margin: 0 0 10px 0;"><strong>Get a head start on onboarding.</strong></p>
      <p style="margin: 0 0 14px 0; font-size: 13px; color: #4a5568;">While your first payment is processing, drop your raw footage, brand assets, and connect your socials so we can begin the moment it clears.</p>
      <div class="cta-wrap"><a class="cta" style="background: #2d3748;" href="${esc(input.intakeUrl)}">Start onboarding intake →</a></div>` : ''}
      <p style="font-size: 12px; color: #7b8794; margin-top: 18px;">${clearedLine}</p>
    </div>
  </div>`;
  const subject = isSub
    ? `${input.projectName} agreement signed. First ${cw} payment link inside.`
    : `${input.projectName} agreement signed. Deposit link inside.`;
  return emailShell(inner, subject, brand);
}

export function emailOpsSigned(input: {
  clientLegalName: string;
  signerName: string;
  signerTitle: string;
  signerEmail: string;
  clientAddress: string;
  tierLabel: string;
  total: number;
  deposit: number;
  signedAt: string;
  ip: string;
  ua: string;
  id: string;
  pdfHash: string;
  projectName: string;
  subscription?: boolean;
  cadence?: 'month' | 'year' | 'week';
  agency?: AgencyBrand;
}): string {
  const brand = resolveEmailAgencyBrand(input.agency ?? 'anderson');
  const cw = input.cadence === 'year' ? 'year' : input.cadence === 'week' ? 'week' : 'month';
  const isSub = !!input.subscription;
  const tierLine = isSub
    ? `${esc(input.tierLabel)} · $${input.total.toLocaleString()} / ${cw} (first charge $${input.deposit.toLocaleString()})`
    : `${esc(input.tierLabel)} · $${input.total.toLocaleString()} ($${input.deposit.toLocaleString()} deposit)`;
  const statusLine = isSub
    ? `<strong>Status:</strong> Stripe first-${cw} link sent to client. Payment pending. Webhook will fire the counter-signed PDF once it clears.`
    : `<strong>Status:</strong> Stripe deposit link sent to client. Payment pending. Webhook will fire the counter-signed PDF once it clears.`;
  const inner = `
  <div class="card">
    <div class="header">
      <img class="logo" src="${brand.logoUrl}" alt="${esc(brand.companyName)}">
      <div class="eyebrow">New Signing · ${esc(input.projectName)}</div>
      <h1 class="title">${esc(input.clientLegalName)}</h1>
    </div>
    <div class="body">
      <div class="stats"><table>
        <tr><td class="k">Signer</td><td class="v">${esc(input.signerName)}, ${esc(input.signerTitle)}</td></tr>
        <tr><td class="k">Email</td><td class="v"><a href="mailto:${esc(input.signerEmail)}" style="color:#2BB8AA;">${esc(input.signerEmail)}</a></td></tr>
        <tr><td class="k">Address</td><td class="v">${esc(input.clientAddress)}</td></tr>
        <tr><td class="k">Tier</td><td class="v">${tierLine}</td></tr>
        <tr><td class="k">Signed (UTC)</td><td class="v">${esc(input.signedAt)}</td></tr>
        <tr><td class="k">IP</td><td class="v"><code>${esc(input.ip)}</code></td></tr>
        <tr><td class="k">User Agent</td><td class="v" style="font-size:11px;">${esc(input.ua.slice(0, 80))}</td></tr>
        <tr><td class="k">Document ID</td><td class="v"><code>${esc(input.id)}</code></td></tr>
        <tr><td class="k">SHA-256</td><td class="v"><code>${esc(input.pdfHash.slice(0, 32))}…</code></td></tr>
      </table></div>
      <p style="margin-top: 18px;">${statusLine}</p>
      <p style="font-size: 12px; color: #7b8794;">KV: <code>sign:${esc(input.id)}:*</code> · 7-year retention.</p>
    </div>
  </div>`;
  return emailShell(inner, `[Signed · ${input.projectName}] ${input.clientLegalName} · ${input.tierLabel}`, brand);
}

export function emailClientPaid(input: {
  signerName: string;
  tierLabel: string;
  total: number;
  deposit: number;
  amountPaid: number; // cents
  id: string;
  executedHash: string;
  projectName: string;
  subscription?: boolean;
  cadence?: 'month' | 'year' | 'week';
  agency?: AgencyBrand;
}): string {
  const brand = resolveEmailAgencyBrand(input.agency ?? 'anderson');
  const first = input.signerName.split(' ')[0] || input.signerName;
  const cw = input.cadence === 'year' ? 'year' : input.cadence === 'week' ? 'week' : 'month';
  const isSub = !!input.subscription;
  const eyebrowText = isSub ? `First ${cw.charAt(0).toUpperCase()}${cw.slice(1)} Received · Fully Executed` : 'Deposit Received · Fully Executed';
  const openingLine = isSub
    ? `Your first ${cw}'s payment of <strong>$${(input.amountPaid / 100).toFixed(2)}</strong> has cleared. The attached PDF is the fully counter-signed agreement, executed by ${esc(brand.signerName)} on behalf of ${esc(brand.companyName)}.`
    : `Your deposit of <strong>$${(input.amountPaid / 100).toFixed(2)}</strong> has cleared. The attached PDF is the fully counter-signed agreement, executed by ${esc(brand.signerName)} on behalf of ${esc(brand.companyName)}.`;
  const stats = isSub
    ? `
        <tr><td class="k">Tier</td><td class="v">${esc(input.tierLabel)}</td></tr>
        <tr><td class="k">Monthly Fee</td><td class="v">$${input.total.toLocaleString()} / ${cw}</td></tr>
        <tr><td class="k">Paid today</td><td class="v">$${(input.amountPaid / 100).toFixed(2)} (first ${cw})</td></tr>
        <tr><td class="k">Next Charge</td><td class="v">$${input.total.toLocaleString()} on the same date next ${cw}</td></tr>
        <tr><td class="k">Document ID</td><td class="v"><code>${input.id}</code></td></tr>
        <tr><td class="k">Executed SHA-256</td><td class="v"><code>${input.executedHash.slice(0, 32)}…</code></td></tr>`
    : `
        <tr><td class="k">Project</td><td class="v">${esc(input.tierLabel)} · $${input.total.toLocaleString()} total</td></tr>
        <tr><td class="k">Paid today</td><td class="v">$${(input.amountPaid / 100).toFixed(2)}</td></tr>
        <tr><td class="k">Balance</td><td class="v">$${input.deposit.toLocaleString()} at launch or day 60</td></tr>
        <tr><td class="k">Document ID</td><td class="v"><code>${input.id}</code></td></tr>
        <tr><td class="k">Executed SHA-256</td><td class="v"><code>${input.executedHash.slice(0, 32)}…</code></td></tr>`;
  const nextLine = isSub
    ? `<strong>What happens next:</strong> we reach out within 24 hours to confirm intake and start your first ${cw}'s deliverables. Please send over brand guidelines, existing assets, and any priority content you want us to work on first.`
    : `<strong>What happens next:</strong> we reach out within 24 hours to schedule kickoff. In the meantime, start gathering brand assets, preferred color palette, competitor sites you admire, and any content to migrate.`;
  const contactFirstName = brand.signerName.split(' ')[0] || brand.signerName;
  const inner = `
  <div class="card">
    <div class="header" style="background: linear-gradient(135deg, #00161F 0%, #012029 100%);">
      <img class="logo" src="${brand.logoUrl}" alt="${esc(brand.companyName)}">
      <div class="eyebrow" style="color: #4ade80;">${eyebrowText}</div>
      <h1 class="title">Welcome aboard, ${esc(first)}. Kickoff inbound.</h1>
    </div>
    <div class="body">
      <p>${openingLine}</p>
      <div class="stats" style="border-left-color: #16a34a;"><table>${stats}
      </table></div>
      <p style="margin-top: 18px;">${nextLine}</p>
      <p style="font-size: 12px; color: #7b8794; margin-top: 18px;">Questions? Reply to this email or reach ${esc(contactFirstName)} at ${esc(brand.contactEmail)}.</p>
    </div>
  </div>`;
  const subject = isSub
    ? `First ${cw} received. Fully executed ${input.projectName} agreement attached.`
    : `Deposit received. Fully executed ${input.projectName} agreement attached.`;
  return emailShell(inner, subject, brand);
}

export function emailOpsPaid(input: {
  clientLegalName: string;
  signerName: string;
  signerEmail: string;
  tierLabel: string;
  total: number;
  deposit: number;
  amountPaid: number;
  stripeCustomer: string;
  stripePaymentIntent: string;
  id: string;
  projectName: string;
  subscription?: boolean;
  cadence?: 'month' | 'year' | 'week';
  agency?: AgencyBrand;
}): string {
  const brand = resolveEmailAgencyBrand(input.agency ?? 'anderson');
  const cw = input.cadence === 'year' ? 'year' : input.cadence === 'week' ? 'week' : 'month';
  const isSub = !!input.subscription;
  const eyebrowText = isSub
    ? `First ${cw.charAt(0).toUpperCase()}${cw.slice(1)} Cleared · $${(input.amountPaid / 100).toFixed(2)}`
    : `Deposit Cleared · $${(input.amountPaid / 100).toFixed(2)}`;
  const tierRow = isSub
    ? `${esc(input.tierLabel)} · $${input.total.toLocaleString()} / ${cw}`
    : `${esc(input.tierLabel)} · $${input.total.toLocaleString()}`;
  const secondRowLabel = isSub ? 'Next Charge' : 'Balance Due';
  const secondRowValue = isSub
    ? `$${input.total.toLocaleString()} same date next ${cw}`
    : `$${input.deposit.toLocaleString()} at launch or day 60`;
  const inner = `
  <div class="card">
    <div class="header">
      <img class="logo" src="${brand.logoUrl}" alt="${esc(brand.companyName)}">
      <div class="eyebrow" style="color: #4ade80;">${eyebrowText}</div>
      <h1 class="title">${esc(input.clientLegalName)} → kickoff within 24h</h1>
    </div>
    <div class="body">
      <div class="stats" style="border-left-color: #16a34a;"><table>
        <tr><td class="k">Tier</td><td class="v">${tierRow}</td></tr>
        <tr><td class="k">Client</td><td class="v">${esc(input.signerName)} (<a href="mailto:${esc(input.signerEmail)}" style="color:#2BB8AA;">${esc(input.signerEmail)}</a>)</td></tr>
        <tr><td class="k">Paid</td><td class="v">$${(input.amountPaid / 100).toFixed(2)} USD</td></tr>
        <tr><td class="k">${secondRowLabel}</td><td class="v">${secondRowValue}</td></tr>
        <tr><td class="k">Stripe Customer</td><td class="v"><code>${esc(input.stripeCustomer)}</code></td></tr>
        <tr><td class="k">PaymentIntent</td><td class="v"><code>${esc(input.stripePaymentIntent)}</code></td></tr>
        <tr><td class="k">Document ID</td><td class="v"><code>${esc(input.id)}</code></td></tr>
      </table></div>
      <p style="margin-top: 18px;">Fully executed PDF attached. <strong>Kickoff call needed within 24h.</strong></p>
    </div>
  </div>`;
  return emailShell(inner, `[Paid · ${input.projectName}] ${input.clientLegalName} · ${input.tierLabel}`, brand);
}
