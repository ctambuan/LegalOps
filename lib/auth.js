// lib/auth.js — Auth context. Tracks the signed-in user, their allowlist role, and reviewer claim.
"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { getFb } from "./firebase";
import { stampSignIn } from "./data";
import { normalizeRole } from "./constants";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);   // gc | regional | hol | country (legacy reviewer/contributor) | null
  const [companies, setCompanies] = useState([]); // "all" (group) or array of entity codes
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { configured, auth, db } = getFb();
    if (!configured || !auth) { setLoading(false); setReady(false); return; }
    setReady(true);
    const unsub = onAuthStateChanged(auth, async (u) => {
      setLoading(true);
      if (!u) { setUser(null); setRole(null); setCompanies([]); setLoading(false); return; }
      setUser(u);
      try {
        const snap = await getDoc(doc(db, "allowlist", u.email.toLowerCase()));
        const tokenResult = await u.getIdTokenResult();
        const claimReviewer = tokenResult.claims.reviewer === true; // legacy super-admin claim → GC
        if (snap.exists()) {
          const d = snap.data();
          setRole(claimReviewer ? "gc" : (d.role || "country"));
          setCompanies(claimReviewer ? "all" : (d.companies ?? []));
          stampSignIn(u); // record this sign-in (Team & Access status / last-seen); non-blocking
        } else {
          setRole(claimReviewer ? "gc" : null);
          setCompanies(claimReviewer ? "all" : []);
        }
      } catch (e) {
        console.error("role resolution failed", e);
        setRole(null); setCompanies([]);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // The Google OAuth access token (carrying the drive.file scope) is only exposed on the
  // signInWithPopup result, not on later auth-state changes — capture it at login and keep
  // it in memory for the Drive upload. It is short-lived; re-popup on demand to refresh.
  const [driveToken, setDriveToken] = useState(null);

  const login = async () => {
    const { auth, provider } = getFb();
    const result = await signInWithPopup(auth, provider);
    setDriveToken(GoogleAuthProvider.credentialFromResult(result)?.accessToken || null);
    return result;
  };
  const logout = () => { setDriveToken(null); const { auth } = getFb(); return signOut(auth); };

  // Return a usable Google OAuth access token; re-prompt (popup) if we don't have one
  // cached (e.g. the session was restored without a fresh sign-in) or after expiry.
  // `silent: true` never opens a popup — it returns the cached token or null. This lets the
  // live Drive-sync run in the background without a surprise consent window (popups outside a
  // user gesture would be blocked anyway); the token is warmed by sign-in / the first generate.
  const getDriveAccessToken = async ({ forceRefresh = false, silent = false } = {}) => {
    if (driveToken && !forceRefresh) return driveToken;
    if (silent) return null;
    const { auth, provider } = getFb();
    const result = await signInWithPopup(auth, provider);
    const t = GoogleAuthProvider.credentialFromResult(result)?.accessToken || null;
    setDriveToken(t);
    return t;
  };

  return (
    <AuthCtx.Provider value={{ user, role, companies, loading, ready, login, logout, getDriveAccessToken,
      // Same Google OAuth token; carries whatever scopes the provider requested (e.g. gmail.send).
      getGoogleAccessToken: getDriveAccessToken,
      // isGC = super-admin (group). isReviewer kept as a GC alias so legacy modules (Contracting
      // review, DocGen settings) stay GC-gated. isAllowed = any resolved group role.
      isGC: normalizeRole(role) === "gc",
      isReviewer: normalizeRole(role) === "gc",
      isAllowed: !!normalizeRole(role) }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
