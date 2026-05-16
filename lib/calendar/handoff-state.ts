export type HandoffState =
  | 'editing'
  | 'smm_review'
  | 'smm_approved'
  | 'smm_rejected'
  | 'client_sent';

export type HandoffHistoryEntry = {
  state: HandoffState;
  at: string;
  actor: string;
  note?: string;
};

export const LEGAL_TRANSITIONS: Record<HandoffState, HandoffState[]> = {
  editing: ['smm_review'],
  smm_review: ['editing', 'smm_approved', 'smm_rejected'],
  smm_approved: ['editing', 'smm_rejected', 'client_sent'],
  smm_rejected: ['smm_review', 'editing'],
  client_sent: ['client_sent'],
};

export function canTransition(from: HandoffState, to: HandoffState): boolean {
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

export function appendHistory(
  prev: HandoffHistoryEntry[] | null | undefined,
  entry: Omit<HandoffHistoryEntry, 'at'> & { at?: string },
): HandoffHistoryEntry[] {
  const base = Array.isArray(prev) ? prev : [];
  return [
    ...base,
    {
      state: entry.state,
      at: entry.at ?? new Date().toISOString(),
      actor: entry.actor,
      ...(entry.note ? { note: entry.note } : {}),
    },
  ];
}
