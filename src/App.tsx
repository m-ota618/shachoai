// src/App.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  getUnanswered,
  getDrafts,
  getDetail,
  saveAnswer,
  completeFromWeb,
  noChangeFromWeb,
  getHistoryList,
  getHistoryDetail,
  getAllTopicOptionsPinnedFirst,
  getUpdateData,
  saveUpdateRow,
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

type Tab = 'unans' | 'drafts' | 'history' | 'update' | 'sync';

/* =========================
   キャッシュ基盤（App.tsx内に完結）
   ========================= */
type Entry<V> = { value: V; ts: number };
function createLRUCache<K, V>(opt: { maxEntries: number; ttlMs?: number; maxItemBytes?: number }) {
  const { maxEntries, ttlMs = 10 * 60 * 1000, maxItemBytes = 50_000 } = opt;
  const map = new Map<K, Entry<V>>();
  const now = () => Date.now();
  const sizeOf = (v: V) => { try { return JSON.stringify(v).length; } catch { return 0; } };

  const get = (k: K): V | undefined => {
    const e = map.get(k);
    if (!e) return;
    if (ttlMs && now() - e.ts > ttlMs) { map.delete(k); return; }
    // LRU（参照されたら末尾へ）
    map.delete(k); map.set(k, e);
    return e.value;
  };
  const set = (k: K, v: V) => {
    if (maxItemBytes && sizeOf(v) > maxItemBytes) return; // 大きすぎは入れない
    if (map.has(k)) map.delete(k);
    map.set(k, { value: v, ts: now() });
    if (map.size > maxEntries) {
      const it = map.keys().next();
      if (!it.done) {
        map.delete(it.value as K); // done ガード後に削除
      }
    }
  };
  const del = (k: K) => { map.delete(k); };
  const has = (k: K) => !!get(k);
  const clear = () => { map.clear(); };
  return { get, set, del, has, clear };
}
const LIST_TTL = 5 * 60 * 1000; // 一覧SWRのTTL 5分
const onIdle = (fn: () => void) => {
  // Safariなどはフォールバック
  // @ts-ignore
  return 'requestIdleCallback' in window ? (window as any).requestIdleCallback(fn, { timeout: 1200 }) : setTimeout(fn, 300);
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
  collapsedByDefault?: boolean; // true だと、初期値が空のときは「追加する」ボタンだけ
  label?: string;
  help?: string;
}) {
  const { value, onChange, collapsedByDefault, label = '参照URL', help = '1行に1URL（表示用）' } = props;
  const toArray = (v?: string) =>
    (v || '')
      .split('\n')
      .map(s => s.trim())
      .filter((s, i, a) => s.length > 0 || a.length === 0); // 空配列は避ける

  const [urls, setUrls] = React.useState<string[]>(toArray(value));
  const [expanded, setExpanded] = React.useState<boolean>(
    (value && value.trim().length > 0) || !collapsedByDefault ? true : false
  );

  // 親からの値変更が入った場合に同期（通常はほぼ発火しない）
  React.useEffect(() => {
    setUrls(toArray(value));
    if ((value && value.trim()) || !collapsedByDefault) setExpanded(true);
  }, [value]);

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
            className="btn btn-secondary"
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
              setExpanded(false); // 空のときは閉じる
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

export default function App() {
  const [tab, setTab] = useState<Tab>('unans');

  // ==== Sidebar (hamburger) ====
  const [navOpen, setNavOpen] = useState(false);
  const switchTab = (t: Tab) => {
    setTab(t);
    setNavOpen(false);
  };

  /* =========================
     一覧SWRキャッシュ & 競合排除
     ========================= */
  const listCacheRef = useRef<{
    unans?: { ts: number; data: UnansweredItem[] };
    drafts?: { ts: number; data: DraftItem[] };
    history?: { ts: number; data: HistoryItem[] };
  }>({});
  const getCached = <T,>(b?: { ts: number; data: T }) => (b && Date.now() - b.ts < LIST_TTL ? b.data : null);
  const seqRef = useRef({ unans: 0, drafts: 0, history: 0 });

  /* =========================
     詳細LRU＋先読み
     ========================= */
  const detailCache = useRef(createLRUCache<number, DetailT>({
    maxEntries: 200,
    ttlMs: 10 * 60 * 1000,
    maxItemBytes: 50_000
  }));
  const inflightDetailRef = useRef<Map<number, Promise<void>>>(new Map());
  const prefetchDetail = (row: number) => {
    if (detailCache.current.has(row)) return;
    if (inflightDetailRef.current.has(row)) return;
    const p = (async () => {
      try {
        const d = await getDetail(row);
        detailCache.current.set(row, d);
      } finally {
        inflightDetailRef.current.delete(row);
      }
    })();
    inflightDetailRef.current.set(row, p);
  };
  const prefetchTopDetails = (rows: number[], n = 6) => {
    rows.slice(0, n).forEach(prefetchDetail);
  };

  // 未回答
  const [unans, setUnans] = useState<UnansweredItem[] | null>(null);
  const loadUnans = async () => {
    const my = ++seqRef.current.unans;
    const cached = getCached(listCacheRef.current.unans);
    if (cached) setUnans(cached); else setUnans(null);
    try {
      const r = await getUnanswered();
      if (my !== seqRef.current.unans) return; // 古いレスポンスは無視
      listCacheRef.current.unans = { ts: Date.now(), data: r };
      setUnans(r);
      prefetchTopDetails(r.map(x => x.row), 6);
    } catch (err: unknown) {
      if (!cached) setUnans([]);
      showApiError(err, '未回答取得エラー');
    }
  };

  // 下書き
  const [drafts, setDrafts] = useState<DraftItem[] | null>(null);
  const loadDrafts = async () => {
    const my = ++seqRef.current.drafts;
    const cached = getCached(listCacheRef.current.drafts);
    if (cached) setDrafts(cached); else setDrafts(null);
    try {
      const r = await getDrafts();
      if (my !== seqRef.current.drafts) return;
      listCacheRef.current.drafts = { ts: Date.now(), data: r };
      setDrafts(r);
      prefetchTopDetails(r.map(x => x.row), 6);
    } catch (err: unknown) {
      if (!cached) setDrafts([]);
      showApiError(err, '下書き取得エラー');
    }
  };

  // 履歴
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const loadHistory = async () => {
    const my = ++seqRef.current.history;
    const cached = getCached(listCacheRef.current.history);
    if (cached) setHistory(cached); else setHistory(null);
    try {
      const r = await getHistoryList();
      if (my !== seqRef.current.history) return;
      listCacheRef.current.history = { ts: Date.now(), data: r };
      setHistory(r);
      // 履歴は詳細APIが別のため詳細先読みは行わない
    } catch (err: unknown) {
      if (!cached) setHistory([]);
      showApiError(err, '履歴取得エラー');
    }
  };

  // 詳細（未回答/下書き）
  const [detail, setDetail] = useState<DetailT | null>(null);
  const [tabDetail, setTabDetail] = useState(false);

  /* =========================
     詳細オープン＝LRU命中なら即描画→裏で最新化
     ========================= */
  const openDetail = (() => {
    let clicking = false;
    return async (row: number) => {
      if (clicking) return;
      clicking = true;

      setTabDetail(true);
      setShowPred(false);
      setPred(null);

      const cached = detailCache.current.get(row);
      setDetail(cached || null); // 命中で即描画、外れはローディング

      if (!inflightDetailRef.current.has(row)) {
        const p = (async () => {
          try {
            const fresh = await getDetail(row);
            detailCache.current.set(row, fresh);
            setDetail(prev => (prev?.row === row || prev === null) ? fresh : prev);
          } catch (err) {
            if (!cached) setDetail(null);
            showApiError(err, '詳細取得エラー');
          } finally {
            inflightDetailRef.current.delete(row);
          }
        })();
        inflightDetailRef.current.set(row, p);
      }
      clicking = false;
    };
  })();

  // 履歴詳細
  const [historyDetail, setHistoryDetail] = useState<HistoryDetailT | null>(null);
  const [tabHistoryDetail, setTabHistoryDetail] = useState(false);

  // 履歴も“先に開いて後で読み込み”
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

  // Update（検索・編集）
  const [topicOptions, setTopicOptions] = useState<string[]>([]);
  const [updQuery, setUpdQuery] = useState('');
  const [updTopic, setUpdTopic] = useState('');
  const [updList, setUpdList] = useState<UpdateItem[] | null>(null);
  const [updCur, setUpdCur] = useState<UpdateItem | null>(null);

  // ★追加：一覧↔詳細の切替ヘルパー
  const openUpdateDetail = (it: UpdateItem) => {
    setUpdCur(it);
    try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch {}
  };

  const closeUpdateDetail = async (reload?: boolean) => {
    setUpdCur(null);
    if (reload) await loadUpdateList(); // 保存後は再読み込み
  };

  const initUpdateTab = async () => {
    setUpdList(null);
    if (!topicOptions.length) {
      try {
        const t = await getAllTopicOptionsPinnedFirst();
        setTopicOptions(t);
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

  // タブ切替時ロード
  useEffect(() => {
    setTabDetail(false);
    setTabHistoryDetail(false);
    if (tab === 'unans') loadUnans();
    if (tab === 'drafts') loadDrafts();
    if (tab === 'history') loadHistory();
    if (tab === 'update') initUpdateTab();
    if (tab === 'sync') {
      setSyncMsg('');
      setBulkMsg('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // 一覧のアイドル時プリロード
  useEffect(() => {
    if (tab === 'unans' && unans) {
      onIdle(() => { loadDrafts(); });
      onIdle(() => { loadHistory(); });
    }
    if (tab === 'drafts' && drafts) {
      onIdle(() => { loadUnans(); });
      onIdle(() => { loadHistory(); });
    }
  }, [tab, unans, drafts]);

  // === Icons (inline SVG) ===
  const I = {
    burger: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        {/* 端を短く・丸める・均等間隔 */}
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
        {/* 交点が中心に来るよう調整＆丸める */}
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
              {unans === null ? (
                <div className="skeleton">読み込み中...</div>
              ) : unans.length === 0 ? (
                <div className="empty">未回答はありません</div>
              ) : (
                <div className="cards">
                  {unans.map((it) => (
                    <div
                      key={it.row}
                      className="card"
                      data-row={it.row}
                      onClick={() => openDetail(it.row)}
                      onMouseEnter={() => prefetchDetail(it.row)}
                      onTouchStart={() => prefetchDetail(it.row)}
                      role="button"
                      tabIndex={0}
                      aria-label="詳細を開く"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openDetail(it.row);
                        }
                      }}
                    >
                      <div className="q">{it.question}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 下書き一覧 */}
          {tab === 'drafts' && !tabDetail && (
            <div className="wrap">
              <h2 className="page-title">下書き</h2>
              {drafts === null ? (
                <div className="skeleton">読み込み中...</div>
              ) : drafts.length === 0 ? (
                <div className="empty">下書きはありません</div>
              ) : (
                <div className="cards">
                  {drafts.map((it) => {
                    const clip = (it.draft || '').toString();
                    const clipText = clip.length > 80 ? clip.slice(0, 80) + '…' : clip;
                    return (
                      <div
                        key={it.row}
                        className="card"
                        data-row={it.row}
                        onClick={() => openDetail(it.row)}
                        onMouseEnter={() => prefetchDetail(it.row)}
                        onTouchStart={() => prefetchDetail(it.row)}
                        role="button"
                        tabIndex={0}
                        aria-label="詳細を開く"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openDetail(it.row);
                          }
                        }}
                      >
                        <div className="q">{it.question}</div>
                        <div className="meta">下書き：{clipText}</div>
                      </div>
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
              {history === null ? (
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

                  <UrlListEditor
                    value={detail.url || ''}
                    onChange={(joined) => setDetail({ ...detail, url: joined })}
                    collapsedByDefault
                    label="参照URL"
                    help="1行に1URL（利用者に表示）"
                  />

                  <div className="row" style={{ marginTop: 8 }}>
                    <button className="btn btn-future" id="btnPredict" ref={btnPredictRef} onClick={runPredict}>
                      AIで回答作成
                    </button>
                  </div>

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

                  <div style={{ marginTop: 10 }}>
                    <button
                      className="btn btn-primary"
                      onClick={async () => {
                        if (!detail) return;
                        const ok = await saveAnswer(detail.row, detail.answer || '', detail.url || '');
                        if (ok) {
                          alert('下書き保存しました');
                          // 詳細キャッシュ更新・一覧キャッシュは念のためinvalidate
                          detailCache.current.set(detail.row, { ...detail });
                          delete listCacheRef.current.drafts;
                        }
                      }}
                    >
                      下書き保存
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={async () => {
                        if (!detail) return;
                        if (!detail.answer) {
                          alert('回答を入力してください');
                          return;
                        }
                        const ok1 = await saveAnswer(detail.row, detail.answer || '', detail.url || '');
                        if (!ok1) {
                          alert('保存に失敗しました');
                          return;
                        }
                        const ok2 = await completeFromWeb(detail.row);
                        if (ok2) {
                          alert('回答済みにしました（公開用へ転送）');
                          // 未回答/下書き/履歴の整合性
                          detailCache.current.del(detail.row);
                          delete listCacheRef.current.unans;
                          delete listCacheRef.current.drafts;
                          delete listCacheRef.current.history;
                          setTabDetail(false);
                          if (tab === 'unans') loadUnans();
                          if (tab === 'drafts') loadDrafts();
                        } else {
                          alert('転送に失敗しました');
                        }
                      }}
                    >
                      回答済みにする（公開用へ転送）
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={async () => {
                        if (!detail) return;
                        if (!confirm('「変更しなくて良い」にして履歴に転送します。よろしいですか？')) return;
                        const ok = await noChangeFromWeb(detail.row);
                        if (ok) {
                          alert('変更なしとして履歴に転送しました');
                          detailCache.current.del(detail.row);
                          delete listCacheRef.current.unans;
                          delete listCacheRef.current.history;
                          delete listCacheRef.current.drafts;
                          setTabDetail(false);
                          if (tab === 'unans') loadUnans();
                          if (tab === 'drafts') loadDrafts();
                        } else {
                          alert('処理に失敗しました');
                        }
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
                      <button
                        className="btn btn-primary"
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
                              detailCache.current.del(updCur.row);
                              delete listCacheRef.current.unans;
                              delete listCacheRef.current.drafts;
                              delete listCacheRef.current.history;
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
                      <button className="btn btn-secondary" onClick={() => closeUpdateDetail(false)}>
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
                <h3 className="card-title">初期投入：下書き一括転送</h3>
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
