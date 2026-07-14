// 商品資料存取層：改成直接讀寫 Firestore 雲端資料庫，取代原本的 localStorage/JSON 檔案方案。
// 前台用 subscribeToProducts 訂閱即時更新（後台一存檔，前台不用重新整理就會自動更新畫面）。

import { db } from './firebase-config.js?v=10';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  writeBatch,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const productsCol = collection(db, 'products');
const salesAccessDoc = doc(db, 'settings', 'salesAccess');

function normalize(data) {
  return {
    name: data.name || '',
    category: data.category || '',
    origin: data.origin || '',
    packagingSpec: data.packagingSpec || '',
    specs: Array.isArray(data.specs) ? data.specs : [],
    specNotes: Array.isArray(data.specNotes) ? data.specNotes : [],
    prices: Array.isArray(data.prices) ? data.prices : [],
    priceNotes: Array.isArray(data.priceNotes) ? data.priceNotes : [],
    updatedAt: data.updatedAt || Date.now()
  };
}

// 即時訂閱商品清單；回傳的 unsubscribe 函式可在離開頁面時呼叫以停止監聽
export function subscribeToProducts(callback, onError) {
  return onSnapshot(
    productsCol,
    snapshot => callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))),
    onError
  );
}

export async function addProduct(data) {
  await addDoc(productsCol, normalize(data));
}

export async function updateProduct(id, data) {
  await updateDoc(doc(db, 'products', id), normalize(data));
}

export async function deleteProduct(id) {
  await deleteDoc(doc(db, 'products', id));
}

export async function clearAllProducts() {
  const snap = await getDocs(productsCol);
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

// 匯入會整批覆蓋現有資料
export async function importProducts(products) {
  await clearAllProducts();
  const batch = writeBatch(db);
  products.forEach(p => {
    const ref = doc(productsCol);
    batch.set(ref, normalize(p));
  });
  await batch.commit();
}

export function exportProductsAsJSON(products) {
  const plain = products.map(({ id, ...rest }) => rest);
  return JSON.stringify(plain, null, 2);
}

// 業務登入碼清單（用來切換前台訪客/業務模式，不是真正的帳號系統）
export function subscribeToSalesCodes(callback, onError) {
  return onSnapshot(
    salesAccessDoc,
    snap => callback(Array.isArray(snap.data()?.codes) ? snap.data().codes : []),
    onError
  );
}

export async function setSalesCodes(codes) {
  await setDoc(salesAccessDoc, { codes });
}
