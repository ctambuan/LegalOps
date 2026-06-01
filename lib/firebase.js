// lib/firebase.js — Firebase client initialisation (browser only, lazy, build-safe).
// Config comes from public env vars (safe to expose; security enforced by Firestore rules + Auth).
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { DRIVE_UPLOAD_ENABLED } from "./config";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const configured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let _app = null, _auth = null, _db = null, _provider = null;

function ensure() {
  if (!configured) return false;
  if (!_app) {
    _app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    _auth = getAuth(_app);
    _db = getFirestore(_app);
    _provider = new GoogleAuthProvider();
    _provider.setCustomParameters({ prompt: "select_account" });
    // Request the narrow Drive scope so the master export can be saved to the Drive folder
    // under the reviewer's identity. Only when the feature is enabled for this deployment.
    if (DRIVE_UPLOAD_ENABLED) _provider.addScope("https://www.googleapis.com/auth/drive.file");
  }
  return true;
}

// Lazy getter: never initialises during static prerender (no env / not in browser).
export function getFb() {
  if (typeof window === "undefined") return { configured, auth: null, db: null, provider: null };
  const ok = ensure();
  return { configured: ok, auth: _auth, db: _db, provider: _provider };
}

export { configured };
