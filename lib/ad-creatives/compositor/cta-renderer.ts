import satori from 'satori';
import sharp from 'sharp';
import type { ResolvedFont } from '@/lib/ad-creatives/resolve-fonts';

export function resolveButtonStyle(shape: string): {
  borderRadius: number;
  paddingX: number;
  paddingY: number;
} {
  const normalized = shape.toLowerCase();
  if (normalized.includes('pill')) {
    return { borderRadius: 999, paddingX: 40, paddingY: 14 };
  }
  if (normalized.includes('square') || normalized.includes('sharp')) {
    return { borderRadius: 4, paddingX: 32, paddingY: 12 };
  }
  if (normalized.includes('soft')) {
    return { borderRadius: 12, paddingX: 36, paddingY: 13 };
  }
  if (normalized.includes('round')) {
    return { borderRadius: 999, paddingX: 40, paddingY: 14 };
  }
  return { borderRadius: 12, paddingX: 36, paddingY: 13 };
}

export interface RenderCtaParams {
  text: string;
  font: ResolvedFont;
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  buttonShape: string;
  maxWidth: number;
}

export async function renderCtaToPng(params: RenderCtaParams): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
}> {
  const { text, font, fontSize, textColor, backgroundColor, buttonShape, maxWidth } = params;
  const { borderRadius, paddingX, paddingY } = resolveButtonStyle(buttonShape);
  // Defensive copy — prevents ArrayBuffer detachment in parallel satori calls
  const fontDataCopy = font.data.slice(0);

  // Outer wrapper centers the button within the satori canvas
  const el = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: maxWidth,
        height: 400,
      },
      children: {
        type: 'div',
        props: {
          style: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor,
            borderRadius,
            paddingLeft: paddingX,
            paddingRight: paddingX,
            paddingTop: paddingY,
            paddingBottom: paddingY,
          },
          children: {
            type: 'div',
            props: {
              style: {
                color: textColor,
                fontSize,
                fontFamily: font.name,
                fontWeight: font.weight,
                textAlign: 'center' as const,
                whiteSpace: 'nowrap' as const,
              },
              children: text,
            },
          },
        },
      },
    },
  };

  const svg = await satori(el as never, {
    width: maxWidth,
    height: 400,
    fonts: [
      {
        name: font.name,
        data: fontDataCopy,
        weight: font.weight as 400 | 500 | 600 | 700 | 800,
        style: 'normal',
      },
    ],
  });
  const fullPng = await sharp(Buffer.from(svg)).png().toBuffer();
  // Trim transparent pixels to get just the button (not the full canvas)
  const trimmed = await sharp(fullPng).trim().png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  return {
    buffer: trimmed,
    width: meta.width ?? maxWidth,
    height: meta.height ?? Math.round(fontSize + paddingY * 2),
  };
}
