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

/** Convert tool definitions to OpenAI-compatible function format for API calls */
export function getToolsForAPI(): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  return getAllTools().map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.parameters),
    },
  }));
}

/** Simple Zod to JSON Schema converter for common types */
function zodToJsonSchema(schema: unknown): Record<string, unknown> {
  // Use zod's built-in shape inspection
  const zodSchema = schema as { _def?: { typeName?: string; shape?: () => Record<string, unknown>; innerType?: unknown; options?: unknown[]; values?: string[]; checks?: Array<{ kind: string }> } };
  const def = zodSchema?._def;

  if (!def) return { type: 'object' };

  switch (def.typeName) {
    case 'ZodObject': {
      const shape = def.shape?.() ?? {};
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        const fieldDef = (value as { _def?: { typeName?: string } })?._def;
        properties[key] = zodToJsonSchema(value);
        // If the field is not optional, it's required
        if (fieldDef?.typeName !== 'ZodOptional' && fieldDef?.typeName !== 'ZodDefault') {
          required.push(key);
        }
      }

      return { type: 'object', properties, ...(required.length > 0 ? { required } : {}) };
    }
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodArray':
      return { type: 'array', items: zodToJsonSchema(def.innerType) };
    case 'ZodEnum':
      return { type: 'string', enum: def.values };
    case 'ZodOptional':
      return zodToJsonSchema(def.innerType);
    case 'ZodDefault':
      return zodToJsonSchema(def.innerType);
    case 'ZodNullable':
      return { ...zodToJsonSchema(def.innerType), nullable: true };
    case 'ZodUnion': {
      const options = (def.options as unknown[]) ?? [];
      return { oneOf: options.map((o) => zodToJsonSchema(o)) };
    }
    default:
      return { type: 'string' };
  }
}
