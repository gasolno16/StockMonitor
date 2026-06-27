import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, query, where, onSnapshot, getDocs, writeBatch,
} from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import type { Group, Stock } from "@/types";

// ── Groups ────────────────────────────────────────────────
export function subscribeGroups(userId: string, cb: (groups: Group[]) => void) {
  const db = getFirebaseDb();
  const q = query(collection(db, "groups"), where("userId", "==", userId));
  return onSnapshot(q, (snap) => {
    const groups = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Group))
      .sort((a, b) => a.order - b.order);
    cb(groups);
  });
}

export async function createGroup(userId: string, name: string, order: number) {
  const db = getFirebaseDb();
  return addDoc(collection(db, "groups"), {
    name, userId, createdAt: Date.now(), order,
  });
}

export async function renameGroup(groupId: string, name: string) {
  return updateDoc(doc(getFirebaseDb(), "groups", groupId), { name });
}

export async function deleteGroup(groupId: string, userId: string) {
  const db = getFirebaseDb();
  const batch = writeBatch(db);
  batch.delete(doc(db, "groups", groupId));
  const snap = await getDocs(
    query(collection(db, "stocks"), where("groupId", "==", groupId), where("userId", "==", userId))
  );
  snap.docs.forEach((d) => batch.delete(d.ref));
  return batch.commit();
}

// ── Stocks ────────────────────────────────────────────────
export function subscribeStocks(userId: string, cb: (stocks: Stock[]) => void) {
  const db = getFirebaseDb();
  const q = query(collection(db, "stocks"), where("userId", "==", userId));
  return onSnapshot(q, (snap) => {
    const stocks = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Stock))
      .sort((a, b) => (a.order ?? a.addedAt) - (b.order ?? b.addedAt));
    cb(stocks);
  });
}

export async function addStock(
  userId: string, groupId: string,
  symbol: string, name: string, market: "KR" | "US"
) {
  return addDoc(collection(getFirebaseDb(), "stocks"), {
    symbol, name, market, groupId, userId, addedAt: Date.now(),
  });
}

export async function deleteStock(stockId: string) {
  return deleteDoc(doc(getFirebaseDb(), "stocks", stockId));
}

export async function moveStock(stockId: string, groupId: string) {
  return updateDoc(doc(getFirebaseDb(), "stocks", stockId), { groupId });
}

export async function updateStockMemo(stockId: string, memo: string) {
  return updateDoc(doc(getFirebaseDb(), "stocks", stockId), { memo });
}

export async function reorderStocks(stockIds: string[]) {
  const db = getFirebaseDb();
  const batch = writeBatch(db);
  stockIds.forEach((id, index) => {
    batch.update(doc(db, "stocks", id), { order: index });
  });
  return batch.commit();
}
