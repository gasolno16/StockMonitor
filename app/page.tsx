"use client";
export const dynamic = "force-dynamic";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Plus, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useStockData } from "@/hooks/useStockData";
import { subscribeGroups, subscribeStocks } from "@/lib/firestore";
import GroupCard from "@/components/GroupCard";
import CreateGroupModal from "@/components/CreateGroupModal";
import AddStockModal from "@/components/AddStockModal";
import Button from "@/components/ui/Button";
import type { Group, Stock } from "@/types";
import { fetchSparkline, type ChartRange } from "@/lib/stockApi";
import { getRangeTabButtonStyle, getRangeTabRadius, getRangeTabStyle, RANGE_TAB_CONTAINER_HEIGHT, RANGE_TAB_RADIUS } from "@/lib/rangeTabs";

const RANGES: { label: string; value: ChartRange }[] = [
  { label: "1일", value: "1d" },
  { label: "7일", value: "7d" },
  { label: "30일", value: "30d" },
];

type FolderToast = {
  groupId: string;
  message: string;
};

function PageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
    </div>
  );
}

function HomeContent() {
  const { user, loading, login, logout } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddStock, setShowAddStock] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [folderToast, setFolderToast] = useState<FolderToast | null>(null);
  const [range, setRange] = useState<ChartRange>((searchParams.get("range") as ChartRange) ?? "1d");
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});
  const addMenuRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { quotes } = useStockData(stocks);

  useEffect(() => {
    if (!user) return;
    const u1 = subscribeGroups(user.uid, setGroups);
    const u2 = subscribeStocks(user.uid, setStocks);
    return () => { u1(); u2(); };
  }, [user?.uid]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (range === "1d" || stocks.length === 0) { setSparklines({}); return; }
    stocks.forEach((s) => {
      fetchSparkline(s.symbol, s.market, range).then((data) => {
        if (data.type === "data" && data.prices.length >= 2) {
          setSparklines((prev) => ({ ...prev, [s.symbol]: data.prices }));
        }
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks.map((s) => s.symbol).join(","), range]);

  const handleRangeChange = (r: ChartRange) => {
    setRange(r);
    router.replace(`/?range=${r}`);
  };

  const showFolderToast = (groupId: string, message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setFolderToast({ groupId, message });
    toastTimerRef.current = setTimeout(() => setFolderToast(null), 7000);
  };

  const dismissFolderToast = () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setFolderToast(null);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/light.svg" alt="" className="mx-auto mb-4 h-10 w-auto" />
          <h1 className="text-3xl font-bold text-zinc-900">StockMonitor</h1>
          <p className="mt-2 text-zinc-500">관심 주식을 그룹으로 관리하세요</p>
        </div>
        <Button onClick={login} className="gap-2 px-6 py-3 text-base">
          Google로 시작하기
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* 헤더 */}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full items-center justify-between sm:w-auto">
            <span className="flex min-w-0 items-center gap-2 text-xl font-bold">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo/light.svg" alt="" className="h-5 w-auto shrink-0" />
              <span className="truncate">StockMonitor</span>
            </span>
            <div className="flex items-center gap-2 sm:hidden">
              {user.photoURL && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.photoURL} alt="" className="h-8 w-8 rounded-full" />
              )}
              <button onClick={logout} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <LogOut size={15} />
              </button>
            </div>
          </div>
          <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
            {/* 전역 기간 탭 */}
            <div className={`flex ${RANGE_TAB_RADIUS.container} border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-800`}>
              {RANGES.map((r, index) => (
                <button
                  key={r.value}
                  onClick={() => handleRangeChange(r.value)}
                  style={getRangeTabButtonStyle()}
                  className={`relative text-xs font-medium transition-colors ${
                    range === r.value
                      ? "text-white"
                      : `${getRangeTabRadius(index, RANGES.length, false)} text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300`
                  }`}
                >
                  {range === r.value && (
                    <span
                      className={`absolute inset-0 ${getRangeTabRadius(index, RANGES.length, true)} bg-blue-600 shadow-sm`}
                      style={getRangeTabStyle(index, RANGES.length, true)}
                    />
                  )}
                  <span className="relative">{r.label}</span>
                </button>
              ))}
            </div>
            <div ref={addMenuRef} className="relative">
              <button
                onClick={() => setShowAddMenu((open) => !open)}
                style={{ height: `${RANGE_TAB_CONTAINER_HEIGHT}px` }}
                className="flex items-center gap-1.5 rounded-full bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Plus size={15} /> 추가
              </button>
              {showAddMenu && (
                <div className="absolute right-0 top-11 z-50 min-w-[140px] rounded-xl border border-zinc-100 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                  <button
                    onClick={() => {
                      setShowAddMenu(false);
                      setShowCreate(true);
                    }}
                    className="flex w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    폴더 추가
                  </button>
                  <button
                    onClick={() => {
                      setShowAddMenu(false);
                      setShowAddStock(true);
                    }}
                    className="flex w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    주식 추가
                  </button>
                </div>
              )}
            </div>
            <div className="hidden items-center gap-3 sm:flex">
              {user.photoURL && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.photoURL} alt="" className="h-8 w-8 rounded-full" />
              )}
              <button onClick={logout} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <div className="text-6xl">📂</div>
            <p className="text-lg font-medium text-zinc-600 dark:text-zinc-400">
              폴더를 만들어 주식을 추가해보세요
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Plus size={15} /> 첫 폴더 만들기
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                stocks={stocks.filter((s) => s.groupId === group.id)}
                quotes={quotes}
                sparklines={sparklines}
                range={range}
                userId={user.uid}
              />
            ))}
          </div>
        )}
      </main>

      <CreateGroupModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        userId={user.uid}
        nextOrder={groups.length}
        existingNames={groups.map((group) => group.name)}
        existingGroups={groups.map((group) => ({ id: group.id, name: group.name }))}
        onCreated={(groupId) => showFolderToast(groupId, "생성되었습니다.")}
      />
      <AddStockModal
        open={showAddStock}
        onClose={() => setShowAddStock(false)}
        userId={user.uid}
        groups={groups}
        allStocks={stocks}
        nextGroupOrder={groups.length}
        onFolderCreated={(groupId) => showFolderToast(groupId, "생성되었습니다.")}
        onStockAdded={(groupId) => showFolderToast(groupId, "추가되었습니다.")}
      />

      {folderToast && (
        <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
          <p className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-200">
            {folderToast.message}
          </p>
          <button
            onClick={() => {
              const targetGroupId = folderToast.groupId;
              dismissFolderToast();
              router.push(`/group/${targetGroupId}?range=${range}`);
            }}
            className="shrink-0 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            폴더로 이동
          </button>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<PageLoading />}>
      <HomeContent />
    </Suspense>
  );
}
