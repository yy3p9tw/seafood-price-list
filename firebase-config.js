// Firebase 專案設定（apiKey 這些不是機密，安全性是靠 Firestore 規則 + 登入驗證，不是靠隱藏這些值）
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBZPlVZbmLVOA1M7rlJWAEJlkrYnHtdxIs",
  authDomain: "seafood-price-list.firebaseapp.com",
  projectId: "seafood-price-list",
  storageBucket: "seafood-price-list.firebasestorage.app",
  messagingSenderId: "211620973332",
  appId: "1:211620973332:web:2ce0351d3abb8217cfd001"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
