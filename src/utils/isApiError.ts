// src/utils/isApiError.ts
import { ApiError } from '../api/gas';

export function isApiError(e: unknown): e is ApiError {
  return e instanceof Error && (e as any).name === 'ApiError';
}

export function formatApiError(e: ApiError, label?: string): string {
  const head = label ? `${label}: ` : '';
  const base = e.code ?? e.message ?? 'APIエラー';
  const trace = e.traceId ? `（X-Trace-Id: ${e.traceId}）` : '';
  return `${head}${base}${trace}`;
}
