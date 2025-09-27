import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getUnanswered,
  getDrafts,
  getHistoryList,
  getDetail,
  getHistoryDetail,
  getAllTopicOptionsPinnedFirst,
  getUpdateData,
} from "../api/gas";
import type {
  UnansweredItem,
  DraftItem,
  HistoryItem,
  Detail as DetailT,
  HistoryDetail as HistoryDetailT,
  UpdateItem,
} from "../types";

/* ========== Query Keys ========== */
export const qk = {
  unans: ["unans"] as const,
  drafts: ["drafts"] as const,
  history: ["history"] as const,
  detail: (row: number) => ["detail", row] as const,
  historyDetail: (row: number) => ["historyDetail", row] as const,
  topicOptions: ["topicOptions"] as const,
  updateList: (q: string, topicKey: string) => ["updateList", q, topicKey] as const,
};

/* ========== Hooks ========== */

// 未回答一覧
export function useUnanswered() {
  return useQuery<UnansweredItem[]>({
    queryKey: qk.unans,
    queryFn: getUnanswered,
  });
}

// 下書き一覧
export function useDrafts() {
  return useQuery<DraftItem[]>({
    queryKey: qk.drafts,
    queryFn: getDrafts,
  });
}

// 履歴一覧
export function useHistoryList() {
  return useQuery<HistoryItem[]>({
    queryKey: qk.history,
    queryFn: getHistoryList,
  });
}

// 詳細（未回答/下書き）
export function useDetail(row?: number) {
  return useQuery<DetailT>({
    enabled: typeof row === "number",
    queryKey: qk.detail(row as number),
    queryFn: () => getDetail(row as number),
  });
}

// 履歴詳細
export function useHistoryDetail(row?: number) {
  return useQuery<HistoryDetailT>({
    enabled: typeof row === "number",
    queryKey: qk.historyDetail(row as number),
    queryFn: () => getHistoryDetail(row as number),
  });
}

// Topic 選択肢
export function useTopicOptions() {
  return useQuery<string[]>({
    queryKey: qk.topicOptions,
    queryFn: getAllTopicOptionsPinnedFirst,
  });
}

// 更新タブのリスト
export function useUpdateList(q: string, topicKey: string) {
  return useQuery<UpdateItem[]>({
    queryKey: qk.updateList(q, topicKey),
    queryFn: () =>
      getUpdateData({
        q,
        topicKey,
        limit: 300,
        pinnedFirst: true,
      }),
  });
}

/* ========== ヘルパー（invalidateなど） ========== */
export function useInvalidate() {
  const qc = useQueryClient();
  return {
    unans: () => qc.invalidateQueries({ queryKey: qk.unans }),
    drafts: () => qc.invalidateQueries({ queryKey: qk.drafts }),
    history: () => qc.invalidateQueries({ queryKey: qk.history }),
    detail: (row: number) => qc.invalidateQueries({ queryKey: qk.detail(row) }),
    historyDetail: (row: number) =>
      qc.invalidateQueries({ queryKey: qk.historyDetail(row) }),
    topicOptions: () => qc.invalidateQueries({ queryKey: qk.topicOptions }),
    updateList: (q: string, topicKey: string) =>
      qc.invalidateQueries({ queryKey: qk.updateList(q, topicKey) }),
  };
}
