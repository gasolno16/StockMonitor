"use client";
import { useEffect, useRef, useState } from "react";
import { fetchQuotes } from "@/lib/stockApi";
import type { Stock, StockQuote } from "@/types";

const REFRESH_INTERVAL = 60_000;

export function useStockData(stocks: Stock[]) {
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const keyRef = useRef("");

  const refresh = async (list: Stock[] = stocks) => {
    if (list.length === 0) return;
    setLoading(true);
    const result = await fetchQuotes(list.map((s) => ({ symbol: s.symbol, market: s.market })));
    setQuotes(result);
    setLoading(false);
  };

  useEffect(() => {
    const key = stocks.map((s) => s.symbol).join(",");
    if (key === keyRef.current) return;
    keyRef.current = key;
    refresh(stocks);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => refresh(stocks), REFRESH_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks.map((s) => s.symbol).join(",")]);

  return { quotes, loading, refresh: () => refresh(stocks) };
}
