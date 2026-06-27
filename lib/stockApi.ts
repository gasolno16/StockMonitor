import type { StockQuote } from "@/types";

const WORKER_URL = process.env.NEXT_PUBLIC_STOCK_WORKER_URL;

async function fetchKR(symbol: string): Promise<StockQuote | null> {
  if (!WORKER_URL) return null;
  // Try /stock?symbol=...&market=KR endpoint (Worker fetches Naver internally)
  try {
    const res = await fetch(`${WORKER_URL}/stock?symbol=${encodeURIComponent(symbol)}&market=KR`);
    if (res.ok) {
      const d = await res.json();
      if (!d.error && d.price) {
        return {
          symbol,
          name: d.name ?? symbol,
          price: Number(d.price),
          change: Number(d.change ?? 0),
          changePercent: Number(d.changePercent ?? 0),
          market: "KR",
          currency: "KRW",
        };
      }
    }
  } catch {}
  // Fallback: direct Naver Finance API
  try {
    const naverRes = await fetch(
      `https://m.stock.naver.com/api/stock/${symbol}/basic`
    );
    if (naverRes.ok) {
      const d = await naverRes.json();
      const price = Number(String(d.closePrice).replace(/,/g, ""));
      const change = Number(String(d.compareToPreviousClosePrice).replace(/,/g, ""));
      const changePercent = Number(d.fluctuationsRatio);
      if (price) {
        return { symbol, name: d.stockName ?? symbol, price, change, changePercent, market: "KR", currency: "KRW" };
      }
    }
  } catch {}
  // Fallback: Worker Yahoo Finance (change may be 0)
  try {
    const res = await fetch(`${WORKER_URL}/?symbol=${symbol}.KS`);
    if (!res.ok) return null;
    const d = await res.json();
    if (d.error) return null;
    return {
      symbol,
      name: d.name ?? symbol,
      price: Number(d.price ?? 0),
      change: Number(d.change ?? 0),
      changePercent: Number(d.changePercent ?? 0),
      market: "KR",
      currency: "KRW",
    };
  } catch { return null; }
}

async function fetchUS(symbol: string): Promise<StockQuote | null> {
  if (!WORKER_URL) return null;
  // Try /stock?symbol=...&market=US endpoint first
  try {
    const res = await fetch(`${WORKER_URL}/stock?symbol=${encodeURIComponent(symbol)}&market=US`);
    if (res.ok) {
      const d = await res.json();
      if (!d.error && d.price) {
        return {
          symbol,
          name: d.name ?? symbol,
          price: Number(d.price),
          change: Number(d.change ?? 0),
          changePercent: Number(d.changePercent ?? 0),
          market: "US",
          currency: d.currency ?? "USD",
        };
      }
    }
  } catch {}
  // Fallback: legacy /?symbol= endpoint
  try {
    const res = await fetch(`${WORKER_URL}/?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) return null;
    const d = await res.json();
    if (d.error) return null;
    return {
      symbol,
      name: d.name ?? symbol,
      price: Number(d.price ?? 0),
      change: Number(d.change ?? 0),
      changePercent: Number(d.changePercent ?? 0),
      market: "US",
      currency: d.currency ?? "USD",
    };
  } catch { return null; }
}

export async function fetchQuote(symbol: string, market: "KR" | "US"): Promise<StockQuote | null> {
  return market === "KR" ? fetchKR(symbol) : fetchUS(symbol);
}

export type SparklineData =
  | { type: "image"; url: string }
  | { type: "data"; prices: number[] }
  | { type: "none" };

export type ChartRange = "1d" | "7d" | "30d";

export async function fetchSparkline(symbol: string, market: "KR" | "US", range: ChartRange = "1d"): Promise<SparklineData> {
  if (!WORKER_URL) return { type: "none" };
  try {
    const res = await fetch(`${WORKER_URL}/chart?symbol=${encodeURIComponent(symbol)}&market=${market}&range=${range}`);
    if (!res.ok) return { type: "none" };
    const data = await res.json();
    return data as SparklineData;
  } catch {
    return { type: "none" };
  }
}

export async function fetchQuotes(stocks: { symbol: string; market: "KR" | "US" }[]) {
  const results = await Promise.all(stocks.map((s) => fetchQuote(s.symbol, s.market)));
  const map: Record<string, StockQuote> = {};
  results.forEach((q) => { if (q) map[q.symbol] = q; });
  return map;
}
