/**
 * Preset OpenAI chat model ids for direct API (`api.openai.com`).
 * Values are stored as `openai/<id>` in settings.
 *
 * Frontier and naming align with OpenAI’s published catalog:
 * https://developers.openai.com/api/docs/models
 *
 * We only list models suitable for text chat / completions. Image, realtime,
 * TTS, and transcription models use different endpoints — pick them via
 * “Custom model id” if you wire a separate integration.
 */
export type OpenAiChatModelOption = {
  id: string;
  label: string;
  /** Optional section heading in the settings dropdown */
  group?: string;
};

export const OPENAI_CHAT_MODEL_OPTIONS: OpenAiChatModelOption[] = [
  // GPT-5.4 — current frontier (flagship + smaller / cheaper variants)
  { id: 'gpt-5.4', label: 'GPT-5.4', group: 'GPT-5.4' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', group: 'GPT-5.4' },
  { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano', group: 'GPT-5.4' },

  // GPT-4 class — widely used; strong general + vision on API
  { id: 'gpt-4o', label: 'GPT-4o', group: 'GPT-4' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', group: 'GPT-4' },
  { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', group: 'GPT-4' },

  // Reasoning-focused (when your account has access)
  { id: 'o3-mini', label: 'o3-mini', group: 'Reasoning' },
  { id: 'o1', label: 'o1', group: 'Reasoning' },
  { id: 'o1-mini', label: 'o1-mini', group: 'Reasoning' },

  // Legacy / high-volume
  { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', group: 'Other' },
];

/** Flat ids for “is this a preset?” checks */
export const OPENAI_CHAT_MODEL_IDS = new Set(
  OPENAI_CHAT_MODEL_OPTIONS.map((o) => o.id),
);

/** Preserves list order; each run of the same `group` becomes one `<optgroup>`. */
export function openAiChatOptionGroups(): {
  label: string;
  options: OpenAiChatModelOption[];
}[] {
  const out: { label: string; options: OpenAiChatModelOption[] }[] = [];
  for (const o of OPENAI_CHAT_MODEL_OPTIONS) {
    const label = o.group ?? 'Other';
    const last = out[out.length - 1];
    if (last?.label === label) {
      last.options.push(o);
    } else {
      out.push({ label, options: [o] });
    }
  }
  return out;
}
