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

type Tab = 'unans' | 'drafts' | 'history' | 'update' | 'sync';

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

export default function App() {
  const [tab, setTab] = useState<Tab>('unans');

  // ==== Sidebar (hamburger) ====
  const [navOpen, setNavOpen] = useState(false);
  const switchTab = (t: Tab) => {
    setTab(t);
    setNavOpen(false);
  };

  // 未回答
  const [unans, setUnans] = useState<UnansweredItem[] | null>(null);
  const loadUnans = async () => {
    setUnans(null);
    try {
      const r = await getUnanswered();
      setUnans(r);
    } catch (e: any) {
      setUnans([]);
      alert('未回答取得エラー: ' + (e?.message || e));
    }
  };

  // 下書き
  const [drafts, setDrafts] = useState<DraftItem[] | null>(null);
  const loadDrafts = async () => {
    setDrafts(null);
    try {
      const r = await getDrafts();
      setDrafts(r);
    } catch (e: any) {
      setDrafts([]);
      alert('下書き取得エラー: ' + (e?.message || e));
    }
  };

  // 履歴
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const loadHistory = async () => {
    setHistory(null);
    try {
      const r = await getHistoryList();
      setHistory(r);
    } catch (e: any) {
      setHistory([]);
      alert('履歴取得エラー: ' + (e?.message || e));
    }
  };

  // 詳細
  const [detail, setDetail] = useState<DetailT | null>(null);
  const [tabDetail, setTabDetail] = useState(false);
  const openDetail = async (row: number) => {
    try {
      const r = await getDetail(row);
      setDetail(r);
      setPred(null);
      setShowPred(false);
      setTabDetail(true);
    } catch (e: any) {
      alert('詳細取得エラー: ' + (e?.message || e));
    }
  };

  // 履歴詳細
  const [historyDetail, setHistoryDetail] = useState<HistoryDetailT | null>(null);
  const [tabHistoryDetail, setTabHistoryDetail] = useState(false);
  const openHistoryDetail = async (row: number) => {
    try {
      const r = await getHistoryDetail(row);
      setHistoryDetail(r);
      setTabHistoryDetail(true);
    } catch (e: any) {
      alert('履歴詳細エラー: ' + (e?.message || e));
    }
  };

  // Update（検索・編集）
  const [topicOptions, setTopicOptions] = useState<string[]>([]);
  const [updQuery, setUpdQuery] = useState('');
  const [updTopic, setUpdTopic] = useState('');
  const [updList, setUpdList] = useState<UpdateItem[] | null>(null);
  const [updCur, setUpdCur] = useState<UpdateItem | null>(null);

  const initUpdateTab = async () => {
    setUpdList(null);
    if (!topicOptions.length) {
      try {
        const t = await getAllTopicOptionsPinnedFirst();
        setTopicOptions(t);
      } catch (e: any) {
        console.warn(e);
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
    } catch (e: any) {
      setUpdList([]);
      alert('更新データ取得エラー: ' + (e?.message || e));
    }
  };

  // Sync
  const [syncMsg, setSyncMsg] = useState('');
  const runSync = async () => {
    setSyncMsg('同期を開始しています...（数十秒かかる場合があります）');
    try {
      const ok = await syncToMiibo();
      setSyncMsg(ok ? '同期が完了しました。' : '同期に失敗しました。');
    } catch (e: any) {
      setSyncMsg('同期エラー: ' + (e?.message || e));
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setBulkMsg('エラー: ' + msg);
    }
  };
  const bulkRun = async () => {
    if (!confirm('下書きの一括転送を実行します。よろしいですか？')) return;
    setBulkMsg('実行中...（件数が多いと時間がかかる場合があります）');
    try {
      const r = await bulkCompleteDrafts({ dryRun: false, limit: 1000 });
      setBulkMsg(`完了：${r.processed}件 / 失敗${r.errors}件（対象${r.totalTargets}件）`);
    } catch (e: any) {
      setBulkMsg('エラー: ' + (e?.message || e));
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
    } catch (e: any) {
      setPred({ text: 'エラー: ' + (e?.message || e), urls: [] });
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

  // === Icons (inline SVG) ===
  const I = {
    burger: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
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
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
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

      {/* Topbar (mobile) */}
      <div className="topbar">
        <button className="icon-btn" aria-label="メニュー" onClick={() => setNavOpen(true)}>
          {I.burger}
        </button>
        <div className="topbar-title">プランナー質問管理</div>
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
            <small>© OkuraTokyo</small>
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
                    <div key={it.row} className="card" onClick={() => openDetail(it.row)}>
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
                      <div key={it.row} className="card" onClick={() => openDetail(it.row)}>
                        <div className="q">{it.question}</div>
                        <div className="meta">下書き：{clipText}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 履歴一覧（未回答/下書きと同じ .cards を使用） */}
          {tab === 'history' && !tabHistoryDetail && (
            <div className="wrap">
              <h2 className="page-title">履歴</h2>
              {history === null ? (
                <div className="skeleton">読み込み中...</div>
              ) : history.length === 0 ? (
                <div className="empty">履歴はありません</div>
              ) : (
                <div className="cards">{/* ← ここがポイント：他タブと完全同一の .cards */}
                  {history.map((it) => (
                    <div key={it.row} className="card" onClick={() => openHistoryDetail(it.row)}>
                      <div className="q">{it.question}</div>
                      <div className="meta">{it.time ? `発話日時：${it.time}` : ''}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 詳細（未回答/下書き） */}
          {tabDetail && detail && (
            <div className="wrap">
              <h2 className="page-title">詳細</h2>

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

                <div className="label">URL（任意）：1行に1URL、利用者へ表示されるURLです。</div>
                <textarea
                  id="detailURL"
                  style={{ minHeight: 56, height: 56 }}
                  value={detail.url || ''}
                  onChange={(e) => setDetail({ ...detail, url: e.target.value })}
                  placeholder={'https://example.com/one\nhttps://example.com/two'}
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
                      if (ok) alert('下書き保存しました');
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
            </div>
          )}

          {/* 履歴詳細 */}
          {tabHistoryDetail && historyDetail && (
            <div className="wrap">
              <h2 className="page-title">履歴詳細</h2>
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
            </div>
          )}

          {/* データ編集 */}
          {tab === 'update' && (
            <div className="wrap">
              <h2 className="page-title">データ編集</h2>
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
                        <div key={it.row} className="card" onClick={() => setUpdCur(it)}>
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

              {updCur && (
                <div id="updEditor" className="card flat" style={{ marginTop: 12 }}>
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

                  <div className="label">URL（任意）：1行に1URL、利用者へ表示されるURLです。</div>
                  <textarea
                    id="updURL"
                    placeholder={'https://example.com/one\nhttps://example.com/two'}
                    style={{ minHeight: 56, resize: 'vertical', whiteSpace: 'pre-wrap' }}
                    value={updCur.url || ''}
                    onChange={(e) => setUpdCur({ ...updCur, url: e.target.value })}
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
                            await loadUpdateList();
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
                    <button className="btn btn-secondary" onClick={() => setUpdCur(null)}>
                      キャンセル
                    </button>
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
