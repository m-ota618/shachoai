// src/lib/sender.ts
import { completeFromWeb, noChangeFromWeb } from "../api/gas";
import { getReady, remove, markBackoff, OutboxItem } from "./outbox";


async function sendOne(op: OutboxItem): Promise<boolean> {
  if (op.type === "COMPLETE") {
    const ok = await completeFromWeb(op.row);
    return !!ok;
  } else if (op.type === "NOCHANGE") {
    const ok = await noChangeFromWeb(op.row);
    return !!ok;
  }
  return false;
}

/** 手動送信：準備できている分だけを試行 */
export async function sendAllReady(): Promise<{
  sent: number;
  failed: number;
}> {
  let sent = 0;
  let failed = 0;
  const targets = await getReady();
  for (const op of targets) {
    try {
      const ok = await sendOne(op);
      if (ok) {
        await remove(op.id);
        sent++;
      } else {
        await markBackoff(op.id);
        failed++;
      }
    } catch {
      await markBackoff(op.id);
      failed++;
    }
  }
  return { sent, failed };
}
