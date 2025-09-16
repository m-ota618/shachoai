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

/** 相関IDの生成（ブラウザの crypto.randomUUID が無い環境に備えてフォールバック） */
function newTraceId(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyCrypto = (globalThis as any).crypto;
    if (anyCrypto?.randomUUID) return anyCrypto.randomUUID();
  } catch { /* noop */ }
  return `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

/** テナントIDの取得（管理者のみ意味あり）。UIが選択した値を localStorage に保存しておく想定 */
function getTenantIdFromStorage(): string | undefined {
  try {
    const v = localStorage.getItem('tenantId');
    return v && v.trim() ? v.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** 構造化APIエラー（UI側で traceId を表示できるようにする） */
export class ApiError extends Error {
  code?: string;
  status?: number;
  traceId?: string;
  raw?: string;
  constructor(message: string, opts?: { code?: string; status?: number; traceId?: string; raw?: string }) {
    super(message);
    this.name = 'ApiError';
    this.code = opts?.code;
    this.status = opts?.status;
    this.traceId = opts?.traceId;
    this.raw = opts?.raw;
  }
}

/** /api/gas に JSON POST（必ず Authorization: Bearer を付与） */
async function postJSON<T = unknown>(
  action: string,
  payload?: unknown,
  opt?: { tenantId?: string } // 管理者は明示指定可。未指定なら localStorage の tenantId を使う
): Promise<T> {
  // Supabase セッションからアクセストークン取得
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  // 相関ID（クライアント生成）を付与
  const traceId = newTraceId();

  // テナントID（任意）
  const tenantId = opt?.tenantId ?? getTenantIdFromStorage();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Trace-Id': traceId,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenantId) headers['X-Tenant-Id'] = tenantId;

  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, payload }),
  });

  // サーバ側で再発行された相関ID（存在しなければクライアント側のを使う）
  const respTraceId = res.headers.get('X-Trace-Id') ?? traceId;
  const contentType = res.headers.get('Content-Type') ?? '';

  const text = await res.text();

  // エラー系は構造化して throw。UI で traceId を表示できる。
  if (!res.ok) {
    let code: string | undefined;
    try {
      if (contentType.includes('application/json')) {
        const j = JSON.parse(text);
        code = j?.error ?? undefined;
      }
    } catch { /* ignore */ }

    const msg = code
      ? `APIエラー: ${code}（X-Trace-Id: ${respTraceId}）`
      : `APIエラー（HTTP ${res.status} / X-Trace-Id: ${respTraceId})`;

    throw new ApiError(msg, {
      code,
      status: res.status,
      traceId: respTraceId,
      raw: text,
    });
  }

  // 正常系：JSON or プレーンテキストを返す（GASが文字列/真偽値を返す場合に対応）
  try {
    if (contentType.includes('application/json')) {
      return JSON.parse(text) as T;
    }
  } catch {
    // 下で text を返す
  }
    
  return (text as unknown) as T;
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
