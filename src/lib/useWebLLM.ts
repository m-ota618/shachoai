// src/lib/useWebLLM.ts
import { useEffect, useRef, useState } from "react";
import * as webllm from "@mlc-ai/web-llm";

/**
 * WebLLM 初期化フック
 * - 既定モデル: Qwen 2.5 1.5B instruct（日本語そこそこ・サイズ控えめ）
 * - 初回ロードは時間がかかるため進捗テキストを返す
 */
export function useWebLLM(
  model: string = "Qwen2.5-1.5B-Instruct-q4f16_1" // ← 大文字小文字含めプリビルト名に合わせる
) {
  const engineRef = useRef<webllm.MLCEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("モデルを読み込み中...");
  const [error, setError] = useState<string | null>(null);

  // WebGPU 環境チェック（簡易）
  const webgpuOK =
    typeof navigator !== "undefined" &&
    !!(navigator as any).gpu;

  useEffect(() => {
    let disposed = false;

    (async () => {
      if (!webgpuOK) {
        setError("このブラウザは WebGPU に未対応です。最新の Chrome/Edge をご利用ください。");
        return;
      }
      try {
        const initProgressCallback = (p: webllm.InitProgressReport) => {
          if (disposed) return;
          setLoadingMsg(p.text || "準備中...");
        };

        // ★ 修正ポイント：
        // appConfig は prebuiltAppConfig をベースにマージして渡す
        // これで model_list を満たしつつ、IndexedDB キャッシュも有効化できる
        const appConfig: webllm.AppConfig = {
          ...(webllm as any).prebuiltAppConfig, // 型定義が厳しい環境向けに any 経由で参照
          useIndexedDBCache: true,
        };

        const engine = await webllm.CreateMLCEngine(model, {
          initProgressCallback,
          appConfig, // ← ここが必須ならこの形で渡す
          // appConfig を渡さない選択肢でも可（下記コメント参照）
        });

        if (!disposed) {
          engineRef.current = engine;
          setReady(true);
        }
      } catch (e: any) {
        if (!disposed) {
          console.error(e);
          setError(e?.message || String(e));
          setLoadingMsg("モデル読み込みに失敗しました");
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, [model, webgpuOK]);

  const run = async (prompt: string) => {
    if (!engineRef.current) throw new Error("LLM not ready");
    const r = await engineRef.current.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 512,
    });
    return r.choices?.[0]?.message?.content ?? "";
  };

  return { ready, loadingMsg, error, run, webgpuOK };
}
