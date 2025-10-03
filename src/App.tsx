// src/App.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  getUnanswered,
  getDrafts,
  getDetail,
  saveAnswer,
  getHistoryList,
  getHistoryDetail,
  getAllTopicOptionsPinnedFirst,
  getUpdateData,
  saveUpdateRow,
  deleteQaRow ,
  syncToMiibo,
  bulkCompleteDrafts,
  predictAnswerForRow
} from './api/gas';
import type {
  UnansweredItem,
  DraftItem,
  HistoryItem,
  Detail as DetailT,
  HistoryDetail as HistoryDetailT,
  UpdateItem,
  PredictResult
} from './types';
import { showApiError } from './utils/error';
import OutboxBanner from './components/OutboxBanner';
import VoiceComposeBar from './components/VoiceComposeBar';


/* === TanStack Query === */
import { useQuery, useQueryClient } from '@tanstack/react-query';


/* === Outbox（IndexedDB） === */
import { push as pushOutbox } from './lib/outbox';

type Tab = 'unans' | 'drafts' | 'history' | 'update' | 'sync';

/* =========================
   安全な onIdle ヘルパー
   ========================= */
type IdleHandle = { cancel: () => void };
const onIdle = (fn: () => void): IdleHandle => {
  let cancelled = false;
  const call = () => { if (!cancelled) fn(); };

  const ric: any =
    typeof window !== 'undefined' && (window as any).requestIdleCallback
      ? (window as any).requestIdleCallback
      : null;
  const cic: any =
    typeof window !== 'undefined' && (window as any).cancelIdleCallback
      ? (window as any).cancelIdleCallback
      : null;

  if (typeof ric === 'function') {
    const id = ric(call, { timeout: 1200 });
    return { cancel: () => { cancelled = true; if (typeof cic === 'function') cic(id); } };
  } else {
    const id = window.setTimeout(call, 300);
    return { cancel: () => { cancelled = true; window.clearTimeout(id); } };
  }
};

const hueFor = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};
const badgeStyle = (topic: string) => {
  const h = hueFor(topic || '');
  return {
    background: `hsl(${h}, 90%, 95%)`,
    color: `hsl(${h}, 45%, 28%)`,
    border: `1px solid hsla(${h},45%,28%,.18)`
  } as React.CSSProperties;
};

/** URLエディタ：配列で編集し、親には改行区切りで返す */
function UrlListEditor(props: {
  value?: string;
  onChange: (joined: string) => void;
  collapsedByDefault?: boolean;
  label?: string;
  help?: string;
}) {
  const { value, onChange, collapsedByDefault, label = '参照URL', help = '1行に1URL（表示用）' } = props;
  const toArray = (v?: string) =>
    (v || '')
      .split('\n')
      .map(s => s.trim())
      .filter((s, _i, a) => s.length > 0 || a.length === 0); // 空配列は避ける

  const [urls, setUrls] = React.useState<string[]>(toArray(value));
  const [expanded, setExpanded] = React.useState<boolean>(
    (value && value.trim().length > 0) || !collapsedByDefault ? true : false
  );

  React.useEffect(() => {
    setUrls(toArray(value));
    if ((value && value.trim()) || !collapsedByDefault) setExpanded(true);
  }, [value, collapsedByDefault]);

  const commit = (arr: string[]) => {
    setUrls(arr);
    onChange(arr.join('\n'));
  };

  if (!expanded) {
    return (
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setExpanded(true)}
          aria-label="参照URLを追加する"
        >
          参照URLを追加する
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div className="label">{label}（任意）</div>
      <div className="help" style={{ margin: '0 0 6px' }}>{help}</div>

      {urls.map((u, i) => (
        <div key={i} className="row" style={{ gap: 6, marginBottom: 6, alignItems: 'center' }}>
          <input
            type="url"
            inputMode="url"
            placeholder={`https://example.com/page-${i + 1}`}
            value={u}
            onChange={(e) => {
              const next = [...urls];
              next[i] = e.target.value;
              commit(next);
            }}
            style={{ flex: '1 1 auto' }}
            aria-label={`参照URL ${i + 1}`}
          />
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              const next = urls.slice(0, i).concat(urls.slice(i + 1));
              commit(next.length ? next : ['']); // 最低1行は保持
            }}
            aria-label={`参照URL ${i + 1} を削除`}
          >
            削除
          </button>
        </div>
      ))}

      <div className="row" style={{ gap: 8, marginTop: 6 }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => commit([...urls, ''])}
          aria-label="参照URLを1行追加"
        >
          ＋ URLを追加
        </button>
        {urls.every(s => !s.trim()) && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              commit([]);
              setExpanded(false);
            }}
            aria-label="参照URL入力を閉じる"
          >
            入力を閉じる
          </button>
        )}
      </div>
    </div>
  );
}

/* =========================
   カードコンテナ（Ghost表示は廃止）
   ========================= */
const CardShell: React.FC<{ children?: React.ReactNode; }> = ({ children }) => {
  return <div className="card">{children}</div>;
};

export default function App() {
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>('unans');

  // ==== Sidebar (hamburger) ====
  const [navOpen, setNavOpen] = useState(false);
  const switchTab = (t: Tab) => {
    setTab(t);
    setNavOpen(false);
  };

  /* =========================
     未回答 / 下書き / 履歴 一覧（React Query）
     ========================= */
  const {
    data: unans = [],
    isLoading: unansLoading,
  } = useQuery<UnansweredItem[]>({
    queryKey: ['unans'],
    queryFn: getUnanswered,
    enabled: tab === 'unans', // アクティブな時だけ
    staleTime: 60_000,
  });

  const {
    data: drafts = [],
    isLoading: draftsLoading,
  } = useQuery<DraftItem[]>({
    queryKey: ['drafts'],
    queryFn: getDrafts,
    enabled: tab === 'drafts',
    staleTime: 60_000,
  });

  const {
    data: history = [],
    isLoading: historyLoading,
  } = useQuery<HistoryItem[]>({
    queryKey: ['history'],
    queryFn: getHistoryList,
    enabled: tab === 'history',
    staleTime: 60_000,
  });

  /* =========================
     詳細（未回答/下書き）
     ========================= */
  const [detail, setDetail] = useState<DetailT | null>(null);
  const [tabDetail, setTabDetail] = useState(false);

  // クリック時：キャッシュがあれば即表示→裏で先読み
  const openDetail = (() => {
    let clicking = false;
    return async (row: number) => {
      if (clicking) return;
      clicking = true;

      setTabDetail(true);
      setShowPred(false);
      setPred(null);

      const cached = queryClient.getQueryData<DetailT>(['detail', row]);
      setDetail(cached ?? null);

      try {
        await queryClient.prefetchQuery({
          queryKey: ['detail', row],
          queryFn: () => getDetail(row),
          staleTime: 5 * 60_000,
        });
        const fresh = queryClient.getQueryData<DetailT>(['detail', row]);
        setDetail(prev => (prev?.row === row || prev === null) ? (fresh ?? null) : prev);
      } catch (err) {
        if (!cached) setDetail(null);
        showApiError(err, '詳細取得エラー');
      }

      clicking = false;
    };
  })();

  // 履歴詳細（後で Query 化してOK）
  const [historyDetail, setHistoryDetail] = useState<HistoryDetailT | null>(null);
  const [tabHistoryDetail, setTabHistoryDetail] = useState(false);
  const openHistoryDetail = (() => {
    let inflight = false;
    return async (row: number) => {
      if (inflight) return; inflight = true;
      setTabHistoryDetail(true);
      setHistoryDetail(null);
      try {
        const r = await getHistoryDetail(row);
        setHistoryDetail(r);
      } catch (err: unknown) {
        showApiError(err, '履歴詳細エラー');
      } finally {
        inflight = false;
      }
    };
  })();

  /* =========================
     Update（検索・編集）
     ========================= */
  const [topicOptions, setTopicOptions] = useState<string[]>([]);
  const [updQuery, setUpdQuery] = useState('');
  const [updTopic, setUpdTopic] = useState('');
  const [updList, setUpdList] = useState<UpdateItem[] | null>(null);
  const [updCur, setUpdCur] = useState<UpdateItem | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  const openUpdateDetail = (it: UpdateItem) => {
    setUpdCur(it);
    try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch {}
  };
  const closeUpdateDetail = async (reload?: boolean) => {
    setUpdCur(null);
    if (reload) await loadUpdateList();
  };
  const handleDeleteUpdate = async () => {
    if (!updCur) return;
    const ok = confirm('このQ&Aを削除します。よろしいですか？\n（chatbotのナレッジからも削除されます）');
    if (!ok) return;

    setDelBusy(true);
    try {
      const res = await deleteQaRow(updCur.row); // /api/gas 統一版
      const miiboMsg = res?.miibo?.deleted ? '（miiboへ反映済）' : '';
      alert(`削除しました。${miiboMsg}`);

      // 一覧へ戻って再取得
      await closeUpdateDetail(true);

      // 関連キャッシュの無効化/掃除（念のため）
      queryClient.invalidateQueries({ queryKey: ['unans'] });
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
      queryClient.invalidateQueries({ queryKey: ['history'] });
      queryClient.removeQueries({ queryKey: ['detail', updCur.row], exact: true });
    } catch (e) {
      showApiError(e, '削除に失敗しました');
    } finally {
      setDelBusy(false);
    }
  };

  const initUpdateTab = async () => {
    setUpdList(null);
    if (!topicOptions.length) {
      try {
        const t = await getAllTopicOptionsPinnedFirst(); // Promise<string[]>
        setTopicOptions(Array.isArray(t) ? t : []);
      } catch (err: unknown) {
        console.warn(err);
      }
    }
    await loadUpdateList();
  };
  const loadUpdateList = async () => {
    setUpdList(null);
    try {
      const data = await getUpdateData({
        q: updQuery,
        topicKey: updTopic,
        limit: 300,
        pinnedFirst: true
      });
      setUpdList(data);
      setUpdCur(null);
    } catch (err: unknown) {
      setUpdList([]);
      showApiError(err, '更新データ取得エラー');
    }
  };

  // Sync
  const [syncMsg, setSyncMsg] = useState('');
  const runSync = async () => {
    setSyncMsg('同期を開始しています...（数十秒かかる場合があります）');
    try {
      const ok = await syncToMiibo();
      setSyncMsg(ok ? '同期が完了しました。' : '同期に失敗しました。');
    } catch (err: unknown) {
      setSyncMsg('同期エラー。詳細はアラートをご確認ください。');
      showApiError(err, '同期エラー');
    }
  };

  // Bulk 初期投入
  const [bulkMsg, setBulkMsg] = useState('');
  const bulkDry = async () => {
    setBulkMsg('解析中...');
    try {
      const r = await bulkCompleteDrafts(); // 引数なし＝ドライラン
      let sampled = 'なし';
      if (r.mode === 'dryRun' && Array.isArray(r.sampled) && r.sampled.length > 0) {
        sampled = r.sampled.map(({ row, q }) => `#${row}: ${q}`).join(' / ');
      }
      setBulkMsg(`対象 ${r.totalTargets} 件（サンプル: ${sampled}）`);
    } catch (err: unknown) {
      setBulkMsg('エラー。詳細はアラートをご確認ください。');
      showApiError(err, 'ドライラン失敗');
    }
  };
  const bulkRun = async () => {
    if (!confirm('下書きの一括転送を実行します。よろしいですか？')) return;
    setBulkMsg('実行中...（件数が多いと時間がかかる場合があります）');
    try {
      const r = await bulkCompleteDrafts({ dryRun: false, limit: 1000 });
      setBulkMsg(`完了：${r.processed}件 / 失敗${r.errors}件（対象${r.totalTargets}件）`);
    } catch (err: unknown) {
      setBulkMsg('エラー。詳細はアラートをご確認ください。');
      showApiError(err, '一括転送失敗');
    }
  };

  // AI 予想
  const [pred, setPred] = useState<PredictResult | null>(null);
  const [showPred, setShowPred] = useState(false);
  const btnPredictRef = useRef<HTMLButtonElement | null>(null);
  const runPredict = async () => {
    if (!detail) return;
    setShowPred(true);
    setPred({ text: 'AIが検索中...(数十秒かかる場合があります)', urls: [] });
    if (btnPredictRef.current) btnPredictRef.current.disabled = true;
    try {
      const r = await predictAnswerForRow(detail.row);
      setPred(r);
    } catch (err: unknown) {
      setPred({ text: 'エラーが発生しました。詳細はアラートをご確認ください。', urls: [] });
      showApiError(err, 'AI予測エラー');
    } finally {
      if (btnPredictRef.current) btnPredictRef.current.disabled = false;
    }
  };

  // クリップボード
  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      alert('コピーしました');
    } catch {
      alert('コピーに失敗しました');
    }
  };

  // トップボタン（update表示時のみ）
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const v = tab === 'update' && window.scrollY > 200;
      setShowTop(v);
    };
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, [tab]);

  // タブ切替：Update/Sync 初期化（一覧は React Query に任せる）
  useEffect(() => {
    setTabDetail(false);
    setTabHistoryDetail(false);
    if (tab === 'update') initUpdateTab();
    if (tab === 'sync') {
      setSyncMsg('');
      setBulkMsg('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // === Icons (inline SVG) ===
  const I = {
    burger: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M5 7H19M5 12H19M5 17H19"
              stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    unans: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 5h16v12H6l-2 2V5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    drafts: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 19h16M7 4h10a2 2 0 0 1 2 2v9H5V6a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    history: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M3 12a9 9 0 1 0 3-6.7M3 3v6h6M12 7v6l4 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    update: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 4h16v4H4zM4 10h16v10H4zM8 14h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    sync: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M21 12a9 9 0 0 1-15.5 6.3M3 12A9 9 0 0 1 18.5 5.7M7 5h4v4M13 15h4v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    close: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M7 7L17 17M17 7L7 17"
              stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  };

  // レンダ
  return (
    <>
      {/* App Header（既存のまま） */}
      <header className="app-header" role="banner">
        <img src="/planter-lockup.svg" alt="Planter" className="brand-lockup" />
        <div className="app-header-divider" />
      </header>

      <div className="topbar">
        <button className="icon-btn" aria-label="メニュー" onClick={() => setNavOpen(true)}>
          {I.burger}
        </button>

        {/* 中央ロゴ */}
        <div className="topbar-center">
          <img src="/planter-lockup.svg" alt="Planter" className="brand-lockup-sm" />
        </div>
      </div>

      <div className="layout">
        {/* Sidebar */}
        <aside className={`sidebar ${navOpen ? 'open' : ''}`} aria-label="サイドバー">
          <div className="sidebar-header">
            <div className="sidebar-title">プランナー質問管理</div>
            <button className="icon-btn close" aria-label="閉じる" onClick={() => setNavOpen(false)}>
              {I.close}
            </button>
          </div>

          <nav className="nav">
            <button className={`nav-item ${tab === 'unans' ? 'active' : ''}`} onClick={() => switchTab('unans')}>
              {I.unans} <span>未回答</span>
            </button>
            <button className={`nav-item ${tab === 'drafts' ? 'active' : ''}`} onClick={() => switchTab('drafts')}>
              {I.drafts} <span>下書き</span>
            </button>
            <button className={`nav-item ${tab === 'history' ? 'active' : ''}`} onClick={() => switchTab('history')}>
              {I.history} <span>履歴</span>
            </button>
            <button className={`nav-item ${tab === 'update' ? 'active' : ''}`} onClick={() => switchTab('update')}>
              {I.update} <span>データ編集</span>
            </button>
            <button className={`nav-item ${tab === 'sync' ? 'active' : ''}`} onClick={() => switchTab('sync')}>
              {I.sync} <span>chatbot同期</span>
            </button>
          </nav>

          <div className="sidebar-footer">
            <small>© Planter</small>
          </div>
        </aside>

        {/* Backdrop for mobile */}
        <div className={`sidebar-backdrop ${navOpen ? 'show' : ''}`} onClick={() => setNavOpen(false)} aria-hidden={!navOpen} />

        {/* Main content */}
        <main className="content">
          {/* ★ 送信バナー（Outbox件数>0の時だけ表示される） */}
          <OutboxBanner />

          {/* To Top Button */}
          <button
            className={`toTopBtn ${showTop ? '' : 'hidden'}`}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="ページ上部へ"
          >
            ↑トップへ
          </button>

          {/* 未回答一覧 */}
          {tab === 'unans' && !tabDetail && (
            <div className="wrap">
              <h2 className="page-title">未回答</h2>
              {unansLoading ? (
                <div className="skeleton">読み込み中...</div>
              ) : unans.length === 0 ? (
                <div className="empty">未回答はありません</div>
              ) : (
                <div className="cards">
                  {unans.map((it) => (
                    <CardShell key={it.row}>
                      <div
                        className="q"
                        role="button"
                        tabIndex={0}
                        onClick={() => openDetail(it.row)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openDetail(it.row);
                          }
                        }}
                        onMouseEnter={() => {
                          // カードホバーで detail を先読み
                          queryClient.prefetchQuery({ queryKey: ['detail', it.row], queryFn: () => getDetail(it.row), staleTime: 5 * 60_000 });
                        }}
                        onTouchStart={() => {
                          queryClient.prefetchQuery({ queryKey: ['detail', it.row], queryFn: () => getDetail(it.row), staleTime: 5 * 60_000 });
                        }}
                      >
                        {it.question}
                      </div>
                    </CardShell>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 下書き一覧 */}
          {tab === 'drafts' && !tabDetail && (
            <div className="wrap">
              <h2 className="page-title">下書き</h2>
              {draftsLoading ? (
                <div className="skeleton">読み込み中...</div>
              ) : drafts.length === 0 ? (
                <div className="empty">下書きはありません</div>
              ) : (
                <div className="cards">
                  {drafts.map((it) => {
                    const clip = (it.draft || '').toString();
                    const clipText = clip.length > 80 ? clip.slice(0, 80) + '…' : clip;
                    return (
                      <CardShell key={it.row}>
                        <div
                          className="q"
                          role="button"
                          tabIndex={0}
                          onClick={() => openDetail(it.row)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openDetail(it.row);
                            }
                          }}
                          onMouseEnter={() => {
                            queryClient.prefetchQuery({ queryKey: ['detail', it.row], queryFn: () => getDetail(it.row), staleTime: 5 * 60_000 });
                          }}
                          onTouchStart={() => {
                            queryClient.prefetchQuery({ queryKey: ['detail', it.row], queryFn: () => getDetail(it.row), staleTime: 5 * 60_000 });
                          }}
                        >
                          {it.question}
                        </div>
                        <div className="meta">下書き：{clipText}</div>
                      </CardShell>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 履歴一覧 */}
          {tab === 'history' && !tabHistoryDetail && (
            <div className="wrap">
              <h2 className="page-title">履歴</h2>
              {historyLoading ? (
                <div className="skeleton">読み込み中...</div>
              ) : history.length === 0 ? (
                <div className="empty">履歴はありません</div>
              ) : (
                <div className="cards">
                  {history.map((it) => (
                    <div
                      key={it.row}
                      className="card"
                      onClick={() => openHistoryDetail(it.row)}
                      role="button"
                      tabIndex={0}
                      aria-label="履歴の詳細を開く"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openHistoryDetail(it.row);
                        }
                      }}
                    >
                      <div className="q">{it.question}</div>
                      <div className="meta">{it.time ? `発話日時：${it.time}` : ''}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 詳細（未回答/下書き） */}
          {tabDetail && (
            <div className="wrap">
              <h2 className="page-title">詳細</h2>

              {!detail ? (
                <div className="card flat">
                  <div className="q">読み込み中…</div>
                  <div className="a">
                    <p>データを取得しています。しばらくお待ちください。</p>
                  </div>
                </div>
              ) : (
                <div className="card flat">
                  <div className="q">{detail.question}</div>
                  <div className="label">AIによる回答：</div>
                  <div className="box">{detail.aiAnswer}</div>

                  <div className="label">回答入力：</div>
                  <textarea
                    id="detailAns"
                    value={detail.answer || ''}
                    onChange={(e) => setDetail({ ...detail, answer: e.target.value })}
                    placeholder="短文で明確に入力してください。"
                  />
      
                  <VoiceComposeBar
                    value={detail.answer || ""}
                    onChange={(v) => setDetail({ ...detail, answer: v })}
                    onCommit={async (text) => {
                      try {
                        await saveAnswer(detail.row, text, detail.url || "");
                        // キャッシュも更新しておく
                        queryClient.setQueryData(['detail', detail.row], { ...detail, answer: text });
                        // drafts一覧があれば軽く更新
                        queryClient.invalidateQueries({ queryKey: ['drafts'] });
                        // ここでトースト等を出してもOK（例：console.log('自動保存')）
                      } catch (e) {
                        console.warn('自動保存に失敗:', e);
                        // 失敗しても入力欄は保持されるので、必要ならアラート表示
                      }
                    }}
                  />

                  <UrlListEditor
                    value={detail.url || ''}
                    onChange={(joined) => setDetail({ ...detail, url: joined })}
                    collapsedByDefault
                    label="参照URL"
                    help="1行に1URL（利用者に表示）"
                  />

                  {/* ▼ AIで回答作成（復活） */}
                  <div className="row" style={{ marginTop: 8 }}>
                    <button
                      className="btn btn-future"
                      id="btnPredict"
                      ref={btnPredictRef}
                      onClick={runPredict}
                    >
                      AIで回答作成
                    </button>
                  </div>

                  {/* ▼ 予想回答の表示（復活） */}
                  {showPred && (
                    <div id="predSection" style={{ marginTop: 8 }}>
                      <div className="label">AIによる予想回答候補</div>
                      <div className="help">webからの情報のため必ず目視確認の上ご利用ください。</div>

                      <div id="predText" className="box">
                        {pred?.text || ''}
                      </div>

                      <div className="label" style={{ marginTop: 8 }}>
                        参考URL
                      </div>
                      <div id="predUrls" className="box" style={{ minHeight: 28, maxHeight: 96, overflow: 'auto' }}>
                        {pred?.urls?.length ? pred.urls.join('\n') : '(参考URLは見つかりませんでした)'}
                      </div>

                      <div style={{ marginTop: 8 }}>
                        <button className="btn btn-secondary" onClick={() => copy(pred?.text || '')}>
                          本文をコピー
                        </button>
                        <button className="btn btn-secondary" onClick={() => copy((pred?.urls || []).join('\n'))}>
                          URLをコピー
                        </button>
                      </div>
                    </div>
                  )}


                  <div
                    style={{
                      marginTop: 10,
                      position: 'sticky',
                      bottom: 0,
                      background: '#fff',
                      paddingTop: 10,
                      borderTop: '1px solid #eee',
                      zIndex: 1
                    }}
                  >
                    <button
                      className="btn btn-primary"
                      style={{ background: '#2563eb', borderColor: '#2563eb', color: '#fff' }}
                      onClick={async () => {
                        if (!detail) return;
                        const ok = await saveAnswer(detail.row, detail.answer || '', detail.url || '');
                        if (ok) {
                          alert('下書き保存しました');
                          // detail キャッシュ更新
                          queryClient.setQueryData<DetailT>(['detail', detail.row], { ...detail });
                          // drafts を軽く更新
                          queryClient.invalidateQueries({ queryKey: ['drafts'] });
                        }
                      }}
                    >
                      下書き保存
                    </button>
                    <button
                      className="btn btn-primary"
                      style={{ background: '#2563eb', borderColor: '#2563eb', color: '#fff' }}
                      onClick={async () => {
                        if (!detail) return;
                        if (!detail.answer?.trim()) {
                          alert('回答を入力してください');
                          return;
                        }
                        // 1) 先に下書き保存（失敗なら中断）
                        const ok1 = await saveAnswer(detail.row, detail.answer || '', detail.url || '');
                        if (!ok1) {
                          alert('保存に失敗しました');
                          return;
                        }
                        // 2) Outbox に積む（送信はバナーで明示）
                        await pushOutbox({
                          type: 'COMPLETE',
                          row: detail.row,
                          payload: { answer: detail.answer, url: detail.url || '' },
                        });
                        alert('未送信キューに追加しました（上部バナーから送信）');
                        // 3) 詳細を閉じる（この時点ではサーバ状態は未変更）
                        setTabDetail(false);
                      }}
                    >
                      回答済みにする（公開用へ転送）
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={async () => {
                        if (!detail) return;
                        if (!confirm('「変更しなくて良い」にして履歴に送信キューへ追加します。よろしいですか？')) return;
                        await pushOutbox({ type: 'NOCHANGE', row: detail.row });
                        alert('未送信キューに追加しました（上部バナーから送信）');
                        setTabDetail(false);
                      }}
                    >
                      変更しなくて良い
                    </button>
                    <button className="btn btn-secondary" onClick={() => setTabDetail(false)}>
                      戻る
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 履歴詳細（即遷移→後読み込み） */}
          {tabHistoryDetail && (
            <div className="wrap">
              <h2 className="page-title">履歴詳細</h2>

              {!historyDetail ? (
                <div className="card flat">
                  <div className="q">読み込み中…</div>
                  <div className="a">
                    <p>データを取得しています。しばらくお待ちください。</p>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <button className="btn btn-secondary" onClick={() => setTabHistoryDetail(false)}>
                      戻る
                    </button>
                  </div>
                </div>
              ) : (
                <div className="card flat">
                  <div className="q">{historyDetail.question}</div>
                  <div className="label">
                    発話日時：<span>{historyDetail.dialogueTime}</span>
                  </div>
                  <div className="label">AIによる回答：</div>
                  <div className="box">{historyDetail.aiAnswer}</div>
                  <div className="label">正しい回答（プランナーさん記入）：</div>
                  <div className="box">{historyDetail.answer}</div>
                  <div style={{ marginTop: 10 }}>
                    <button className="btn btn-secondary" onClick={() => setTabHistoryDetail(false)}>
                      戻る
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* データ編集（一覧 or 詳細） */}
          {tab === 'update' && (
            <div className="wrap">
              {!updCur ? (
                <>
                  <h2 className="page-title">データ編集</h2>

                  {/* 検索フォーム */}
                  <div className="row">
                    <div style={{ flex: '1 1 280px' }}>
                      <input
                        type="text"
                        placeholder="キーワード検索（質問／回答）"
                        value={updQuery}
                        onChange={(e) => setUpdQuery(e.target.value)}
                      />
                      <div className="help">質問・回答に含まれる語で検索します。</div>
                    </div>
                    <div>
                      <select value={updTopic} onChange={(e) => setUpdTopic(e.target.value)}>
                        <option value="">（すべてのトピック）</option>
                        {topicOptions.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <button className="btn btn-primary" onClick={loadUpdateList}>
                        検索
                      </button>
                    </div>
                  </div>

                  {/* 一覧 */}
                  <div id="updList" style={{ marginTop: 12 }}>
                    {updList === null ? (
                      <div className="skeleton">読み込み中...</div>
                    ) : updList.length === 0 ? (
                      <div className="empty">該当するデータは見つかりませんでした。</div>
                    ) : (
                      <div className="cards">
                        {updList.map((it) => {
                          const ans = it.answer || '';
                          const ansClip = ans.length > 120 ? ans.slice(0, 120) + '…' : ans;
                          const topic = it.topicKey || '';
                          const area = it.area || it.topicName || '';
                          return (
                            <div key={it.row} className="card" onClick={() => openUpdateDetail(it)}>
                              <div className="q">{it.question || '（無題）'}</div>
                              <div className="meta">
                                <span className="k">Topic</span>
                                <span className="badge" style={badgeStyle(topic)}>{topic}</span>
                                　
                                <span className="k">Area</span>
                                <span className="badge">{area}</span>
                                　{it.syncedAt ? <span className="badge badge-light">最終同期 {it.syncedAt}</span> : null}
                              </div>
                              <div className="meta">回答：{ansClip}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* ===== 詳細ビュー ===== */
                <div>
                  <h2 className="page-title">詳細</h2>
                  <div className="card flat">
                    <div className="q" id="updQ">{updCur.question}</div>
                    <div className="meta">
                      トピック：<span id="updTopicKey">{updCur.topicKey}</span>{' '}
                      <span className="badge" id="updTopicName">
                        {updCur.topicName || updCur.area || ''}
                      </span>
                    </div>

                    <div className="label">回答（編集可）：</div>
                    <textarea
                      id="updA"
                      value={updCur.answer || ''}
                      onChange={(e) => setUpdCur({ ...updCur, answer: e.target.value })}
                    />

                    {/* URLは UrlListEditor を使用 */}
                    <UrlListEditor
                      value={updCur.url || ''}
                      onChange={(joined) => setUpdCur({ ...updCur, url: joined })}
                      collapsedByDefault
                      label="参照URL"
                      help="1行に1URL（利用者に表示）"
                    />

                    <div style={{ marginTop: 10 }}>
                      {/* 保存 */}
                      <button
                        className="btn btn-primary"
                        disabled={delBusy}
                        onClick={async () => {
                          if (!updCur) return;
                          if (!updCur.answer?.trim()) {
                            alert('回答を入力してください');
                            return;
                          }
                          try {
                            const ok = await saveUpdateRow(updCur.row, {
                              answer: updCur.answer,
                              url: updCur.url || ''
                            });
                            if (ok) {
                              alert('保存しました。');
                              await closeUpdateDetail(true); // 一覧へ戻り再読込
                              // 影響しそうなキャッシュを無効化
                              queryClient.invalidateQueries({ queryKey: ['unans'] });
                              queryClient.invalidateQueries({ queryKey: ['drafts'] });
                              queryClient.invalidateQueries({ queryKey: ['history'] });
                              queryClient.removeQueries({ queryKey: ['detail', updCur.row], exact: true });
                            } else {
                              alert('保存に失敗しました。');
                            }
                          } catch (e: any) {
                            alert('エラー: ' + (e?.message || e));
                          }
                        }}
                      >
                        保存
                      </button>

                      {/* 削除（赤） */}
                      <button
                        className="btn btn-danger"
                        disabled={delBusy}
                        onClick={handleDeleteUpdate}
                      >
                        {delBusy ? '削除中…' : '削除'}
                      </button>

                      {/* 戻る */}
                      <button
                        className="btn btn-secondary"
                        disabled={delBusy}
                        onClick={() => closeUpdateDetail(false)}
                      >
                        戻る
                      </button>
                    </div>

                  </div>
                </div>
              )}
            </div>
          )}

          {/* 同期 */}
          {tab === 'sync' && (
            <div className="wrap">
              <h2 className="page-title">chatbot 同期</h2>
              <div className="card">
                <h3 className="card-title">chatbot 同期</h3>
                <div className="help" style={{ margin: '0 0 10px' }}>
                  通常、この同期は 毎日 深夜2:00 に自動実行されます。
                  <br />
                  最新の内容を今すぐ反映したい場合は、下の「同期開始」を押してください。
                </div>
                <button className="btn btn-primary" onClick={runSync}>同期開始</button>
                <div className="help" style={{ marginTop: 8 }}>{syncMsg}</div>
              </div>

              <div className="card">
                <h3 className="card-title">下書き一括転送</h3>
                <div className="help" style={{ margin: '0 10px 8px 0' }}>
                  回答あり・未チェックの下書きを「回答済み」に一括処理します。まずはドライランで件数確認がおすすめです。
                </div>
                <div className="row">
                  <button className="btn btn-secondary" onClick={bulkDry}>ドライラン（件数確認）</button>
                  <button className="btn btn-primary" onClick={bulkRun}>実行</button>
                </div>
                <div className="help" style={{ marginTop: 8 }}>{bulkMsg}</div>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
