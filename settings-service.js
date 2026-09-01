// 全站共用設定：目前只有「檢驗報告下載密碼」。
// 密碼只存雜湊值（SHA-256），不存明碼，避免有人直接看 Firestore 資料就拿到密碼。

import { db } from './firebase-config.js?v=60';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const settingsRef = doc(db, 'settings', 'reportAccess');

export async function hashPassword(plain) {
  const bytes = new TextEncoder().encode(plain);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function getReportPasswordHash() {
  const snap = await getDoc(settingsRef);
  return snap.exists() ? (snap.data().passwordHash || '') : '';
}

export async function setReportPassword(plain) {
  const passwordHash = await hashPassword(plain);
  await setDoc(settingsRef, { passwordHash });
}
