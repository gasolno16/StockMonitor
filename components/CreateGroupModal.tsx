"use client";
import { useEffect, useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { createGroup } from "@/lib/firestore";

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  nextOrder: number;
  existingNames?: string[];
  existingGroups?: { id: string; name: string }[];
  onCreated?: (groupId: string) => void;
}

function normalizeName(name: string) {
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

export default function CreateGroupModal({
  open,
  onClose,
  userId,
  nextOrder,
  existingNames = [],
  existingGroups = [],
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingName, setPendingName] = useState("");
  const completedRef = useRef(false);
  const trimmedName = name.trim();
  const existingGroupNames = existingGroups.length > 0 ? existingGroups.map((group) => group.name) : existingNames;
  const duplicated = !loading && !!trimmedName && existingGroupNames.some((existingName) => normalizeName(existingName) === normalizeName(trimmedName));

  const resetAndClose = (keepCompleted = false) => {
    setName("");
    setError("");
    setPendingName("");
    setLoading(false);
    if (!keepCompleted) completedRef.current = false;
    onClose();
  };

  useEffect(() => {
    if (!loading || !pendingName || existingGroups.length === 0 || completedRef.current) return;
    const createdGroup = existingGroups.find((group) => normalizeName(group.name) === normalizeName(pendingName));
    if (!createdGroup) return;

    completedRef.current = true;
    onCreated?.(createdGroup.id);
    resetAndClose(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingGroups, loading, pendingName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmedName) return;
    if (duplicated) {
      setError("이미 같은 이름의 폴더가 있습니다.");
      return;
    }
    setLoading(true);
    setError("");
    setPendingName(trimmedName);
    completedRef.current = false;
    try {
      const ref = await withTimeout(createGroup(userId, trimmedName, nextOrder), 12000);
      if (completedRef.current) return;
      completedRef.current = true;
      onCreated?.(ref.id);
      resetAndClose(true);
    } catch (err) {
      if (completedRef.current) return;
      setError(err instanceof Error ? err.message : "오류가 발생했습니다");
    } finally {
      if (!completedRef.current) setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={() => resetAndClose()} title="폴더 만들기">
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          autoFocus value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="폴더 이름"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-700"
          required
        />
        {(error || duplicated) && (
          <p className="text-sm text-red-500">
            {duplicated ? "이미 같은 이름의 폴더가 있습니다." : error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => resetAndClose()}>취소</Button>
          <Button type="submit" disabled={loading || duplicated || !trimmedName}>{loading ? "만드는 중..." : "만들기"}</Button>
        </div>
      </form>
    </Modal>
  );
}
