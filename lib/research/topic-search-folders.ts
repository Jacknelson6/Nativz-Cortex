export type TopicSearchFolder = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
};

/** Tailwind-ish token for folder icon tint (matches `topic_search_folders.color`). */
export const TOPIC_SEARCH_FOLDER_COLOR_CLASS: Record<string, string> = {
  zinc: 'text-zinc-400',
  blue: 'text-blue-400',
  green: 'text-emerald-400',
  amber: 'text-amber-400',
  rose: 'text-rose-400',
  violet: 'text-violet-400',
};

export function folderIconClass(color: string): string {
  return TOPIC_SEARCH_FOLDER_COLOR_CLASS[color] ?? TOPIC_SEARCH_FOLDER_COLOR_CLASS.zinc;
}
