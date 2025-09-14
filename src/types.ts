// src/types.ts

export type UnansweredItem = { row: number; question: string };

export type DraftItem = {
  row: number;
  question: string;
  // 下書きが空のケースも安全に受ける
  draft?: string;
};

export type Detail = {
  row: number;
  question: string;
  aiAnswer: string;
  answer: string;
  url: string;
};

export type HistoryItem = {
  row: number;
  time: string;
  question: string;
  answer: string;
};

export type HistoryDetail = {
  row: number;
  dialogueTime: string;
  question: string;
  aiAnswer: string;
  answer: string;
};

export type UpdateItem = {
  row: number;
  question: string;
  answer: string;
  url: string;
  topicKey: string;
  topicName?: string;
  area?: string;
  pinned?: boolean;
  syncedAt?: string;
};

export type PredictResult = {
  text: string;
  urls: string[];
  confidence?: { label: string; score: number };
  mode?: string;
  trace?: any;
};

// 一括転送（ドライラン/実行）
export type BulkDryResult = {
  mode: 'dryRun';
  processed: number;
  skipped: number;
  errors: number;
  totalTargets: number;
  sampled?: Array<{ row: number; q: string }>;
  duration_ms: number;
};

export type BulkRunResult = {
  mode: 'run';
  processed: number;
  skipped: number;
  errors: number;
  totalTargets: number;
  duration_ms: number;
};

// ========= 別名（既存コード互換用） =========
export type HistoryListItem = HistoryItem;
export type PredictResponse = PredictResult;
export type BulkCompleteResult = BulkDryResult | BulkRunResult;
