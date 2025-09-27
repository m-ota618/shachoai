// src/query/hooks.ts
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/gasClient";
import { QK } from "./keys";

export function useUnanswered() {
  return useQuery({
    queryKey: QK.unanswered(),
    queryFn: () => api.unanswered(),
  });
}

export function useDrafts() {
  return useQuery({
    queryKey: QK.drafts(),
    queryFn: () => api.drafts(),
  });
}

export function useHistory() {
  return useQuery({
    queryKey: QK.history(),
    queryFn: () => api.history(),
  });
}

export function useDetail(row: number | null) {
  return useQuery({
    enabled: !!row,
    queryKey: row ? QK.detail(row) : ["detail", "disabled"],
    queryFn: () => api.detail(row as number),
  });
}

export function useHistoryDetail(row: number | null) {
  return useQuery({
    enabled: !!row,
    queryKey: row ? QK.historyDetail(row) : ["historyDetail", "disabled"],
    queryFn: () => api.historyDetail(row as number),
  });
}

/** 先読みヘルパ（一覧→詳細で使う想定） */
export function useDetailPrefetch() {
  const qc = useQueryClient();
  return (row: number) =>
    qc.prefetchQuery({
      queryKey: QK.detail(row),
      queryFn: () => api.detail(row),
    });
}
