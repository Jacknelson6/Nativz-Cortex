import { z } from 'zod';
import { ToolDefinition } from './types';

// Tool registry - tools are registered by domain modules
const tools: Map<string, ToolDefinition> = new Map();

export function registerTool(tool: ToolDefinition) {
  if (tools.has(tool.name)) {
    console.warn(`Tool "${tool.name}" already registered, overwriting`);
  }
  tools.set(tool.name, tool);
}

export function registerTools(toolList: ToolDefinition[]) {
  for (const tool of toolList) {
    registerTool(tool);
  }
}

export function getTool(name: string): ToolDefinition | undefined {
  return tools.get(name);
}

export function getAllTools(): ToolDefinition[] {
  return Array.from(tools.values());
}

/**
 * Convert tool definitions to OpenAI-compatible function format for API calls.
 *
 * Uses Zod v4's built-in `z.toJSONSchema` — the previous homegrown converter
 * read `_def.typeName` (a Zod v3 field) which is undefined in v4, so every
 * tool schema fell through to `{ type: 'string' }` and OpenRouter rejected
 * the first tool in the list with:
 *   "Invalid schema for function 'list_tasks': schema must be a JSON Schema
 *    of 'type: \"object\"', got 'type: \"string\"'"
 *
 * The built-in converter handles ZodObject, ZodOptional, ZodEnum, ZodUnion,
 * ZodArray, ZodRecord, format hints (z.string().uuid(), z.email(), ...) and
 * emits the `additionalProperties: false` that OpenAI strict mode requires.
 */
export function getToolsForAPI(): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  return getAllTools().map((tool) => {
    const raw = z.toJSONSchema(tool.parameters as z.ZodType) as Record<string, unknown>;
    // Drop the $schema meta field — OpenAI's function-call schema doesn't
    // need it and some strict validators trip on it.
    const { $schema: _ignored, ...parameters } = raw;
    void _ignored;
    return {
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters,
      },
    };
  });
}
