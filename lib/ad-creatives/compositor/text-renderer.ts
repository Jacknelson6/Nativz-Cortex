import satori from 'satori';
import sharp from 'sharp';
import type { ResolvedFont } from '@/lib/ad-creatives/resolve-fonts';

export type TextRole = 'headline' | 'subheadline' | 'cta' | 'offer';

export interface RenderTextParams {
  text: string;
  font: ResolvedFont;
  canvasHeight: number;
  maxWidth: number;
  maxHeight: number;
  color: string;
  align?: 'left' | 'center' | 'right';
  role: TextRole;
}

/** Exported for compositor QA / layout tuning (ratios vs canvas height). */
export function computeFontSize(role: TextRole, canvasHeight: number): number {
  const ratios: Record<TextRole, number> = {
    headline: 0.065,
    subheadline: 0.032,
    cta: 0.03,
    offer: 0.028,
  };
  return Math.round(canvasHeight * ratios[role]);
}

function minFontSize(role: TextRole, canvasHeight: number): number {
  const ratios: Record<TextRole, number> = {
    headline: 0.065,
    subheadline: 0.032,
    cta: 0.03,
    offer: 0.028,
  };
  return Math.round(canvasHeight * ratios[role] * 0.6);
}

function buildElement(
  text: string,
  fontSize: number,
  font: ResolvedFont,
  color: string,
  maxWidth: number,
  maxHeight: number,
  align: 'left' | 'center' | 'right',
): { type: string; props: Record<string, unknown> } {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        width: maxWidth,
        height: maxHeight,
        color,
        fontSize,
        fontFamily: font.name,
        fontWeight: font.weight,
        lineHeight: 1.2,
        textAlign: align,
        wordWrap: 'break-word' as const,
        overflow: 'hidden',
      },
      children: text,
    },
  };
}

/**
 * Renders text to a PNG with auto-downscale when content exceeds maxHeight.
 */
export async function renderTextToPng(params: RenderTextParams): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
}> {
  const { font, maxWidth, maxHeight, color, align = 'left', role } = params;
  let fontSize = computeFontSize(role, params.canvasHeight);
  const floor = minFontSize(role, params.canvasHeight);
  const content = params.text;

  for (let attempt = 0; attempt < 4; attempt++) {
    const el = buildElement(content, fontSize, font, color, maxWidth, maxHeight, align);
    const svg = await satori(el as never, {
      width: maxWidth,
      height: maxHeight,
      fonts: [
        {
          name: font.name,
          data: font.data,
          weight: font.weight as 400 | 500 | 600 | 700 | 800,
          style: 'normal',
        },
      ],
    });
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const meta = await sharp(png).metadata();
    const h = meta.height ?? 0;
    if (h <= maxHeight || fontSize <= floor) {
      return {
        buffer: png,
        width: meta.width ?? maxWidth,
        height: h,
      };
    }
    fontSize = Math.round(fontSize * 0.85);
  }

  const truncated = content.length > 80 ? `${content.slice(0, 77)}…` : content;
  const el = buildElement(truncated, floor, font, color, maxWidth, maxHeight, align);
  const svg = await satori(el as never, {
    width: maxWidth,
    height: maxHeight,
    fonts: [
      {
        name: font.name,
        data: font.data,
        weight: font.weight as 400 | 500 | 600 | 700 | 800,
        style: 'normal',
      },
    ],
  });
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const meta = await sharp(png).metadata();
  return {
    buffer: png,
    width: meta.width ?? maxWidth,
    height: meta.height ?? maxHeight,
  };
}
