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

/** フロント→サーバレス関数の基底URLを正規化（未設定なら /api） */
function normalizeBase(v?: string): string {
  const raw = (v ?? "").trim();
  if (!raw) return "/api";
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, "");
  const withLeading = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeading.replace(/\/+$/, "");
}

const API_BASE = normalizeBase(import.meta.env.VITE_API_BASE as string);
const GAS_URL = `${API_BASE}/gas`;

/** 相関IDの生成 */
function newTraceId(): string {
  try {
    const anyCrypto = (globalThis as { crypto?: { randomUUID?: () => string } });
    if (anyCrypto.crypto?.randomUUID) return anyCrypto.crypto.randomUUID();
  } catch {/* noop */}
  return `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

/** 管理用テナントID（任意） */
function getTenantIdFromStorage(): string | undefined {
  try {
    const v = localStorage.getItem('tenantId');
    return v && v.trim() ? v.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** いまのURLから slug を取る（/okura/... → okura） */
function currentSlug(): string | undefined {
  try {
    const seg = (location.pathname || '/').split('/').filter(Boolean)[0];
    return seg ? seg.toLowerCase() : undefined;
  } catch { return undefined; }
}

/** 構造化APIエラー */
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

/* === 追加: 送信オプション型（冪等キーなどを渡す） === */
export type SendOptions = {
  idempotencyKey?: string; // 冪等化用キー（GAS 側へそのまま送る）
  rowHash?: string;        // 競合検出したい場合に利用（任意）
};

async function postJSON<T = unknown>(
  action: string,
  payload?: unknown,
  opt?: { tenantId?: string }
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const traceId = newTraceId();
  const tenantId = opt?.tenantId ?? getTenantIdFromStorage();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Trace-Id': traceId,
  };

  // ★ 追加：URL 先頭の slug をサーバへ渡す（安定テナント解決）
  const slug = currentSlug();
  if (slug) headers['X-Tenant-Slug'] = slug;

  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenantId) headers['X-Tenant-Id'] = tenantId; // 任意：冗長ヒント

  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, payload }),
  });

  const respTraceId = res.headers.get('X-Trace-Id') ?? traceId;
  const contentType = res.headers.get('Content-Type') ?? '';
  const text = await res.text();

  if (!res.ok) {
    let code: string | undefined;
    try {
      if (contentType.toLowerCase().includes('application/json')) {
        const j = JSON.parse(text) as { error?: string; traceId?: string };
        code = j?.error ?? undefined;
      }
    } catch {/* ignore */}
    const msg = code
      ? `APIエラー: ${code}（X-Trace-Id: ${respTraceId}）`
      : `APIエラー（HTTP ${res.status} / X-Trace-Id: ${respTraceId})`;
    throw new ApiError(msg, { code, status: res.status, traceId: respTraceId, raw: text });
  }

  try {
    if (contentType.toLowerCase().includes('application/json')) {
      return JSON.parse(text) as T;
    }
  } catch {/* noop */}
  return (text as unknown) as T;
}

function arr<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && typeof r === 'object' && Array.isArray((r as { items?: T[] }).items)) {
    return (r as { items: T[] }).items;
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
  return (r as { entry?: Detail }).entry ?? (r as Detail);
}
export async function saveAnswer(row: number, answer: string, url: string): Promise<boolean> {
  const r = await postJSON('saveAnswer', { row, answer, url });
  return r === true || (r as { ok?: boolean })?.ok === true;
}

/* === 変更: 第2引数 opt を追加し、payload にマージ === */
export async function completeFromWeb(row: number, opt: SendOptions = {}): Promise<boolean> {
  const r = await postJSON('completeFromWeb', { row, ...opt });
  return r === true || (r as { ok?: boolean })?.ok === true;
}

export async function noChangeFromWeb(row: number, opt: SendOptions = {}): Promise<boolean> {
  const r = await postJSON('noChangeFromWeb', { row, ...opt });
  return r === true || (r as { ok?: boolean })?.ok === true;
}

export async function getHistoryList(): Promise<HistoryItem[]> {
  const r = await postJSON('getHistoryList');
  return arr<HistoryItem>(r);
}
export async function getHistoryDetail(row: number): Promise<HistoryDetail> {
  const r = await postJSON<HistoryDetail>('getHistoryDetail', { row });
  return (r as { entry?: HistoryDetail }).entry ?? (r as HistoryDetail);
}
export async function getAllTopicOptionsPinnedFirst(): Promise<string[]> {
  const r = await postJSON('getAllTopicOptionsPinnedFirst');
  if (Array.isArray(r)) return r as string[];
  return ((r as { items?: string[] })?.items) || [];
}
export async function getUpdateData(opt: {
  q?: string; topicKey?: string; topics?: string[]; area?: string;
  limit?: number; offset?: number; pinnedFirst?: boolean;
}): Promise<UpdateItem[]> {
  const r = await postJSON('getUpdateData', opt);
  return arr<UpdateItem>(r);
}
export async function saveUpdateRow(row: number, payload: { answer: string; url: string }): Promise<boolean> {
  const r = await postJSON('saveUpdateRow', { row, payload });
  return r === true || (r as { ok?: boolean })?.ok === true;
}
export async function syncToMiibo(): Promise<boolean> {
  const r = await postJSON('syncToMiibo');
  return r === true || (r as { ok?: boolean })?.ok === true;
}
export async function bulkCompleteDrafts(opt?: { dryRun?: boolean; limit?: number }): Promise<BulkDryResult | BulkRunResult> {
  const r = await postJSON('bulkCompleteDrafts', opt || {});
  return r as BulkDryResult | BulkRunResult;
}
export async function predictAnswerForRow(row: number): Promise<PredictResult> {
  const r = await postJSON<PredictResult>('predictAnswerForRow', { row });
  return (r as { result?: PredictResult }).result ?? (r as PredictResult);
}
