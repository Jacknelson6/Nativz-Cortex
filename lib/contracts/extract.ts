import { createCompletion } from '@/lib/ai/client';
import {
  extractionResultSchema,
  deliverableSchema,
  PARSE_PROMPT_VERSION,
  type ExtractionResult,
} from './types';

const SYSTEM_PROMPT = `You extract structured deliverables from service contracts.

Rules:
- Only include MONTHLY-RECURRING deliverables. Ignore one-time scoped work (e.g., "1 website rebuild", "initial brand DNA build").
- Normalize service_tag to short proper-case labels. Common ones: "Editing", "SMM", "Paid media", "Strategy", "Brand DNA", "Content Lab".
- quantity_per_month is a positive integer. If the contract specifies an annual number, convert to monthly (round down).
- If deliverables are bundled into a single line (e.g., "12 pieces of content per month"), create one row.
- If multiple deliverables are listed, create one row per deliverable.
- effective_start and effective_end are ISO dates (YYYY-MM-DD) if present in the contract.
- suggested_label is a short human label for the contract (e.g., "Retainer 2026", "Paid Media Addendum").

Return ONLY valid JSON matching this shape, nothing else:
{
  "services": string[],
  "deliverables": [{ "service_tag": string, "name": string, "quantity_per_month": number, "notes"?: string }],
  "effective_start"?: string,
  "effective_end"?: string,
  "suggested_label"?: string
}`;

export async function extractTextFromFile(buffer: Buffer, mime: string): Promise<string> {
  if (mime === 'application/pdf') {
    const pdfParse = (await import('pdf-parse')).default;
    const res = await pdfParse(buffer);
    return res.text ?? '';
  }
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/msword'
  ) {
    const mammoth = await import('mammoth');
    const res = await mammoth.extractRawText({ buffer });
    return res.value ?? '';
  }
  if (mime === 'text/plain' || mime === 'text/markdown') {
    return buffer.toString('utf-8');
  }
  throw new Error(`Unsupported contract file type: ${mime}`);
}

const EMPTY_RESULT: ExtractionResult = {
  services: [],
  deliverables: [],
  effective_start: null,
  effective_end: null,
  suggested_label: null,
};

export function parseExtractionText(raw: string): ExtractionResult {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return EMPTY_RESULT;
  }

  const parseObj = (parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : {};
  const rawDeliverables = Array.isArray(parseObj.deliverables) ? parseObj.deliverables : [];
  const deliverables = rawDeliverables
    .map((d) => {
      const r = deliverableSchema.safeParse(d);
      return r.success ? r.data : null;
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  const full = extractionResultSchema.safeParse({ ...parseObj, deliverables });
  return full.success ? full.data : { ...EMPTY_RESULT, deliverables };
}

export interface ExtractOptions {
  feature?: string;
  userId?: string;
  userEmail?: string;
}

export async function extractContractDeliverables(
  text: string,
  opts: ExtractOptions = {},
): Promise<{ result: ExtractionResult; parseMeta: Record<string, unknown> }> {
  const completion = await createCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text.slice(0, 60000) },
    ],
    maxTokens: 4000,
    jsonMode: true,
    timeoutMs: 60_000,
    feature: opts.feature ?? 'contract-extract',
    userId: opts.userId,
    userEmail: opts.userEmail,
  });

  const result = parseExtractionText(completion.text);
  return {
    result,
    parseMeta: {
      model: completion.modelUsed,
      prompt_version: PARSE_PROMPT_VERSION,
      raw_response: completion.text.slice(0, 20000),
      token_usage: completion.usage,
      estimated_cost: completion.estimatedCost,
    },
  };
}
