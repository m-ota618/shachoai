// src/lib/useWebLLM.ts
import { useEffect, useRef, useState } from "react";
import {
  CreateMLCEngine,
  type MLCEngine,
  type InitProgressReport,
  prebuiltAppConfig,
  type AppConfig,
} from "@mlc-ai/web-llm";

type ModelInfo = { model_id: string; [k: string]: any };

function pickDefaultModelId(app: AppConfig, prefer?: string) {
  const list = (app?.model_list ?? []) as ModelInfo[];

  if (!list.length) {
    throw new Error("WebLLM: appConfig.model_list が空です。ライブラリのバージョンを確認してください。");
  }

  // ① ユーザー指定があればそれを最優先（存在確認する）
  if (prefer) {
    const hit = list.find((m) => m.model_id === prefer);
    if (hit) return hit.model_id;
    console.warn(`[WebLLM] 指定のモデルIDが見つかりませんでした: ${prefer}`);
  }

  // ② 優先候補（軽量＆日本語そこそこなものを推し順で）
  //   環境の model_list に応じて最初にヒットしたものを使う
  const preferredPatterns = [
    /Qwen.*1\.5B.*Instruct/i,
    /Qwen.*0\.5B.*Instruct/i,
    /Phi.*3(\.5)?-mini.*Instruct/i,
    /Llama.*1B.*Instruct/i,
    /Gemma.*2B.*Instruct/i,
  ];
  for (const re of preferredPatterns) {
    const hit = list.find((m) => re.test(m.model_id));
    if (hit) return hit.model_id;
  }

  // ③ 何もヒットしなければ先頭
  return list[0].model_id;
}

/**
 * WebLLM 初期化フック（モデルIDは自動選択）
 * - 初回ロードは時間がかかるため進捗テキストを返す
 * - `overrideModelId` を渡すとそのIDを使う（存在しなければ自動選択）
 */
export function useWebLLM(overrideModelId?: string) {
  const engineRef = useRef<MLCEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("モデルを読み込み中...");
  const [error, setError] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);

  const webgpuOK = typeof navigator !== "undefined" && !!(navigator as any).gpu;

  useEffect(() => {
    let disposed = false;

    (async () => {
      if (!webgpuOK) {
        setError("このブラウザは WebGPU に未対応です。最新の Chrome/Edge をご利用ください。");
        return;
      }

      try {
        // prebuilt をベースに（必須の model_list を内包）
        const appConfig: AppConfig = {
          ...prebuiltAppConfig,
          useIndexedDBCache: true,
        };

        // 利用可能なモデルIDから選定
        const chosen = pickDefaultModelId(appConfig, overrideModelId);
        setModelId(chosen);

        // 進捗
        const initProgressCallback = (p: InitProgressReport) => {
          if (!disposed) setLoadingMsg(p.text || "準備中...");
        };

        // 初期化
        const engine = await CreateMLCEngine(chosen, {
          initProgressCallback,
          appConfig,
        });

        if (disposed) return;
        engineRef.current = engine;
        setReady(true);

        // デバッグ：利用可能なモデル一覧を出しておくと原因切り分けに便利
        try {
          const list = (appConfig.model_list ?? []) as ModelInfo[];
          console.log("[WebLLM] available models:", list.map((m) => m.model_id));
          console.log("[WebLLM] chosen model:", chosen);
        } catch {}
      } catch (e: any) {
        if (disposed) return;
        console.error("[WebLLM] init error:", e);
        setError(e?.message || String(e));
        setLoadingMsg("モデル読み込みに失敗しました。");
      }
    })();

    return () => {
      disposed = true;
    };
  }, [overrideModelId, webgpuOK]);

  const run = async (prompt: string) => {
    if (!engineRef.current) throw new Error("LLM not ready");
    const r = await engineRef.current.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 512,
    });
    return r.choices?.[0]?.message?.content ?? "";
  };

  return { ready, loadingMsg, error, run, modelId, webgpuOK };
}
