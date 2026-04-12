export type ArtifactType = 'script' | 'plan' | 'diagram' | 'ideas' | 'hook' | 'strategy' | 'general';

export interface NerdArtifact {
  id: string;
  client_id: string | null;
  conversation_id: string | null;
  created_by: string | null;
  title: string;
  content: string;
  artifact_type: ArtifactType;
  created_at: string;
  updated_at: string;
}

/**
 * Detect the artifact type from message content.
 * Uses simple heuristics — looks for structural markers.
 */
export function detectArtifactType(content: string): ArtifactType {
  const lower = content.toLowerCase();

  if (/```mermaid/i.test(content)) return 'diagram';
  if (/^#{1,3}\s.*script/im.test(content) || /\*\*hook\*\*/i.test(content) && /beat\s*\d/i.test(content)) return 'script';
  if (/\*\*hook\*\*/i.test(content) && (lower.includes('hook 1') || lower.includes('hook #'))) return 'hook';
  if (/content\s*strategy|posting\s*cadence|content\s*pillar/i.test(content)) return 'strategy';
  if (/video\s*idea|concept|angle/i.test(content) && /^\s*\d+\./m.test(content)) return 'ideas';
  if (/action\s*plan|implementation|phase\s*\d|roadmap/i.test(content)) return 'plan';

  return 'general';
}

/**
 * Extract a title from the first heading or first line of content.
 */
export function extractArtifactTitle(content: string): string {
  // Try first markdown heading
  const headingMatch = content.match(/^#{1,3}\s+(.+)/m);
  if (headingMatch) return headingMatch[1].trim().slice(0, 120);

  // Try first bold text
  const boldMatch = content.match(/\*\*(.+?)\*\*/);
  if (boldMatch) return boldMatch[1].trim().slice(0, 120);

  // Fall back to first non-empty line
  const firstLine = content.split('\n').find((l) => l.trim().length > 0);
  if (firstLine) return firstLine.trim().slice(0, 120);

  return 'Untitled artifact';
}
