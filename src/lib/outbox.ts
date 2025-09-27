// src/lib/outbox.ts
import { createStore, get, set } from "idb-keyval";
import { completeFromWeb, noChangeFromWeb } from "../api/gas";

export type OpType = "COMPLETE" | "NOCHANGE";

export type OutboxItem = {
  id: string;
  type: OpType;
  row: number;
  payload?: { answer?: string; url?: string };
  tryCount: number;
  nextAt: number;         // 次回試行時刻(ms)
  createdAt: number;
};

const STORE_NAME = "planter-idb";
const KEY_OUTBOX = "outbox/v1";
const store = createStore(STORE_NAME, "kv");

// ---- in-memory subscribers（簡易イベント） ----
type Listener = (items: OutboxItem[]) => void;
const listeners = new Set<Listener>();
const notify = async () => {
  const items = await getAll();
  listeners.forEach((fn) => {
    try { fn(items); } catch {}
  });
};

export const subscribeOutbox = (fn: Listener) => {
  listeners.add(fn);
  // 初期状態を即時通知しておくとバナーが一発で反映される
  (async () => { try { fn(await getAll()); } catch {} })();
  return () => listeners.delete(fn);
};

// ---- 基本CRUD ----
export async function getAll(): Promise<OutboxItem[]> {
  const v = (await get(KEY_OUTBOX, store)) as OutboxItem[] | undefined;
  return Array.isArray(v) ? v : [];
}

export async function setAll(items: OutboxItem[]) {
  await set(KEY_OUTBOX, items, store);
  await notify();
}

export function uuid(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export function nowMs() {
  return Date.now();
}

export async function enqueue(
  op: Omit<OutboxItem, "id" | "tryCount" | "nextAt" | "createdAt">
) {
  const items = await getAll();
  const item: OutboxItem = {
    ...op,
    id: uuid(),
    tryCount: 0,
    nextAt: nowMs(),
    createdAt: nowMs(),
  };
  items.push(item);
  await setAll(items);
  return item.id;
}

// 互換エイリアス（既存コードの push 呼び出しに対応）
export const push = enqueue;

export async function remove(id: string) {
  const items = await getAll();
  const next = items.filter((x) => x.id !== id);
  await setAll(next);
}

export async function update(id: string, mut: (x: OutboxItem) => OutboxItem) {
  const items = await getAll();
  const idx = items.findIndex((x) => x.id === id);
  if (idx >= 0) {
    items[idx] = mut(items[idx]);
    await setAll(items);
  }
}

export async function clearAll() {
  await set(KEY_OUTBOX, [], store);
  await notify();
}

export async function markBackoff(id: string) {
  await update(id, (x) => {
    const n = x.tryCount + 1;
    const ms = n <= 5 ? 2 ** (n - 1) * 1000 : 60 * (n - 4) * 1000; // 1,2,4,8,16,60,120...
    const nextAt = Math.min(nowMs() + ms, nowMs() + 5 * 60 * 1000);
    return { ...x, tryCount: n, nextAt };
  });
}

/** 送信対象（nextAt <= now）だけ返す */
export async function getReady(): Promise<OutboxItem[]> {
  const items = await getAll();
  const t = nowMs();
  return items.filter((x) => x.nextAt <= t);
}

/**
 * submitReady: 期限到来分だけ“今すぐ送信”
 * - 成功: outbox から remove
 * - 失敗: markBackoff（指数バックオフ）, 残す
 * - 戻り値は UI バナー用の集計
 */
export async function submitReady(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const ready = await getReady();
  let succeeded = 0;
  let failed = 0;

  for (const it of ready) {
    try {
      if (it.type === "COMPLETE") {
        const ok = await completeFromWeb(it.row);
        if (!ok) throw new Error("completeFromWeb returned false");
      } else if (it.type === "NOCHANGE") {
        const ok = await noChangeFromWeb(it.row);
        if (!ok) throw new Error("noChangeFromWeb returned false");
      } else {
        throw new Error("unknown op type");
      }
      succeeded += 1;
      await remove(it.id);
    } catch {
      failed += 1;
      await markBackoff(it.id);
    }
  }

  // 購読者更新
  await notify();

  return {
    processed: ready.length,
    succeeded,
    failed,
  };
}
