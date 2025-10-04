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

// ---- in-memory subscribers（今後使わなくても残してOK） ----
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

/** 既存キューに同一(row,type)がいれば payload を上書き＆前倒し。なければ追加。 */
export async function enqueue(
  op: Omit<OutboxItem, "id" | "tryCount" | "nextAt" | "createdAt">
) {
  const items = await getAll();

  const idx = items.findIndex((x) => x.row === op.row && x.type === op.type);
  if (idx >= 0) {
    // デデュープ：payloadは上書き、nextAt前倒し
    const cur = items[idx];
    items[idx] = {
      ...cur,
      payload: { ...(cur.payload || {}), ...(op as any).payload },
      nextAt: nowMs(),
    };
    await setAll(items);
  } else {
    const item: OutboxItem = {
      ...op,
      id: uuid(),
      tryCount: 0,
      nextAt: nowMs(),
      createdAt: nowMs(),
    };
    items.push(item);
    await setAll(items);
  }

  // 追加/更新したらすぐに非同期で送信キック（awaitしない）
  void kick();
}

/** 互換エイリアス（既存コードの push 呼び出しに対応） */
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

/** 実際の送信処理（1回分） */
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
        const ok = await completeFromWeb(it.row); // GAS側はconfirm:true実装済みであること
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

  // 通知（購読者がいれば更新される／今はバナー非表示でも問題なし）
  await notify();

  return {
    processed: ready.length,
    succeeded,
    failed,
  };
}

/** 即時キック（awaitしないで投げる用） */
async function kick() {
  if (!navigator.onLine) return;
  try { await submitReady(); } catch {}
}

/** 自動送信ワーカー（単一起動ガードつき） */
export function startOutboxWorker(opts?: {
  intervalMs?: number;           // 既定 5000ms
  runWhenHidden?: boolean;       // 既定 false（タブ非表示時はサボる）
}) {
  if (typeof window === "undefined") return;
  const g: any = window as any;
  if (g.__planterOutboxWorker) return; // 二重起動防止

  const intervalMs = Math.max(1000, opts?.intervalMs ?? 5000);
  const runWhenHidden = !!opts?.runWhenHidden;

  const shouldRun = () =>
    navigator.onLine &&
    (runWhenHidden || document.visibilityState === "visible");

  const tick = async () => {
    if (!shouldRun()) return;
    try { await submitReady(); } catch {}
  };

  const id = window.setInterval(tick, intervalMs);

  // 画面復帰/オンライン復帰で即実行
  const onVis = () => { void tick(); };
  const onOnline = () => { void tick(); };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("online", onOnline);

  // すぐ一発
  void tick();

  g.__planterOutboxWorker = {
    stop() {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
      g.__planterOutboxWorker = null;
    }
  };
}

/** 便利関数：このrow・typeが送信待ちにいるか */
export async function hasPending(row: number, type?: OpType) {
  const items = await getAll();
  return items.some((x) => x.row === row && (!type || x.type === type));
}
