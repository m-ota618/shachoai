// src/api/gas.ts
import { supabase } from '../lib/supabase';
import type {
  UnansweredItem,
  DraftItem,
  Detail,
  HistoryItem,
  HistoryDetail,
  UpdateItem,
  PredictResult,
  BulkDryResult,
  BulkRunResult,
} from '../types';

/** フロント→サーバレス関数の基底URL（未設定なら /api） */
const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';
const GAS_URL = `${API_BASE.replace(/\/$/, '')}/gas`;

/** /api/gas に JSON POST（必ず Authorization: Bearer を付与） */
async function postJSON<T = unknown>(action: string, payload?: unknown): Promise<T> {
  // Supabase セッションからアクセストークン取得
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, payload }),
  });

  const text = await res.text();
  if (!res.ok) {
    // サーバ側のエラーメッセージをそのまま見せる
    throw new Error(text || `HTTP ${res.status}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    // GASが true/false や文字列を返すケースもある
    return text as unknown as T;
  }
}

function arr<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && typeof r === 'object' && Array.isArray((r as any).items)) {
    return (r as any).items as T[];
  }
  return [];
}

/* ===================== wrappers ===================== */

export async function getUnanswered(): Promise<UnansweredItem[]> {
  const r = await postJSON('getUnanswered');
  return arr<UnansweredItem>(r);
}

export async function getDrafts(): Promise<DraftItem[]> {
  const r = await postJSON('getDrafts');
  return arr<DraftItem>(r);
}

export async function getDetail(row: number): Promise<Detail> {
  const r = await postJSON<Detail>('getDetail', { row });
  return (r as any).entry ?? (r as any);
}

export async function saveAnswer(row: number, answer: string, url: string): Promise<boolean> {
  const r = await postJSON('saveAnswer', { row, answer, url });
  return r === true || (r as any)?.ok === true;
}

export async function completeFromWeb(row: number): Promise<boolean> {
  const r = await postJSON('completeFromWeb', { row });
  return r === true || (r as any)?.ok === true;
}

export async function noChangeFromWeb(row: number): Promise<boolean> {
  const r = await postJSON('noChangeFromWeb', { row });
  return r === true || (r as any)?.ok === true;
}

export async function getHistoryList(): Promise<HistoryItem[]> {
  const r = await postJSON('getHistoryList');
  return arr<HistoryItem>(r);
}

export async function getHistoryDetail(row: number): Promise<HistoryDetail> {
  const r = await postJSON<HistoryDetail>('getHistoryDetail', { row });
  return (r as any).entry ?? (r as any);
}

export async function getAllTopicOptionsPinnedFirst(): Promise<string[]> {
  const r = await postJSON('getAllTopicOptionsPinnedFirst');
  if (Array.isArray(r)) return r as string[];
  return ((r as any)?.items as string[]) || [];
}

export async function getUpdateData(opt: {
  q?: string;
  topicKey?: string;
  topics?: string[];
  area?: string;
  limit?: number;
  offset?: number;
  pinnedFirst?: boolean;
}): Promise<UpdateItem[]> {
  const r = await postJSON('getUpdateData', opt);
  return arr<UpdateItem>(r);
}

export async function saveUpdateRow(
  row: number,
  payload: { answer: string; url: string }
): Promise<boolean> {
  const r = await postJSON('saveUpdateRow', { row, payload });
  return r === true || (r as any)?.ok === true;
}

export async function syncToMiibo(): Promise<boolean> {
  const r = await postJSON('syncToMiibo');
  return r === true || (r as any)?.ok === true;
}

export async function bulkCompleteDrafts(
  opt?: { dryRun?: boolean; limit?: number }
): Promise<BulkDryResult | BulkRunResult> {
  const r = await postJSON('bulkCompleteDrafts', opt || {});
  return r as any;
}

export async function predictAnswerForRow(row: number): Promise<PredictResult> {
  const r = await postJSON<PredictResult>('predictAnswerForRow', { row });
  return (r as any).result ?? (r as any);
}
