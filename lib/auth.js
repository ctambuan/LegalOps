// lib/auth.js — Auth context. Tracks the signed-in user, their allowlist role, and reviewer claim.
"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { getFb } from "./firebase";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);   // 'reviewer' | 'contributor' | null
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { configured, auth, db } = getFb();
    if (!configured || !auth) { setLoading(false); setReady(false); return; }
    setReady(true);
    const unsub = onAuthStateChanged(auth, async (u) => {
      setLoading(true);
      if (!u) { setUser(null); setRole(null); setLoading(false); return; }
      setUser(u);
      try {
        const snap = await getDoc(doc(db, "allowlist", u.email.toLowerCase()));
        const tokenResult = await u.getIdTokenResult();
        const claimReviewer = tokenResult.claims.reviewer === true;
        if (snap.exists()) {
          const r = snap.data().role;
          setRole(claimReviewer ? "reviewer" : (r || "contributor"));
        } else {
          setRole(claimReviewer ? "reviewer" : null);
        }
      } catch (e) {
        console.error("role resolution failed", e);
        setRole(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const login = () => { const { auth, provider } = getFb(); return signInWithPopup(auth, provider); };
  const logout = () => { const { auth } = getFb(); return signOut(auth); };

  return (
    <AuthCtx.Provider value={{ user, role, loading, ready, login, logout,
      isReviewer: role === "reviewer", isAllowed: role === "reviewer" || role === "contributor" }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
