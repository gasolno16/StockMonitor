"use client";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import { getFirebaseAuth, googleProvider } from "@/lib/firebase";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const auth = getFirebaseAuth();
      return onAuthStateChanged(
        auth,
        (u) => {
          setUser(u);
          setLoading(false);
        },
        (err) => {
          console.error("Auth error:", err);
          setLoading(false);
        }
      );
    } catch (err) {
      console.error("Firebase init error:", err);
      setLoading(false);
    }
  }, []);

  const login = () => signInWithPopup(getFirebaseAuth(), googleProvider);
  const logout = () => signOut(getFirebaseAuth());

  return { user, loading, login, logout };
}
