import { z } from 'zod';

export type ToolRiskLevel = 'read' | 'write' | 'destructive';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodType<unknown>;
  riskLevel: ToolRiskLevel;
  handler: (params: Record<string, unknown>, userId: string) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  /** Optional link to the relevant page in the app */
  link?: { href: string; label: string };
  /** Card type hint for the UI */
  cardType?: 'task' | 'post' | 'client' | 'shoot' | 'analytics' | 'search' | 'moodboard' | 'team' | 'notification' | 'calendar' | 'affiliate' | 'text';
}

/** Mention types for the @mention system */
export interface MentionEntity {
  type: 'client' | 'team_member';
  id: string;
  name: string;
  slug?: string;
}

export interface NerdMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  /** Parsed @mentions from user message */
  mentions?: MentionEntity[];
  /** Tool call info for assistant messages */
  toolCall?: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  };
  /** Tool result for tool role messages */
  toolResult?: ToolResult;
  /** Pending confirmation for write actions */
  pendingAction?: {
    toolName: string;
    arguments: Record<string, unknown>;
    summary: string;
  };
}
