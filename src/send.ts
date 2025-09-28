// src/send.ts
import { getAll as outboxList, remove as outboxRemove, OutboxItem, markBackoff } from './lib/outbox';
import { completeFromWeb, noChangeFromWeb } from './api/gas';

let sending = false;

/**
 * Outbox を順次送信する。
 * 成功したものだけ削除。一件でも失敗したら中断（ユーザーが再送しやすい）。
 * 戻り値: { processed, errors, remaining }
 */
export async function processOutbox(): Promise<{ processed: number; errors: number; remaining: number }> {
  if (sending) return { processed: 0, errors: 0, remaining: (await outboxList()).length };
  sending = true;

  let processed = 0;
  let errors = 0;

  try {
    const ops = await outboxList();

    for (const op of ops) {
      try {
        if (op.type === 'COMPLETE') {
          const ok = await completeFromWeb(op.row);
          if (!ok) throw new Error('completeFromWeb returned false');
        } else if (op.type === 'NOCHANGE') {
          const ok = await noChangeFromWeb(op.row);
          if (!ok) throw new Error('noChangeFromWeb returned false');
        } else {
          throw new Error(`unknown op.type: ${(op as OutboxItem).type}`);
        }

        await outboxRemove(op.id);   // ✅ 成功したら即削除
        processed += 1;
      } catch (e: any) {
        errors += 1;

        const msg = String(e?.message || e);
        // 恒久的失敗（409 など）想定時は中断してユーザーに明示
        if (msg.includes('409') || /^4\d\d/.test(msg)) {
          break;
        }
        // 一時的失敗は backoff（次回以降に）
        await markBackoff(op.id);
        break;
      }
    }
  } finally {
    sending = false;
  }

  const remaining = (await outboxList()).length; // ✅ 送信後の残件数を返す
  return { processed, errors, remaining };
}
