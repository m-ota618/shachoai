// src/api/gasClient.ts
import {
  getUnanswered,
  getDrafts,
  getDetail,
  getHistoryList,
  getHistoryDetail,
} from "./gas";
import type {
  UnansweredItem,
  DraftItem,
  Detail as DetailT,
  HistoryItem,
  HistoryDetail as HistoryDetailT,
} from "../types";

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((e: any) => {
    const msg = e?.message || e?.toString?.() || "Unknown error";
    throw new Error(`[GAS] ${msg}`);
  });
}

export const api = {
  unanswered(): Promise<UnansweredItem[]> { return wrap(() => getUnanswered()); },
  drafts(): Promise<DraftItem[]> { return wrap(() => getDrafts()); },
  detail(row: number): Promise<DetailT> { return wrap(() => getDetail(row)); },
  history(): Promise<HistoryItem[]> { return wrap(() => getHistoryList()); },
  historyDetail(row: number): Promise<HistoryDetailT> { return wrap(() => getHistoryDetail(row)); },
};
