/**
 * Parse JSON from an AI response, stripping markdown code fences if present.
 * Includes repair logic for common LLM JSON issues (unescaped quotes, trailing commas).
 */
export function parseAIResponseJSON<T>(rawText: string): T {
  if (!rawText || !rawText.trim()) {
    throw new Error('AI returned an empty response. The model may be unavailable or rate-limited. Try again.');
  }

  let jsonText = rawText.trim();

  const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1].trim();
  }

  // First attempt: direct parse
  try {
    return JSON.parse(jsonText) as T;
  } catch {
    // Fall through to repair
  }

  // Repair attempt: fix common LLM JSON issues
  let repaired = jsonText;

  // Remove trailing commas before } or ]
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');

  // Fix unescaped newlines inside strings
  repaired = repaired.replace(/(?<=":[ ]*"[^"]*)\n(?=[^"]*")/g, '\\n');

  // Fix smart quotes
  repaired = repaired.replace(/[\u201C\u201D]/g, '"');
  repaired = repaired.replace(/[\u2018\u2019]/g, "'");

  // Fix unescaped control characters inside strings
  repaired = repaired.replace(/[\x00-\x1F\x7F]/g, (ch) => {
    if (ch === '\n' || ch === '\r' || ch === '\t') return ch;
    return '';
  });

  try {
    return JSON.parse(repaired) as T;
  } catch {
    // Fall through to aggressive repair
  }

  // Aggressive repair: try to extract the JSON object even if malformed
  // Find the first { and last } to isolate the JSON
  const firstBrace = repaired.indexOf('{');
  const lastBrace = repaired.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const extracted = repaired.slice(firstBrace, lastBrace + 1);

    // Fix unescaped double quotes inside string values by looking for
    // patterns like: "key": "value with "problematic" quotes"
    // Strategy: re-escape quotes that appear inside values
    const reEscaped = extracted.replace(
      /:\s*"((?:[^"\\]|\\.)*)"/g,
      (_match, content: string) => {
        // The content between quotes — escape any unescaped inner quotes
        const fixed = content.replace(/(?<!\\)"/g, '\\"');
        return `:"${fixed}"`;
      },
    );

    try {
      return JSON.parse(reEscaped) as T;
    } catch {
      // Fall through
    }

    // Last resort: try the extracted substring as-is
    try {
      return JSON.parse(extracted) as T;
    } catch {
      // Fall through to error
    }
  }

  // All repair attempts failed
  const preview = jsonText.substring(0, 200);
  throw new Error(
    `Failed to parse AI response as JSON. Response starts with: "${preview}..." ` +
    `(All repair attempts failed)`
  );
}
