// src/api/gas.ts
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

const USE_PROXY = import.meta.env.VITE_USE_PROXY === 'true';
const API_BASE  = (import.meta.env.VITE_API_BASE as string) || '/api';
const ENDPOINT  = (import.meta.env.VITE_GAS_ENDPOINT as string) || '';
const TOKEN     = (import.meta.env.VITE_API_TOKEN as string) || '';

function resolveEndpoint(): string {
  if (USE_PROXY) return API_BASE; // dev: /api（Vite が GAS へ中継）
  if (ENDPOINT.startsWith('http')) return ENDPOINT; // prod: 直叩き
  throw new Error('GASエンドポイントが解決できません（VITE_USE_PROXY か VITE_GAS_ENDPOINT を確認）');
}

/** GAS（doPost）に x-www-form-urlencoded で action と payload(JSON) を送る */
async function postForm<T = unknown>(action: string, payload?: unknown): Promise<T> {
  const url = resolveEndpoint();

  const params = new URLSearchParams();
  params.set('action', action);
  if (TOKEN) params.set('token', TOKEN);
  if (payload !== undefined) {
    params.set('payload', typeof payload === 'string' ? payload : JSON.stringify(payload));
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: params.toString(),
  });

  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`GAS ${res.status}: ${text}`);

  try {
    return JSON.parse(text) as T; // JSON
  } catch {
    return text as unknown as T; // 文字列/boolean など
  }
}

function arr<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && typeof r === 'object' && Array.isArray((r as any).items)) return (r as any).items as T[];
  return [];
}

/* ===================== wrappers ===================== */

export const getUnanswered = async (): Promise<UnansweredItem[]> =>
  arr<UnansweredItem>(await postForm('getUnanswered'));

export const getDrafts = async (): Promise<DraftItem[]> =>
  arr<DraftItem>(await postForm('getDrafts'));

export const getDetail = async (row: number): Promise<Detail> => {
  const r = await postForm<Detail>('getDetail', { row });
  return (r as any).entry ?? (r as any);
};

export const saveAnswer = async (row: number, answer: string, url: string): Promise<boolean> => {
  const r = await postForm('saveAnswer', { row, answer, url });
  return r === true || (r as any)?.ok === true;
};

export const completeFromWeb = async (row: number): Promise<boolean> => {
  const r = await postForm('completeFromWeb', { row });
  return r === true || (r as any)?.ok === true;
};

export const noChangeFromWeb = async (row: number): Promise<boolean> => {
  const r = await postForm('noChangeFromWeb', { row });
  return r === true || (r as any)?.ok === true;
};

export const getHistoryList = async (): Promise<HistoryItem[]> =>
  arr<HistoryItem>(await postForm('getHistoryList'));

export const getHistoryDetail = async (row: number): Promise<HistoryDetail> => {
  const r = await postForm<HistoryDetail>('getHistoryDetail', { row });
  return (r as any).entry ?? (r as any);
};

export const getAllTopicOptionsPinnedFirst = async (): Promise<string[]> => {
  const r = await postForm('getAllTopicOptionsPinnedFirst');
  return Array.isArray(r) ? (r as string[]) : ((r as any)?.items as string[]) || [];
};

export const getUpdateData = async (opt: {
  q?: string;
  topicKey?: string;
  topics?: string[];
  area?: string;
  limit?: number;
  offset?: number;
  pinnedFirst?: boolean;
}): Promise<UpdateItem[]> => arr<UpdateItem>(await postForm('getUpdateData', opt));

export const saveUpdateRow = async (
  row: number,
  payload: { answer: string; url: string }
): Promise<boolean> => {
  const r = await postForm('saveUpdateRow', { row, payload });
  return r === true || (r as any)?.ok === true;
};

export const syncToMiibo = async (): Promise<boolean> => {
  const r = await postForm('syncToMiibo');
  return r === true || (r as any)?.ok === true;
};

export const bulkCompleteDrafts = async (
  opt?: { dryRun?: boolean; limit?: number }
): Promise<BulkDryResult | BulkRunResult> =>
  (await postForm('bulkCompleteDrafts', opt || {})) as any;

export const predictAnswerForRow = async (row: number): Promise<PredictResult> => {
  const r = await postForm<PredictResult>('predictAnswerForRow', { row });
  return (r as any).result ?? (r as any);
};
