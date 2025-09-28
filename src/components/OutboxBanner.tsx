// src/components/OutboxBanner.tsx
import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeOutbox, getAll as getOutboxAll } from '../lib/outbox';
import { processOutbox } from '../send';

export default function OutboxBanner() {
  const qc = useQueryClient();
  const [count, setCount] = React.useState<number>(0);
  const [sending, setSending] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string>('');

  // 件数の初期読み込み + サブスクライブ（items をそのまま反映）
  React.useEffect(() => {
    let mounted = true;

    const init = async () => {
      const items = await getOutboxAll();
      if (mounted) setCount(items.length);
    };
    init();

    const unsub = subscribeOutbox((items) => {
      if (mounted) setCount(items.length); // ✅ 通知のたびに件数を即反映
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  if (count === 0) return null;

  const onSend = async () => {
    setSending(true);
    setError('');
    try {
      const { processed, errors, remaining } = await processOutbox();

      // ✅ 送信後の残件数をそのまま反映（これで確実に 0 → 非表示）
      setCount(remaining);

      // 一覧の整合（成功があれば最小限 invalidate）
      if (processed > 0) {
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['unans'] }),
          qc.invalidateQueries({ queryKey: ['drafts'] }),
          qc.invalidateQueries({ queryKey: ['history'] }),
        ]);
      }

      if (errors > 0) {
        setError('一部の送信に失敗しました。あとで再度お試しください。');
      }
    } catch {
      setError('送信中にエラーが発生しました。');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="outbox-banner" role="region" aria-live="polite">
      <div className="row" style={{ alignItems: 'center', gap: 8 }}>
        <span className="badge">{count} 件保留中</span>
        <span>未送信の更新があります。</span>
        <button className="btn btn-primary" onClick={onSend} disabled={sending} style={{ marginLeft: 'auto' }}>
          {sending ? '送信中…' : '今すぐ送信'}
        </button>
      </div>
      {error && <div className="help" style={{ marginTop: 6 }}>{error}</div>}
    </div>
  );
}
