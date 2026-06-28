"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { renameGroup } from "@/lib/firestore";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import TrendIcon from "@/components/TrendIcon";
import type { Group, Stock, StockQuote } from "@/types";
import type { ChartRange } from "@/lib/stockApi";

interface Props {
  group: Group;
  stocks: Stock[];
  quotes: Record<string, StockQuote>;
  sparklines: Record<string, number[]>;
  range: ChartRange;
  onDeleteGroup: (group: Group, stocks: Stock[]) => Promise<void>;
}

export default function GroupCard({ group, stocks, quotes, sparklines, range, onDeleteGroup }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(group.name);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // range에 따라 등락률·금액 계산
  const stocksWithData = stocks.filter((s) => {
    if (range === "1d") return !!quotes[s.symbol];
    return !!(sparklines[s.symbol]?.length >= 2);
  });

  const getPct = (s: Stock) => {
    if (range === "1d") return quotes[s.symbol]?.changePercent ?? 0;
    const prices = sparklines[s.symbol];
    if (!prices || prices.length < 2) return 0;
    return ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100;
  };

  const avgPct = stocksWithData.length > 0
    ? stocksWithData.reduce((sum, s) => sum + getPct(s), 0) / stocksWithData.length
    : null;
  const isUp = (avgPct ?? 0) >= 0;

  const upCount = stocksWithData.filter((s) => getPct(s) > 0).length;
  const downCount = stocksWithData.filter((s) => getPct(s) < 0).length;
  const flatCount = stocksWithData.filter((s) => getPct(s) === 0).length;

  const handleRename = async () => {
    if (editName.trim() && editName !== group.name) {
      await renameGroup(group.id, editName.trim());
    }
    setEditing(false);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  return (
    <div
      className="flex flex-col rounded-2xl border border-zinc-100 bg-white shadow-sm cursor-pointer hover:shadow-md transition-shadow dark:border-zinc-800 dark:bg-zinc-900"
      onClick={() => !editing && router.push(`/group?id=${group.id}&range=${range}`)}
    >
      {/* 카드 헤더 */}
      <div className="flex items-center justify-between rounded-t-2xl border-b border-zinc-100 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2 min-w-0">
          {editing ? (
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              onClick={(e) => e.stopPropagation()}
              className="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-2 py-0.5 text-sm font-semibold focus:outline-none"
            />
          ) : (
            <span className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              {group.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 ml-2" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setEditing(true)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-black/5">
            <Pencil size={13} />
          </button>
          <button onClick={handleDelete} className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* 요약 통계 */}
      <div className="flex flex-col px-4 py-4">
        {stocks.length === 0 ? (
          <p className="text-sm text-zinc-400">종목을 추가하려면 클릭하세요</p>
        ) : avgPct !== null ? (
          <>
            {/* 평균 등락률 + 종목 현황 */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="mb-0.1 text-[13px] text-zinc-600">
                  총 {stocks.length}가지 종목의 평균 등락률
                </p>
                <p className={`flex items-baseline gap-1 text-3xl font-bold tracking-tight ${isUp ? "text-red-500" : "text-blue-500"}`}>
                  <TrendIcon direction={isUp ? "up" : "down"} className="h-6 w-6" />
                  <span>{Math.abs(avgPct).toFixed(2)}%</span>
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 text-xs font-semibold self-center leading-none">
                <span className="flex items-center gap-1 text-red-500">
                  {upCount}개 종목
                  <TrendIcon direction="up" className="h-3 w-3.5" />
                </span>
                <span className="flex items-center gap-1 text-zinc-600">
                  {flatCount}개 종목
                  <TrendIcon direction="flat" className="h-3 w-3.5" />
                </span>
                <span className="flex items-center gap-1 text-blue-500">
                  {downCount}개 종목
                  <TrendIcon direction="down" className="h-3 w-3.5" />
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <div className="h-4 w-16 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-8 w-32 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-6 w-24 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="폴더 삭제"
        message={`"${group.name}" 폴더와 안의 주식을 모두 삭제할까요?`}
        confirmLabel="삭제"
        danger
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={async () => {
          setShowDeleteConfirm(false);
          await onDeleteGroup(group, stocks);
        }}
      />
    </div>
  );
}
