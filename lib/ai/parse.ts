/**
 * Strip markdown bold/italic/code formatting from inside JSON string values.
 * The AI sometimes returns **bold** or *italic* text inside JSON strings.
 */
function stripMarkdownFromJsonStrings(text: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\' && inString) {
      result += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }

    if (inString) {
      if (text.slice(i, i + 2) === '**') {
        i += 1;
        continue;
      }
      if (ch === '*' || ch === '`') {
        continue;
      }
    }

    result += ch;
  }

  return result;
}

/**
 * Parse JSON from an AI response, stripping markdown code fences if present.
 * Includes repair logic for common LLM JSON issues (markdown in strings,
 * unescaped quotes, trailing commas, smart quotes).
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

  // Attempt 1: direct parse
  try {
    return JSON.parse(jsonText) as T;
  } catch {
    // Fall through to repair
  }

  // Attempt 2: strip markdown formatting inside strings (** * `)
  try {
    return JSON.parse(stripMarkdownFromJsonStrings(jsonText)) as T;
  } catch {
    // Fall through
  }

  // Attempt 3: fix common LLM JSON issues
  let repaired = stripMarkdownFromJsonStrings(jsonText);

  // Remove trailing commas before } or ]
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');

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

  // Attempt 4: extract JSON object bounds + re-escape inner quotes
  const firstBrace = repaired.indexOf('{');
  const lastBrace = repaired.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const extracted = repaired.slice(firstBrace, lastBrace + 1);

    const reEscaped = extracted.replace(
      /:\s*"((?:[^"\\]|\\.)*)"/g,
      (_match, content: string) => {
        const fixed = content.replace(/(?<!\\)"/g, '\\"');
        return `:"${fixed}"`;
      },
    );

    try {
      return JSON.parse(reEscaped) as T;
    } catch {
      // Fall through
    }

    try {
      return JSON.parse(extracted) as T;
    } catch {
      // Fall through to error
    }
  }

  const preview = jsonText.substring(0, 200);
  throw new Error(
    `Failed to parse AI response as JSON. Response starts with: "${preview}..." ` +
    `(All repair attempts failed)`
  );
}
