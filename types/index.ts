export interface Group {
  id: string;
  name: string;
  userId: string;
  createdAt: number;
  order: number;
  color?: string;
}

export interface Stock {
  id: string;
  symbol: string;
  name: string;
  market: "KR" | "US";
  groupId: string;
  userId: string;
  addedAt: number;
  order?: number;
  memo?: string;
}

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  market: "KR" | "US";
  currency: string;
}
