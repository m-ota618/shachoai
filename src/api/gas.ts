// src/api/gas.ts
// フロントは /api/gas（Vercel Functions）に JSON で投げるだけ。
// 秘密（GAS_ENDPOINT / API_TOKEN）は関数側で保持・付与します。

import { supabase } from '../lib/supabase'
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
} from '../types'

// フロント側に残して良いのは経路だけ
const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'

/**
 * Functions（/api/gas）に action/payload を JSON で投げる
 * - Authorization: Bearer <supabase access token> を必ず付与
 * - 関数側で GAS に x-www-form-urlencoded 変換 + token 付与
 */
async function postForm<T = unknown>(action: string, payload?: unknown): Promise<T> {
  // サインイン済みならアクセストークンを取得
  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  const res = await fetch(`${API_BASE}/gas`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, payload }),
  })

  const text = await res.text().catch(() => '')
  if (!res.ok) {
    // 関数側の代表的なエラーを見やすく
    // missing_bearer / unauthorized / forbidden_origin / forbidden_domain / missing_env: ...
    throw new Error(text || `HTTP ${res.status}`)
  }

  try {
    return JSON.parse(text) as T // JSONならパース
  } catch {
    // true/falseや文字列などもそのまま返せるように
    return text as unknown as T
  }
}

function arr<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[]
  if (r && typeof r === 'object' && Array.isArray((r as any).items)) {
    return (r as any).items as T[]
  }
  return []
}

/* ===================== wrappers ===================== */

export const getUnanswered = async (): Promise<UnansweredItem[]> =>
  arr<UnansweredItem>(await postForm('getUnanswered'))

export const getDrafts = async (): Promise<DraftItem[]> =>
  arr<DraftItem>(await postForm('getDrafts'))

export const getDetail = async (row: number): Promise<Detail> => {
  const r = await postForm<Detail>('getDetail', { row })
  return (r as any).entry ?? (r as any)
}

export const saveAnswer = async (row: number, answer: string, url: string): Promise<boolean> => {
  const r = await postForm('saveAnswer', { row, answer, url })
  return r === true || (r as any)?.ok === true
}

export const completeFromWeb = async (row: number): Promise<boolean> => {
  const r = await postForm('completeFromWeb', { row })
  return r === true || (r as any)?.ok === true
}

export const noChangeFromWeb = async (row: number): Promise<boolean> => {
  const r = await postForm('noChangeFromWeb', { row })
  return r === true || (r as any)?.ok === true
}

export const getHistoryList = async (): Promise<HistoryItem[]> =>
  arr<HistoryItem>(await postForm('getHistoryList'))

export const getHistoryDetail = async (row: number): Promise<HistoryDetail> => {
  const r = await postForm<HistoryDetail>('getHistoryDetail', { row })
  return (r as any).entry ?? (r as any)
}

export const getAllTopicOptionsPinnedFirst = async (): Promise<string[]> => {
  const r = await postForm('getAllTopicOptionsPinnedFirst')
  if (Array.isArray(r)) return r as string[]
  return ((r as any)?.items as string[]) || []
}

export const getUpdateData = async (opt: {
  q?: string
  topicKey?: string
  topics?: string[]
  area?: string
  limit?: number
  offset?: number
  pinnedFirst?: boolean
}): Promise<UpdateItem[]> => arr<UpdateItem>(await postForm('getUpdateData', opt))

export const saveUpdateRow = async (
  row: number,
  payload: { answer: string; url: string }
): Promise<boolean> => {
  const r = await postForm('saveUpdateRow', { row, payload })
  return r === true || (r as any)?.ok === true
}

export const syncToMiibo = async (): Promise<boolean> => {
  const r = await postForm('syncToMiibo')
  return r === true || (r as any)?.ok === true
}

export const bulkCompleteDrafts = async (
  opt?: { dryRun?: boolean; limit?: number }
): Promise<BulkDryResult | BulkRunResult> =>
  (await postForm('bulkCompleteDrafts', opt || {})) as any

export const predictAnswerForRow = async (row: number): Promise<PredictResult> => {
  const r = await postForm<PredictResult>('predictAnswerForRow', { row })
  return (r as any).result ?? (r as any)
}
