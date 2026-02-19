/**
 * Parse JSON from an AI response, stripping markdown code fences if present.
 */
export function parseAIResponseJSON<T>(rawText: string): T {
  let jsonText = rawText.trim();

  const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1].trim();
  }

  return JSON.parse(jsonText) as T;
}
