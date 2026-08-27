// 商品資料存取層：改成直接讀寫 Firestore 雲端資料庫，取代原本的 localStorage/JSON 檔案方案。
// 前台用 subscribeToProducts 訂閱即時更新（後台一存檔，前台不用重新整理就會自動更新畫面）。

import { db } from './firebase-config.js?v=59';
import {
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  writeBatch,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const productsCol = collection(db, 'products');

function normalize(data) {
  return {
    name: data.name || '',
    category: data.category || '',
    origin: data.origin || '',
    manufacturer: data.manufacturer || '',
    hideOrigin: !!data.hideOrigin,
    packagingSpec: data.packagingSpec || '',
    specNotes: Array.isArray(data.specNotes) ? data.specNotes : [],
    sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
    photos: Array.isArray(data.photos) ? data.photos : [],
    reportUrls: Array.isArray(data.reportUrls) ? data.reportUrls : [],
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

// 用 setDoc（整份覆蓋）而不是 updateDoc（合併），確保欄位跟 normalize() 的結果完全一致，
// 不會留下已經拿掉的舊欄位（例如業務價格）殘留在文件裡
export async function updateProduct(id, data) {
  await setDoc(doc(db, 'products', id), normalize(data));
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
