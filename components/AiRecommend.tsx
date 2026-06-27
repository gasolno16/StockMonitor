"use client";
import { useState, useEffect } from "react";
import { Sparkles, Loader2, ChevronDown, ChevronUp, Settings, X } from "lucide-react";
import type { Stock, StockQuote } from "@/types";

interface Recommendation {
  symbol: string;
  name: string;
  market: "KR" | "US";
  reason: string;
}

interface AiResult {
  summary: string;
  analysis: string;
  recommendations: Recommendation[];
}

interface Props {
  stocks: Stock[];
  quotes: Record<string, StockQuote>;
}

const STORAGE_KEY = "gemini_api_key";

export default function AiRecommend({ stocks, quotes }: Props) {
  const [result, setResult] = useState<AiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(true);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [savedKey, setSavedKey] = useState("");

  useEffect(() => {
    const k = localStorage.getItem(STORAGE_KEY) ?? "";
    setSavedKey(k);
    setApiKey(k);
  }, []);

  const handleSaveKey = () => {
    localStorage.setItem(STORAGE_KEY, apiKey.trim());
    setSavedKey(apiKey.trim());
    setShowKeyInput(false);
  };

  const handleAsk = async () => {
    if (!savedKey) {
      setShowKeyInput(true);
      return;
    }

    const stocksWithQuotes = stocks
      .filter((s) => quotes[s.symbol])
      .map((s) => ({
        name: s.name,
        symbol: s.symbol,
        market: s.market,
        price: quotes[s.symbol].price,
        changePercent: quotes[s.symbol].changePercent,
      }));

    if (stocksWithQuotes.length === 0) {
      setError("시세 데이터가 로딩될 때까지 기다려주세요");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stocks: stocksWithQuotes, apiKey: savedKey }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm dark:border-violet-900 dark:bg-zinc-900">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-3 bg-violet-50 dark:bg-violet-950/30">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-violet-500" />
          <span className="text-sm font-semibold text-violet-700 dark:text-violet-300">AI 종목 추천</span>
          <span className="text-xs text-violet-400">· 참고용</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowKeyInput((v) => !v); setApiKey(savedKey); }}
            className={`rounded-lg p-1.5 transition-colors ${savedKey ? "text-violet-400 hover:text-violet-600" : "text-amber-400 hover:text-amber-600"}`}
            title="API 키 설정"
          >
            <Settings size={14} />
          </button>
          <button
            onClick={handleAsk}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {loading ? "분석 중…" : result ? "재분석" : "분석하기"}
          </button>
          {result && (
            <button onClick={() => setOpen((v) => !v)} className="text-violet-400 hover:text-violet-600">
              {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
        </div>
      </div>

      {/* API 키 입력 */}
      {showKeyInput && (
        <div className="border-b border-violet-100 px-5 py-3 dark:border-violet-900/50 bg-violet-50/50 dark:bg-violet-950/10">
          <p className="mb-2 text-xs text-violet-600 dark:text-violet-400">
            Gemini API 키를 입력하세요 (무료).{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
            >
              aistudio.google.com에서 발급 →
            </a>
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveKey()}
              placeholder="API 키 입력..."
              className="flex-1 rounded-lg border border-violet-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400 dark:bg-zinc-800 dark:border-zinc-700"
            />
            <button
              onClick={handleSaveKey}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
            >
              저장
            </button>
            <button onClick={() => setShowKeyInput(false)} className="text-zinc-400 hover:text-zinc-600">
              <X size={16} />
            </button>
          </div>
          {savedKey && (
            <p className="mt-1.5 text-[10px] text-green-500">✓ API 키가 저장되어 있습니다</p>
          )}
        </div>
      )}

      {/* 안내 (키 없을 때) */}
      {!savedKey && !showKeyInput && (
        <p className="px-5 py-3 text-xs text-zinc-400">
          <button onClick={() => setShowKeyInput(true)} className="text-violet-500 underline">
            Gemini API 키를 설정
          </button>
          하면 AI 분석을 사용할 수 있습니다. (무료)
        </p>
      )}

      {error && <p className="px-5 py-3 text-sm text-red-500">{error}</p>}

      {result && open && (
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{result.summary}</p>
          <p className="text-xs text-zinc-500 leading-relaxed">{result.analysis}</p>
          {result.recommendations?.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-zinc-400 uppercase tracking-wide">추천 종목</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {result.recommendations.map((rec) => (
                  <div
                    key={rec.symbol}
                    className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-800"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        rec.market === "KR" ? "bg-blue-100 text-blue-600" : "bg-green-100 text-green-600"
                      }`}>
                        {rec.market}
                      </span>
                      <span className="text-sm font-bold">{rec.symbol}</span>
                    </div>
                    <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">{rec.name}</p>
                    <p className="mt-1 text-xs text-zinc-400 leading-relaxed">{rec.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
