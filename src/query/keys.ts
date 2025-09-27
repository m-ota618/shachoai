// src/query/keys.ts
export const QK = {
  unanswered: () => ["unanswered"] as const,
  drafts:     () => ["drafts"] as const,
  history:    () => ["history"] as const,
  detail:     (row: number) => ["detail", row] as const,
  historyDetail: (row: number) => ["historyDetail", row] as const,
};
