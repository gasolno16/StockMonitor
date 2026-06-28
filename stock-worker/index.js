// Cloudflare Worker — StockMonitor stock price API
// Routes:
//   GET /stock?symbol=005930&market=KR   → StockQuote JSON
//   GET /chart?symbol=005930&market=KR   → number[] (close prices, intraday)
//   GET /search?q=삼성                    → StockSearchResult[]
//   GET /rate                             → { rate: number } (USD/KRW)

const TWELVE_DATA_KEY = 'de6ed49a2d7a46b982dee8823ae14c3e';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=60',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

// ── Naver Finance (국내 주식) ──────────────────────────────────────
async function fetchNaver(symbol) {
  const res = await fetch(`https://m.stock.naver.com/api/stock/${symbol}/basic`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1' }
  });
  if (!res.ok) throw new Error(`Naver ${res.status}`);
  const d = await res.json();
  if (!d.closePrice) throw new Error('closePrice 없음');
  return {
    name: d.stockName ?? symbol,
    price: parseFloat(d.closePrice.replace(/,/g, '')),
    currency: 'KRW',
    change: parseFloat((d.compareToPreviousClosePrice ?? '0').replace(/,/g, '')),
    changePercent: parseFloat(d.fluctuationsRatio ?? '0'),
  };
}

// ── Naver sise_time 파싱 (국내 분봉) ─────────────────────────────
async function fetchNaverSiseTime(symbol) {
  // 마지막 거래일 확인 (basic API의 localTradedAt 사용)
  const basicRes = await fetch(`https://m.stock.naver.com/api/stock/${symbol}/basic`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1' }
  });
  const basic = await basicRes.json();
  // localTradedAt 예: "2026-06-26T16:10:19+09:00"
  const tradedAt = basic?.localTradedAt ?? '';
  const dateMatch = tradedAt.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dateMatch) throw new Error('no localTradedAt');
  const thistime = `${dateMatch[1]}${dateMatch[2]}${dateMatch[3]}153000`;

  const headers = { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.naver.com/' };
  const prices = [];

  // 페이지 1~10을 병렬로 fetch
  const TOTAL_PAGES = 40; // 하루 전체 (~390분 / 10분/페이지)
  const pages = await Promise.all(
    Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1).map(async page => {
      try {
        const res = await fetch(
          `https://finance.naver.com/item/sise_time.nhn?code=${symbol}&thistime=${thistime}&done=1&page=${page}`,
          { headers }
        );
        if (!res.ok) return { page, prices: [] };
        const html = await res.text();
        const matches = [...html.matchAll(/<td align="center"><span[^>]*>([\d:]+)<\/span><\/td>\s*<td class="num"><span class="tah p11">([\d,]+)<\/span><\/td>/g)];
        // 각 페이지 내 순서는 최신→과거이므로 reverse
        const pagePrices = matches.map(m => parseFloat(m[2].replace(/,/g, ''))).filter(v => v > 0).reverse();
        return { page, prices: pagePrices };
      } catch { return { page, prices: [] }; }
    })
  );

  // 높은 페이지(과거) → 낮은 페이지(최근) 순으로 정렬 후 합치기
  pages.sort((a, b) => b.page - a.page);
  for (const p of pages) prices.push(...p.prices);
  return prices;
}

// ── Yahoo 차트 공통 (interval/range 지정) ─────────────────────────
async function fetchYahooChartByTickerRange(yahooSymbol, interval, range) {
  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': '*/*' }
  });
  const crumb = await crumbRes.text();
  const cookie = crumbRes.headers.get('set-cookie') ?? '';
  const res = await fetch(
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=${range}&crumb=${encodeURIComponent(crumb)}`,
    { headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': cookie } }
  );
  if (!res.ok) throw new Error(`YahooChart ${res.status}`);
  const d = await res.json();
  const closes = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(closes)) throw new Error('no closes');
  return closes.filter(v => v !== null && v !== undefined);
}

// ── Yahoo 5분봉 차트 (KR 주식 포함) ──────────────────────────────
async function fetchYahooChartByTicker(yahooSymbol) {
  return fetchYahooChartByTickerRange(yahooSymbol, '5m', '1d');
}

// ── Yahoo Finance v8 (crumb 포함) ─────────────────────────────────
async function fetchYahoo(yahooSymbol) {
  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': '*/*' }
  });
  const crumb = await crumbRes.text();
  const cookie = crumbRes.headers.get('set-cookie') ?? '';

  const res = await fetch(
    `https://query2.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1d&crumb=${encodeURIComponent(crumb)}`,
    { headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': cookie } }
  );
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const d = await res.json();
  const meta = d?.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) throw new Error('price 없음');
  return {
    name: meta.shortName ?? meta.longName ?? yahooSymbol,
    price: meta.regularMarketPrice,
    currency: meta.currency ?? 'USD',
    change: meta.regularMarketChange ?? 0,
    changePercent: meta.regularMarketChangePercent ?? 0,
  };
}


// ── Twelve Data (미국 주식) ────────────────────────────────────────
async function fetchTwelveData(symbol) {
  const res = await fetch(`https://api.twelvedata.com/quote?symbol=${symbol}&apikey=${TWELVE_DATA_KEY}`);
  if (!res.ok) throw new Error(`TD ${res.status}`);
  const d = await res.json();
  if (d.status === 'error' || !d.close) throw new Error(d.message ?? 'TD error');
  return {
    name: d.name ?? symbol,
    price: parseFloat(d.close),
    currency: d.currency ?? 'USD',
    change: parseFloat(d.change ?? '0'),
    changePercent: parseFloat(d.percent_change ?? '0'),
  };
}

// ── 종목 검색 ─────────────────────────────────────────────────────
const KR_EXCHANGES = new Set(['KSC', 'KSQ', 'KOE', 'KPQ']);
const SUPPORTED_US_QUOTE_TYPES = new Set(['EQUITY', 'ETF']);

async function searchKR(q) {
  try {
    const res = await fetch(`https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15', 'Referer': 'https://finance.naver.com/' }
    });
    if (res.ok) {
      const d = await res.json();
      const items = d?.items ?? [];
      if (items.length > 0) {
        return items
          .filter(item =>
            item.category === 'stock' &&
            item.nationCode === 'KOR' &&
            /^\/domestic\/stock\//.test(item.url ?? '') &&
            /^\d{6}$/.test(item.code ?? '')
          )
          .slice(0, 8)
          .map(item => ({
            symbol: item.code,
            name: item.name,
            market: 'KR',
          }));
      }
    }
  } catch {}

  const res = await fetch(
    `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&lang=ko-KR&region=KR&quotesCount=10&newsCount=0&listsCount=0`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  if (!res.ok) throw new Error(`Yahoo KR search ${res.status}`);
  const d = await res.json();
  return (d?.quotes ?? [])
    .filter(item => item.quoteType === 'EQUITY' && (KR_EXCHANGES.has(item.exchange) || /\.(KS|KQ)$/.test(item.symbol)))
    .slice(0, 8)
    .map(item => ({
      symbol: item.symbol.replace(/\.(KS|KQ)$/, ''),
      name: item.shortname ?? item.longname ?? item.symbol,
      market: 'KR',
    }));
}

async function searchUS(q) {
  const res = await fetch(
    `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&listsCount=0`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  if (!res.ok) throw new Error(`Yahoo search ${res.status}`);
  const d = await res.json();
  return (d?.quotes ?? [])
    .filter(item => SUPPORTED_US_QUOTE_TYPES.has(item.quoteType) && !item.symbol.includes('.'))
    .slice(0, 8)
    .map(item => ({
      symbol: item.symbol,
      name: item.shortname ?? item.longname ?? item.symbol,
      market: 'US',
    }));
}

// ── Main handler ──────────────────────────────────────────────────
export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\//, '');

    // 환율
    if (path === 'rate') {
      try {
        const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=KRW');
        const d = await res.json();
        return json({ rate: d.rates?.KRW ?? 1380 });
      } catch {
        return json({ rate: 1380 });
      }
    }

    // 종목 검색
    if (path === 'search') {
      const q = url.searchParams.get('q') ?? '';
      if (q.length < 1) return json([]);
      const hasKorean = /[가-힣]/.test(q);
      const isDigits = /^\d+$/.test(q);
      try {
        if (hasKorean || isDigits) {
          return json(await searchKR(q));
        } else {
          return json(await searchUS(q));
        }
      } catch (e) {
        return json([]);
      }
    }

    // 디버그: Naver chart API 확인
    if (path === 'debug') {
      const symbol = url.searchParams.get('symbol') ?? '005930';
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://m.stock.naver.com/',
        'Origin': 'https://m.stock.naver.com',
      };
      try {
        const prices = await fetchNaverSiseTime(symbol);
        return json({ count: prices.length, sample: prices.slice(0, 10), last: prices.slice(-5) });
      } catch(e) {
        return json({ error: String(e) });
      }
    }

    // 인트라데이 차트
    if (path === 'chart') {
      const symbol = url.searchParams.get('symbol');
      const market = url.searchParams.get('market');
      if (!symbol) return json({ error: 'symbol required' }, 400);

      const range = url.searchParams.get('range') ?? '1d';

      if (range === '1d' && market === 'KR') {
        // 1순위: Naver sise_time HTML 파싱
        try {
          const prices = await fetchNaverSiseTime(symbol);
          const sampled = prices.filter((_, i) => i % 5 === 0);
          if (sampled.length >= 2) return json({ type: 'data', prices: sampled });
        } catch {}
        // 2순위: Yahoo Finance
        for (const suffix of ['KS', 'KQ']) {
          try {
            const prices = await fetchYahooChartByTicker(`${symbol}.${suffix}`);
            if (prices.length >= 2) return json({ type: 'data', prices });
          } catch {}
        }
        return json({ type: 'none' });
      } else if (range === '1d' && market !== 'KR') {
        try {
          const prices = await fetchYahooChartByTicker(symbol.toUpperCase());
          if (prices.length >= 2) return json({ type: 'data', prices });
        } catch {}
        return json({ type: 'none' });
      } else {
        // 7d / 30d: Yahoo Finance (KR·US 공통)
        const yInterval = range === '7d' ? '60m' : '1d';
        const yRange = range === '7d' ? '7d' : '1mo';
        const tickers = market === 'KR'
          ? [`${symbol}.KS`, `${symbol}.KQ`]
          : [symbol.toUpperCase()];
        for (const ticker of tickers) {
          try {
            const prices = await fetchYahooChartByTickerRange(ticker, yInterval, yRange);
            if (prices.length >= 2) return json({ type: 'data', prices });
          } catch {}
        }
        return json({ type: 'none' });
      }
    }

    // 주식 시세
    const symbol = url.searchParams.get('symbol');
    const market = url.searchParams.get('market');
    if (!symbol) return json({ error: 'symbol required' }, 400);

    const errors = [];

    if (market === 'KR') {
      try { return json({ symbol, market, ...(await fetchNaver(symbol)) }); }
      catch (e) { errors.push(`Naver: ${e}`); }

      for (const suffix of ['KS', 'KQ']) {
        try { return json({ symbol, market, currency: 'KRW', ...(await fetchYahoo(`${symbol}.${suffix}`)) }); }
        catch (e) { errors.push(`Yahoo.${suffix}: ${e}`); }
      }
    } else {
      try { return json({ symbol, market, ...(await fetchTwelveData(symbol.toUpperCase())) }); }
      catch (e) { errors.push(`TD: ${e}`); }

      try { return json({ symbol, market, ...(await fetchYahoo(symbol.toUpperCase())) }); }
      catch (e) { errors.push(`Yahoo: ${e}`); }
    }

    return json({ error: errors.join(' | ') }, 500);
  }
};
