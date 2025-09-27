// src/send.ts
import { getAll as outboxList, remove as outboxRemove, OutboxItem, markBackoff, update } from './lib/outbox';
import { completeFromWeb, noChangeFromWeb } from './api/gas';

let sending = false;

/**
 * Outbox を順次送信する。
 * - 成功したものだけ削除
 * - 失敗したらその場で中断（ユーザーにわかりやすい）
 * - ネットワーク系失敗は backoff（次回以降に再挑戦）
 * 返り値: { processed, errors }
 */
export async function processOutbox(): Promise<{ processed: number; errors: number }> {
  if (sending) return { processed: 0, errors: 0 };
  sending = true;

  let processed = 0;
  let errors = 0;

  try {
    const ops = await outboxList();

    for (const op of ops) {
      try {
        // ※ Step 8 で idempotencyKey / rowHash を付与するが、
        //   現状 API は (row) のみなのでそのまま呼ぶ
        if (op.type === 'COMPLETE') {
          const ok = await completeFromWeb(op.row);
          if (!ok) throw new Error('completeFromWeb returned false');
        } else if (op.type === 'NOCHANGE') {
          const ok = await noChangeFromWeb(op.row);
          if (!ok) throw new Error('noChangeFromWeb returned false');
        } else {
          // 型拡張時の安全弁
          throw new Error(`unknown op.type: ${(op as OutboxItem).type}`);
        }

        // 成功：削除
        await outboxRemove(op.id);
        processed += 1;
      } catch (e: any) {
        errors += 1;

        // 409系（Step 8 実装後想定）や恒久的失敗は中断＆そのまま残す。
        // ネットワークなど一時的失敗は backoff して次回以降に再挑戦。
        const msg = String(e?.message || e);

        // ヒューリスティック：409 / 4xx は中断（ユーザー確認が必要）
        if (msg.includes('409') || msg.includes('4')) {
          // いったん中断
          break;
        }

        // 一時的な失敗は backoff
        await markBackoff(op.id);

        // 1件でも失敗したら中断（ユーザー操作で再実行してもらう）
        break;
      }
    }
  } finally {
    sending = false;
  }

  return { processed, errors };
}
