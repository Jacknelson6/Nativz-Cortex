/**
 * Parse JSON from an AI response, stripping markdown code fences if present.
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

  try {
    return JSON.parse(jsonText) as T;
  } catch (e) {
    // Provide context about the parse failure
    const preview = jsonText.substring(0, 200);
    throw new Error(
      `Failed to parse AI response as JSON. Response starts with: "${preview}..." ` +
      `(${e instanceof Error ? e.message : 'Unknown parse error'})`
    );
  }
}
