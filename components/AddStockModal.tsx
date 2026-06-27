"use client";
import { useState, useEffect, useRef } from "react";
import Modal from "@/components/ui/Modal";
import { addStock, createGroup } from "@/lib/firestore";
import { fetchQuote } from "@/lib/stockApi";
import { Search, Loader2 } from "lucide-react";
import type { Group, Stock } from "@/types";

interface SearchResult {
  symbol: string;
  name: string;
  market: "KR" | "US";
}

const WORKER_URL = process.env.NEXT_PUBLIC_STOCK_WORKER_URL;

function normalizeGroupName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.")), ms);
    }),
  ]);
}

function detectMarket(q: string): "KR" | "US" | "both" {
  if (/[가-힣]/.test(q)) return "KR";
  if (/^\d+$/.test(q)) return "KR";
  if (/^[A-Za-z]/.test(q)) return "US";
  return "both";
}

async function searchStocks(q: string): Promise<SearchResult[]> {
  if (!WORKER_URL || q.trim().length < 1) return [];
  const market = detectMarket(q);
  const markets: Array<"KR" | "US"> =
    market === "both" ? ["KR", "US"] : [market];

  const results = await Promise.all(
    markets.map(async (m) => {
      try {
        const res = await fetch(
          `${WORKER_URL}/search?q=${encodeURIComponent(q)}&market=${m}`
        );
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? (data as SearchResult[]) : [];
      } catch {
        return [];
      }
    })
  );
  const items = results.flat().slice(0, 10);
  const supported = await Promise.all(
    items.map(async (item) => {
      const quote = await fetchQuote(item.symbol, item.market);
      return quote ? item : null;
    })
  );
  return supported.filter((item): item is SearchResult => item !== null);
}

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  groupId?: string;
  existingSymbols?: string[];
  groups?: Group[];
  allStocks?: Stock[];
  nextGroupOrder?: number;
  onFolderCreated?: (groupId: string) => void;
  onStockAdded?: (groupId: string) => void;
}

export default function AddStockModal({
  open,
  onClose,
  groupId,
  userId,
  existingSymbols = [],
  groups = [],
  allStocks = [],
  nextGroupOrder = 0,
  onFolderCreated,
  onStockAdded,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedStock, setSelectedStock] = useState<SearchResult | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [pendingGroupName, setPendingGroupName] = useState("");
  const completedCreateRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setError("");
      setActiveIndex(-1);
      setSelectedStock(null);
      setNewGroupName("");
      setPendingGroupName("");
      setCreatingGroup(false);
      completedCreateRef.current = false;
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const finishAndClose = () => {
    setSelectedStock(null);
    setNewGroupName("");
    setPendingGroupName("");
    setCreatingGroup(false);
    onClose();
  };

  useEffect(() => {
    if (!creatingGroup || !pendingGroupName || !selectedStock || completedCreateRef.current) return;
    const createdGroup = groups.find((group) => normalizeGroupName(group.name) === normalizeGroupName(pendingGroupName));
    if (!createdGroup) return;

    completedCreateRef.current = true;
    withTimeout(addStock(userId, createdGroup.id, selectedStock.symbol, selectedStock.name, selectedStock.market), 12000)
      .then(() => {
        onFolderCreated?.(createdGroup.id);
        finishAndClose();
      })
      .catch((err) => {
        completedCreateRef.current = false;
        setError(err instanceof Error ? err.message : "오류가 발생했습니다");
        setCreatingGroup(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, creatingGroup, pendingGroupName, selectedStock]);

  useEffect(() => {
    let cancelled = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.trim().length === 0) {
      setResults([]);
      setActiveIndex(-1);
      setSearching(false);
      return;
    }
    setSearching(true);
    timerRef.current = setTimeout(async () => {
      const res = await searchStocks(query);
      if (cancelled) return;
      setResults(res);
      setActiveIndex(-1);
      setSearching(false);
    }, 300);
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  // 활성 항목 스크롤
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelectorAll("[data-item]")[activeIndex] as HTMLElement;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleSelect = async (item: SearchResult) => {
    if (existingSymbols.includes(item.symbol)) {
      setError(`"${item.name} (${item.symbol})"은(는) 이미 이 폴더에 있습니다.`);
      return;
    }
    setAdding(item.symbol);
    setError("");
    try {
      const quote = await fetchQuote(item.symbol, item.market);
      if (!quote) {
        setError(`"${item.name} (${item.symbol})"은(는) 현재 지원하지 않는 종목입니다.`);
        return;
      }
      if (!groupId) {
        setSelectedStock(item);
        setFocused(false);
        setQuery("");
        setResults([]);
        return;
      }
      await addStock(userId, groupId, item.symbol, item.name, item.market);
      setQuery("");
      setResults([]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다");
    } finally {
      setAdding(null);
    }
  };

  const handleAddToGroup = async (targetGroupId: string) => {
    if (!selectedStock) return;
    const duplicate = allStocks.some(
      (stock) => stock.groupId === targetGroupId && stock.symbol === selectedStock.symbol
    );
    if (duplicate) return;

    setAdding(targetGroupId);
    setError("");
    try {
      await addStock(userId, targetGroupId, selectedStock.symbol, selectedStock.name, selectedStock.market);
      onStockAdded?.(targetGroupId);
      setSelectedStock(null);
      setNewGroupName("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다");
    } finally {
      setAdding(null);
    }
  };

  const handleCreateGroupAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newGroupName.trim();
    if (!selectedStock || !trimmedName) return;
    const duplicated = !creatingGroup && groups.some((group) => normalizeGroupName(group.name) === normalizeGroupName(trimmedName));
    if (duplicated) {
      setError("이미 같은 이름의 폴더가 있습니다.");
      return;
    }

    setCreatingGroup(true);
    setError("");
    setPendingGroupName(trimmedName);
    completedCreateRef.current = false;
    try {
      const ref = await withTimeout(createGroup(userId, trimmedName, nextGroupOrder), 12000);
      if (completedCreateRef.current) return;
      completedCreateRef.current = true;
      await withTimeout(addStock(userId, ref.id, selectedStock.symbol, selectedStock.name, selectedStock.market), 12000);
      onFolderCreated?.(ref.id);
      finishAndClose();
    } catch (err) {
      if (completedCreateRef.current) return;
      setError(err instanceof Error ? err.message : "오류가 발생했습니다");
    } finally {
      if (!completedCreateRef.current) setCreatingGroup(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && results[activeIndex]) {
        handleSelect(results[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setFocused(false);
    }
  };

  const showDropdown = !selectedStock && focused && query.trim().length > 0;

  return (
    <Modal open={open} onClose={onClose} title="주식 추가">
      <div className="space-y-3">
        {selectedStock ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-800">
              <p className="text-xs text-zinc-400">선택한 종목</p>
              <div className="mt-1 flex items-center gap-2">
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${selectedStock.market === "KR" ? "bg-blue-100 text-blue-600" : "bg-green-100 text-green-600"}`}>
                  {selectedStock.market}
                </span>
                <span className="text-sm font-semibold">{selectedStock.symbol}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-500">{selectedStock.name}</span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-500">추가할 폴더</p>
              {groups.length === 0 ? (
                <p className="rounded-xl bg-zinc-50 px-3 py-3 text-sm text-zinc-400 dark:bg-zinc-800">
                  폴더가 없습니다. 새 폴더를 만들어 추가하세요.
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto rounded-xl border border-zinc-100 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                  {groups.map((group) => {
                    const duplicate = allStocks.some(
                      (stock) => stock.groupId === group.id && stock.symbol === selectedStock.symbol
                    );
                    return (
                      <button
                        key={group.id}
                        type="button"
                        disabled={duplicate || adding === group.id || creatingGroup}
                        onClick={() => handleAddToGroup(group.id)}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400 dark:hover:bg-zinc-800 dark:disabled:bg-zinc-800/60"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium">{group.name}</span>
                        {duplicate && (
                          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">이미 있음</span>
                        )}
                        {adding === group.id && (
                          <Loader2 size={14} className="shrink-0 animate-spin text-zinc-400" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <form onSubmit={handleCreateGroupAndAdd} className="flex gap-2">
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="새 폴더 이름"
                className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-700"
              />
              <button
                type="submit"
                disabled={!newGroupName.trim() || creatingGroup || groups.some((group) => normalizeGroupName(group.name) === normalizeGroupName(newGroupName))}
                className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {creatingGroup ? "추가 중..." : "폴더 추가"}
              </button>
            </form>

            <button
              type="button"
              onClick={() => {
                setSelectedStock(null);
                setError("");
                setTimeout(() => inputRef.current?.focus(), 50);
              }}
              className="text-xs font-medium text-zinc-400 hover:text-zinc-600"
            >
              다른 종목 선택
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100">
                {searching
                  ? <Loader2 size={16} className="shrink-0 animate-spin text-zinc-400" />
                  : <Search size={16} className="shrink-0 text-zinc-400" />
                }
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setTimeout(() => setFocused(false), 150)}
                  onKeyDown={handleKeyDown}
                  placeholder="종목명 또는 코드 검색 (삼성전자, AAPL …)"
                  className="flex-1 bg-transparent text-sm focus:outline-none"
                />
              </div>

              {showDropdown && (
                <div ref={listRef} className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-xl">
                  {results.length === 0 && searching && (
                    <div className="py-4 text-center text-sm text-zinc-400">검색 중...</div>
                  )}

                  {results.map((item, idx) => {
                    const alreadyExists = groupId
                      ? existingSymbols.includes(item.symbol)
                      : allStocks.some((stock) => stock.symbol === item.symbol);
                    const isActive = idx === activeIndex;
                    return (
                      <button
                        key={`${item.market}-${item.symbol}`}
                        data-item
                        onMouseDown={() => handleSelect(item)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        disabled={adding === item.symbol}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-50 ${isActive ? "bg-blue-50" : "hover:bg-zinc-50"}`}
                      >
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${item.market === "KR" ? "bg-blue-100 text-blue-600" : "bg-green-100 text-green-600"}`}>
                          {item.market}
                        </span>
                        <span className="font-semibold text-sm">{item.symbol}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-zinc-500">{item.name}</span>
                        {alreadyExists && (
                          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">이미 있음</span>
                        )}
                        {adding === item.symbol && (
                          <Loader2 size={14} className="shrink-0 animate-spin text-zinc-400" />
                        )}
                      </button>
                    );
                  })}

                  {results.length === 0 && !searching && (
                    <div className="py-4 text-center text-sm text-zinc-400">
                      검색 결과가 없습니다
                    </div>
                  )}
                </div>
              )}
            </div>

            <p className="text-xs text-zinc-400">
              국내: 종목명 또는 6자리 코드 &nbsp;·&nbsp; 미국: 영문 티커
            </p>
          </>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-500 hover:bg-zinc-100">
            닫기
          </button>
        </div>
      </div>
    </Modal>
  );
}
