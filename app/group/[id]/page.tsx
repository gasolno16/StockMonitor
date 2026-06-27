"use client";
export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Plus, GripVertical, Pencil, Trash2, FileText } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "@/hooks/useAuth";
import { useStockData } from "@/hooks/useStockData";
import {
  subscribeGroups, subscribeStocks, deleteStock, moveStock, renameGroup, reorderStocks, updateStockMemo,
} from "@/lib/firestore";
import { fetchSparkline, type SparklineData, type ChartRange } from "@/lib/stockApi";
import { getRangeTabButtonStyle, getRangeTabRadius, getRangeTabStyle, RANGE_TAB_CONTAINER_HEIGHT, RANGE_TAB_RADIUS } from "@/lib/rangeTabs";
import Sparkline from "@/components/Sparkline";
import AddStockModal from "@/components/AddStockModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import TrendIcon from "@/components/TrendIcon";
import type { Group, Stock } from "@/types";

const RANGES: { label: string; value: ChartRange }[] = [
  { label: "1일", value: "1d" },
  { label: "7일", value: "7d" },
  { label: "30일", value: "30d" },
];

type MoveToast = {
  stockId: string;
  fromGroupId: string;
  targetGroupId: string;
  targetGroupName: string;
};

function formatPrice(price: number, currency: string) {
  return currency === "KRW"
    ? price.toLocaleString("ko-KR") + "원"
    : "$" + price.toFixed(2);
}

// ── 이동 드롭다운 ──────────────────────────────────────────
function MoveMenu({
  stock, groups, currentGroupId, allStocks, onMove,
}: {
  stock: Stock;
  groups: Group[];
  currentGroupId: string;
  allStocks: Stock[];
  onMove: (groupId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const others = groups.filter((g) => g.id !== currentGroupId);
  if (others.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg p-0.5 text-zinc-300 hover:text-blue-500 dark:text-zinc-600 sm:p-1"
        title="다른 폴더로 이동"
      >
        <ArrowRight size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-50 min-w-[140px] rounded-xl border border-zinc-100 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">이동할 폴더</p>
          {others.map((g) => {
            const duplicate = allStocks.some(
              (s) => s.groupId === g.id && s.symbol === stock.symbol
            );
            return (
              <button
                key={g.id}
                disabled={duplicate}
                onClick={() => {
                  onMove(g.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400 dark:hover:bg-zinc-800 dark:disabled:bg-zinc-800/60"
              >
                <span className="h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                <span className="flex-1 text-left">{g.name}</span>
                {duplicate && (
                  <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-medium text-amber-600">이미 있음</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── 드래그 가능한 종목 행 ──────────────────────────────────
function SortableStockRow({
  stock, quotes, quoteLoading, sparklines, sparkLoading, range, periodLabel,
  groups, currentGroupId, allStocks, onDelete, onMove,
}: {
  stock: Stock;
  quotes: ReturnType<typeof useStockData>["quotes"];
  quoteLoading: boolean;
  sparklines: Record<string, SparklineData>;
  sparkLoading: boolean;
  range: ChartRange;
  periodLabel: string;
  groups: Group[];
  currentGroupId: string;
  allStocks: Stock[];
  onDelete: () => void;
  onMove: (groupId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stock.id });
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showMemoModal, setShowMemoModal] = useState(false);
  const [memoDraft, setMemoDraft] = useState(stock.memo ?? "");
  const rowRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const q = quotes[stock.symbol];
  const sl = sparklines[stock.symbol];
  const sparkPrices = sl?.type === "data" ? sl.prices : null;
  const periodPct = sparkPrices && sparkPrices.length >= 2
    ? ((sparkPrices[sparkPrices.length - 1] - sparkPrices[0]) / sparkPrices[0]) * 100
    : null;
  const periodChange = sparkPrices && sparkPrices.length >= 2
    ? sparkPrices[sparkPrices.length - 1] - sparkPrices[0]
    : null;
  const displayPct = range === "1d" ? (q?.changePercent ?? null) : periodPct;
  const displayChange = range === "1d" ? (q?.change ?? null) : periodChange;
  const isUp = displayPct !== null ? displayPct >= 0 : (q?.change ?? 0) >= 0;
  const movableGroups = groups.filter((g) => g.id !== currentGroupId);

  useEffect(() => {
    function handler(e: PointerEvent) {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setShowMobileActions(false);
      }
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, []);

  const setRefs = (node: HTMLDivElement | null) => {
    rowRef.current = node;
    setNodeRef(node);
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startLongPress = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return;
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      setShowMobileActions(true);
    }, 520);
  };

  const longPressHandlers = {
    onPointerDown: startLongPress,
    onPointerUp: clearLongPressTimer,
    onPointerCancel: clearLongPressTimer,
    onPointerLeave: clearLongPressTimer,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      setShowMobileActions(true);
    },
  };

  const openMemoModal = () => {
    setMemoDraft(stock.memo ?? "");
    setShowMemoModal(true);
  };

  const saveMemo = async () => {
    await updateStockMemo(stock.id, memoDraft.trim());
    setShowMemoModal(false);
  };

  return (
    <div
      ref={setRefs}
      style={style}
      className={`relative grid min-w-0 grid-cols-[auto_minmax(0,1fr)_minmax(120px,auto)] items-start gap-x-2 gap-y-2 border-b border-zinc-50 px-3 py-3 dark:border-zinc-800 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-3 ${
        isDragging
          ? "overflow-hidden rounded-[32px] border-transparent bg-white shadow-lg dark:bg-zinc-900"
          : "first:rounded-t-2xl last:rounded-b-2xl last:border-0"
      }`}
    >
      {/* 드래그 핸들 */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-zinc-300 hover:text-zinc-500 dark:text-zinc-700 active:cursor-grabbing"
      >
        <GripVertical size={15} />
      </button>

      {/* 종목명 */}
      <div className="min-w-0 select-none" {...longPressHandlers}>
        <p className="truncate text-lg font-bold text-zinc-800 dark:text-zinc-100">{stock.name}</p>
        <p
          className={`mt-1 w-full overflow-hidden break-words pr-2 text-xs leading-5 ${stock.memo?.trim() ? "text-zinc-500" : "text-zinc-300"}`}
          style={{
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 3,
          }}
        >
          {stock.memo?.trim() || "메모 없음"}
        </p>
      </div>

      {/* 스파크라인 + 가격 */}
      <div
        className="flex min-w-0 select-none flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-[10px]"
        {...longPressHandlers}
      >
        {sparkLoading && !sparklines[stock.symbol] ? (
          <span className="w-20 shrink-0 text-center text-[10px] text-zinc-400 sm:w-36">Loading…</span>
        ) : sl?.type === "data" ? (
          <>
            <span className="shrink-0 sm:hidden">
              <Sparkline data={sparkPrices!} positive={isUp} width={82} height={28} />
            </span>
            <span className="hidden shrink-0 sm:block">
              <Sparkline data={sparkPrices!} positive={isUp} width={140} height={44} />
            </span>
          </>
        ) : null}
        {q ? (
          <div className="min-w-0 flex-1 text-right sm:w-auto sm:flex-none">
            <p className="text-md font-bold">{formatPrice(q.price, q.currency)}</p>
            {displayPct !== null && (
              <p className={`flex items-baseline justify-end gap-0 text-md font-bold font-medium ${isUp ? "text-red-500" : "text-blue-500"}`}>
                <TrendIcon direction={isUp ? "up" : "down"} className="mr-1 h-2.5 w-2.5"/>
                 <span className="font-bold">{Math.abs(displayPct).toFixed(2)}%</span>
                <span className="ml-0.0 text-[15px] text-black">({periodLabel})</span>
              </p>
            )}
            {displayChange !== null && (
              <p className={`text-[13px] font-bold ${isUp ? "text-red-400" : "text-blue-400"}`}>
                {isUp ? "+" : ""}{formatPrice(displayChange, q.currency)}
              </p>
            )}
          </div>
        ) : quoteLoading ? (
          <div className="h-10 w-28 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        ) : (
          <div className="min-w-0 flex-1 text-right sm:w-auto sm:flex-none">
            <p className="text-xs font-semibold text-zinc-400">시세 없음</p>
            <p className="text-[10px] text-zinc-300">지원 안 됨</p>
          </div>
        )}

      </div>

      {/* 데스크톱 액션 */}
      <div className="hidden flex-col items-center gap-0 sm:flex">
        <button
          onClick={openMemoModal}
          className="rounded-lg p-1 text-zinc-300 hover:text-zinc-600 dark:text-zinc-600"
          title="메모"
        >
          <FileText size={14} />
        </button>
        <MoveMenu stock={stock} groups={groups} currentGroupId={currentGroupId} allStocks={allStocks} onMove={onMove} />
        <button
          onClick={onDelete}
          className="rounded-lg p-1 text-zinc-300 hover:text-red-500 dark:text-zinc-600"
          title="삭제"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {showMobileActions && (
        <div className="col-span-3 col-start-1 mt-1 overflow-hidden rounded-xl border border-zinc-100 bg-white py-1 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 sm:hidden">
          <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">작업</p>
          <button
            onClick={() => {
              setShowMobileActions(false);
              openMemoModal();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <FileText size={12} />
            <span>메모</span>
          </button>
          <button
            onClick={() => {
              setShowMobileActions(false);
              setShowMoveModal(true);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400 dark:hover:bg-zinc-800"
            disabled={movableGroups.length === 0}
          >
            <ArrowRight size={12} />
            <span>이동</span>
          </button>
          <button
            onClick={() => {
              setShowMobileActions(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            <Trash2 size={12} />
            <span>삭제</span>
          </button>
        </div>
      )}

      {showMoveModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/30 px-4 pb-4 sm:hidden">
          <div className="w-full overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-900">
            <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">이동할 폴더</p>
              <p className="mt-0.5 text-xs text-zinc-400">{stock.name}</p>
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {movableGroups.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-zinc-400">이동 가능한 폴더가 없습니다</p>
              ) : (
                movableGroups.map((g) => {
                  const duplicate = allStocks.some(
                    (s) => s.groupId === g.id && s.symbol === stock.symbol
                  );
                  return (
                    <button
                      key={g.id}
                      disabled={duplicate}
                      onClick={() => {
                        onMove(g.id);
                        setShowMoveModal(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400 dark:hover:bg-zinc-800 dark:disabled:bg-zinc-800/60"
                    >
                      <ArrowRight size={14} />
                      <span className="min-w-0 flex-1 truncate text-left">{g.name}</span>
                      {duplicate && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">이미 있음</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
            <button
              onClick={() => setShowMoveModal(false)}
              className="w-full border-t border-zinc-100 px-4 py-3 text-sm font-medium text-zinc-500 dark:border-zinc-800"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {showMemoModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/30 px-4 pb-4 sm:items-center sm:justify-center sm:p-4">
          <div className="w-full rounded-2xl bg-white p-4 shadow-2xl dark:bg-zinc-900 sm:max-w-md">
            <div className="mb-3">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">메모</p>
              <p className="mt-0.5 text-xs text-zinc-400">{stock.name}</p>
            </div>
            <textarea
              value={memoDraft}
              onChange={(e) => setMemoDraft(e.target.value)}
              placeholder="메모를 입력하세요"
              className="h-28 w-full resize-none rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-800"
              maxLength={200}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setShowMemoModal(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                취소
              </button>
              <button
                onClick={saveMemo}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
    </div>
  );
}

// ── 메인 페이지 ────────────────────────────────────────────
function GroupDetailContent() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const rangeParam = (searchParams.get("range") ?? "1d") as ChartRange;
  const [range, setRange] = useState<ChartRange>(rangeParam);

  const [group, setGroup] = useState<Group | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [allStocks, setAllStocks] = useState<Stock[]>([]);
  const [sparklines, setSparklines] = useState<Record<string, SparklineData>>({});
  const [sparkLoading, setSparkLoading] = useState(false);
  const [showAddStock, setShowAddStock] = useState(false);
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [moveToast, setMoveToast] = useState<MoveToast | null>(null);
  const [stockToDelete, setStockToDelete] = useState<Stock | null>(null);
  const editingGroupNameRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { quotes, loading: quoteLoading } = useStockData(stocks);

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  }));

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const u1 = subscribeGroups(user.uid, (gs) => {
      setGroups(gs);
      const g = gs.find((g) => g.id === id);
      if (g) {
        setGroup(g);
        if (!editingGroupNameRef.current) setGroupNameDraft(g.name);
      }
    });
    const u2 = subscribeStocks(user.uid, (all) => {
      setAllStocks(all);
      setStocks(all.filter((s) => s.groupId === id));
    });
    return () => { u1(); u2(); };
  }, [user?.uid, id]);

  useEffect(() => {
    if (stocks.length === 0) return;
    setSparklines({});
    setSparkLoading(true);
    let remaining = stocks.length;
    stocks.forEach((s) => {
      fetchSparkline(s.symbol, s.market, range).then((data) => {
        if (data.type !== "none") {
          setSparklines((prev) => ({ ...prev, [s.symbol]: data }));
        }
        remaining -= 1;
        if (remaining === 0) setSparkLoading(false);
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks.map((s) => s.symbol).join(","), range]);

  const handleRangeChange = (r: ChartRange) => {
    setRange(r);
    router.replace(`/group/${id}?range=${r}`);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = stocks.findIndex((s) => s.id === active.id);
    const newIndex = stocks.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(stocks, oldIndex, newIndex);
    setStocks(reordered);
    reorderStocks(reordered.map((s) => s.id));
  };

  const showMoveToast = (toast: MoveToast) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setMoveToast(toast);
    toastTimerRef.current = setTimeout(() => setMoveToast(null), 7000);
  };

  const dismissMoveToast = () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setMoveToast(null);
  };

  const handleMove = async (stockId: string, targetGroupId: string) => {
    const targetGroup = groups.find((g) => g.id === targetGroupId);
    await moveStock(stockId, targetGroupId);
    showMoveToast({
      stockId,
      fromGroupId: id,
      targetGroupId,
      targetGroupName: targetGroup?.name ?? "선택한",
    });
  };

  const handleUndoMove = async () => {
    if (!moveToast) return;
    const toast = moveToast;
    dismissMoveToast();
    await moveStock(toast.stockId, toast.fromGroupId);
  };

  const handleDelete = (stock: Stock) => {
    setStockToDelete(stock);
  };

  const handleRenameGroup = async () => {
    if (!group) return;
    const nextName = groupNameDraft.trim();
    if (!nextName || nextName === group.name) {
      setGroupNameDraft(group.name);
      editingGroupNameRef.current = false;
      setEditingGroupName(false);
      return;
    }
    await renameGroup(group.id, nextName);
    editingGroupNameRef.current = false;
    setEditingGroupName(false);
  };

  const periodLabel = range === "1d" ? "D" : range === "7d" ? "W" : "M";

  return (
    <div className="min-h-screen overflow-x-hidden bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              onClick={() => router.push(`/?range=${range}`)}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex min-w-0 items-center gap-2">
              {editingGroupName ? (
                <input
                  autoFocus
                  value={groupNameDraft}
                  onChange={(e) => setGroupNameDraft(e.target.value)}
                  onBlur={handleRenameGroup}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameGroup();
                    if (e.key === "Escape") {
                      setGroupNameDraft(group?.name ?? "");
                      editingGroupNameRef.current = false;
                      setEditingGroupName(false);
                    }
                  }}
                  className="min-w-0 max-w-48 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-lg font-bold focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
                />
              ) : (
                <>
                  <span className="truncate text-lg font-bold">{group?.name ?? "…"}</span>
                  <button
                    onClick={() => {
                      setGroupNameDraft(group?.name ?? "");
                      editingGroupNameRef.current = true;
                      setEditingGroupName(true);
                    }}
                    className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
                    title="폴더명 수정"
                  >
                    <Pencil size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
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
            <button
              onClick={() => setShowAddStock(true)}
              style={{ height: `${RANGE_TAB_CONTAINER_HEIGHT}px` }}
              className="flex items-center gap-1.5 rounded-full bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Plus size={14} /> 추가
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl min-w-0 px-4 py-4">
        <div className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {stocks.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="text-zinc-400">종목을 추가해보세요</p>
              <button
                onClick={() => setShowAddStock(true)}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Plus size={14} /> 주식 추가
              </button>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={stocks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                {stocks.map((stock) => (
                  <SortableStockRow
                    key={stock.id}
                    stock={stock}
                    quotes={quotes}
                    quoteLoading={quoteLoading}
                    sparklines={sparklines}
                    sparkLoading={sparkLoading}
                    range={range}
                    periodLabel={periodLabel}
                    groups={groups}
                    currentGroupId={id}
                    allStocks={allStocks}
                    onDelete={() => handleDelete(stock)}
                    onMove={(groupId) => handleMove(stock.id, groupId)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </main>

      {user && (
        <AddStockModal
          open={showAddStock}
          onClose={() => setShowAddStock(false)}
          groupId={id}
          userId={user.uid}
          existingSymbols={stocks.map((s) => s.symbol)}
        />
      )}

      <ConfirmDialog
        open={stockToDelete !== null}
        title="종목 삭제"
        message={stockToDelete ? `"${stockToDelete.name}" 종목을 삭제할까요?` : ""}
        confirmLabel="삭제"
        danger
        onCancel={() => setStockToDelete(null)}
        onConfirm={async () => {
          if (!stockToDelete) return;
          const stockId = stockToDelete.id;
          setStockToDelete(null);
          await deleteStock(stockId);
        }}
      />

      {moveToast && (
        <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
          <p className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-200">
            &quot;{moveToast.targetGroupName}&quot; 폴더로 이동했습니다.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={handleUndoMove}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
            >
              실행취소
            </button>
            <button
              onClick={() => {
                const targetGroupId = moveToast.targetGroupId;
                dismissMoveToast();
                router.push(`/group/${targetGroupId}?range=${range}`);
              }}
              className="rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              폴더로 이동
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GroupDetailPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <GroupDetailContent />
    </Suspense>
  );
}
