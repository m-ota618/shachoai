// src/utils/isApiError.ts
import { ApiError } from '../api/gas';

export function isApiError(e: unknown): e is ApiError {
  if (!(e instanceof Error)) return false;
  // name が 'ApiError' であることを確認（プロパティアクセスは安全に）
  const maybeName = (e as { name?: unknown }).name;
  return typeof maybeName === 'string' && maybeName === 'ApiError';
}

export function formatApiError(e: ApiError, label?: string): string {
  const head = label ? `${label}: ` : '';
  const base = e.code ?? e.message ?? 'APIエラー';
  const trace = e.traceId ? `（X-Trace-Id: ${e.traceId}）` : '';
  return `${head}${base}${trace}`;
}
