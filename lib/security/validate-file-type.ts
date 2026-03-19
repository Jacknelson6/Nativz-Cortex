/**
 * Magic byte validation for uploaded files.
 *
 * Checks the first bytes of a file buffer against known file signatures
 * to prevent spoofed Content-Type attacks.
 */

interface FileSignature {
  type: string;
  /** Byte offsets and expected values */
  signatures: { offset: number; bytes: number[] }[];
}

const FILE_SIGNATURES: FileSignature[] = [
  {
    type: 'image/png',
    signatures: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }], // 89504E47
  },
  {
    type: 'image/jpeg',
    signatures: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }], // FFD8FF
  },
  {
    type: 'image/gif',
    signatures: [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }], // GIF8 (covers GIF87a and GIF89a)
  },
  {
    type: 'image/webp',
    // RIFF....WEBP — bytes 0-3 = RIFF, bytes 8-11 = WEBP
    signatures: [
      { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
      { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
    ],
  },
  {
    type: 'image/svg+xml',
    // Handled specially below — text-based format
    signatures: [],
  },
  {
    type: 'application/pdf',
    signatures: [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }], // %PDF
  },
];

function matchesSignature(view: Uint8Array, sig: FileSignature): boolean {
  for (const { offset, bytes } of sig.signatures) {
    if (offset + bytes.length > view.length) return false;
    for (let i = 0; i < bytes.length; i++) {
      if (view[offset + i] !== bytes[i]) return false;
    }
  }
  return sig.signatures.length > 0;
}

function isSvg(view: Uint8Array): boolean {
  // Check first 256 bytes for SVG markers
  const len = Math.min(view.length, 256);
  const header = new TextDecoder('utf-8', { fatal: false }).decode(view.slice(0, len)).toLowerCase().trim();
  return header.startsWith('<svg') || header.startsWith('<?xml');
}

/**
 * Validate a file's actual content against allowed MIME types using magic bytes.
 *
 * @param buffer - The file's ArrayBuffer (or at least the first 16 bytes)
 * @param allowedTypes - Array of MIME types to allow, e.g. ['image/png', 'image/jpeg']
 * @returns `{ valid, detectedType }` — valid is true if the detected type is in allowedTypes
 */
export function validateFileSignature(
  buffer: ArrayBuffer,
  allowedTypes: string[],
): { valid: boolean; detectedType: string | null } {
  const view = new Uint8Array(buffer);

  if (view.length < 4) {
    return { valid: false, detectedType: null };
  }

  // Check binary signatures first
  for (const sig of FILE_SIGNATURES) {
    if (sig.type === 'image/svg+xml') continue; // handled separately
    if (matchesSignature(view, sig)) {
      return {
        valid: allowedTypes.includes(sig.type),
        detectedType: sig.type,
      };
    }
  }

  // Check SVG (text-based)
  if (isSvg(view)) {
    return {
      valid: allowedTypes.includes('image/svg+xml'),
      detectedType: 'image/svg+xml',
    };
  }

  return { valid: false, detectedType: null };
}
