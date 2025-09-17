// src/types.ts
export type UnansweredItem = { row: number; question: string };

export type DraftItem = {
  row: number;
  question: string;
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
  trace?: unknown; // any → unknown
};

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

export type HistoryListItem = HistoryItem;
export type PredictResponse = PredictResult;
export type BulkCompleteResult = BulkDryResult | BulkRunResult;
