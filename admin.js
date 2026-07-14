// 後台管理：Firebase Authentication 登入 + Firestore 即時讀寫。
// 存檔後，前台頁面會透過 Firestore 的即時監聽自動更新，不需要任何手動發布步驟。

import { auth } from './firebase-config.js?v=6';
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  subscribeToProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  clearAllProducts,
  importProducts,
  exportProductsAsJSON,
  subscribeToSalesCodes,
  setSalesCodes
} from './products-service.js?v=6';

const loginBox = document.getElementById('loginBox');
const adminContent = document.getElementById('adminContent');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');
const forgotPasswordLink = document.getElementById('forgotPasswordLink');
const currentUserEmail = document.getElementById('currentUserEmail');
const logoutBtn = document.getElementById('logoutBtn');

const productForm = document.getElementById('productForm');
const formTitle = document.getElementById('formTitle');
const submitBtn = document.getElementById('submitBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const formMsg = document.getElementById('formMsg');
const fieldName = document.getElementById('fieldName');
const fieldCategory = document.getElementById('fieldCategory');
const fieldUnit = document.getElementById('fieldUnit');
const fieldOrigin = document.getElementById('fieldOrigin');
const fieldPackaging = document.getElementById('fieldPackaging');
const specRows = document.getElementById('specRows');
const addSpecBtn = document.getElementById('addSpecBtn');
const categoryList = document.getElementById('categoryList');
const originList = document.getElementById('originList');
const packagingList = document.getElementById('packagingList');
const productTableBody = document.getElementById('productTableBody');
const clearAllBtn = document.getElementById('clearAllBtn');

const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');
const ioMsg = document.getElementById('ioMsg');

const newSalesCode = document.getElementById('newSalesCode');
const addSalesCodeBtn = document.getElementById('addSalesCodeBtn');
const salesCodeList = document.getElementById('salesCodeList');

let editingId = null;
let currentProducts = [];
let unsubscribeProducts = null;
let currentSalesCodes = [];
let unsubscribeSalesCodes = null;

// ---------- 登入 ----------

loginBtn.addEventListener('click', async () => {
  loginError.textContent = '';
  try {
    await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value);
  } catch (err) {
    loginError.textContent = '登入失敗：' + describeAuthError(err);
  }
});

[emailInput, passwordInput].forEach(input => {
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') loginBtn.click();
  });
});

forgotPasswordLink.addEventListener('click', async e => {
  e.preventDefault();
  const email = emailInput.value.trim();
  if (!email) {
    loginError.textContent = '請先在 Email 欄位輸入你的管理員信箱，再點忘記密碼';
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    loginError.style.color = 'var(--color-success)';
    loginError.textContent = '重設密碼信已寄出，請去信箱收信';
  } catch (err) {
    loginError.style.color = 'var(--color-danger)';
    loginError.textContent = '寄送失敗：' + describeAuthError(err);
  }
});

logoutBtn.addEventListener('click', () => signOut(auth));

function describeAuthError(err) {
  const map = {
    'auth/invalid-email': 'Email 格式不正確',
    'auth/invalid-credential': '帳號或密碼錯誤',
    'auth/wrong-password': '密碼錯誤',
    'auth/user-not-found': '找不到這個帳號',
    'auth/too-many-requests': '嘗試次數過多，請稍後再試'
  };
  return map[err.code] || err.message;
}

onAuthStateChanged(auth, user => {
  if (user) {
    loginBox.style.display = 'none';
    adminContent.style.display = 'block';
    currentUserEmail.textContent = user.email;
    if (!unsubscribeProducts) {
      unsubscribeProducts = subscribeToProducts(
        products => {
          currentProducts = products;
          renderTable();
          renderDatalists();
        },
        err => {
          formMsg.style.color = 'var(--color-danger)';
          formMsg.textContent = '讀取資料失敗：' + err.message;
        }
      );
    }
    if (!unsubscribeSalesCodes) {
      unsubscribeSalesCodes = subscribeToSalesCodes(
        codes => {
          currentSalesCodes = codes;
          renderSalesCodeList();
        },
        err => console.error('讀取業務登入碼失敗', err)
      );
    }
  } else {
    loginBox.style.display = 'block';
    adminContent.style.display = 'none';
    if (unsubscribeProducts) {
      unsubscribeProducts();
      unsubscribeProducts = null;
    }
    if (unsubscribeSalesCodes) {
      unsubscribeSalesCodes();
      unsubscribeSalesCodes = null;
    }
    currentProducts = [];
    resetForm();
  }
});

// ---------- 規格欄位 (動態新增/刪除) ----------

function addSpecRow(key = '', value = '') {
  const row = document.createElement('div');
  row.className = 'spec-row';
  row.innerHTML = `
    <input type="text" class="spec-key" placeholder="規格名稱，例如：CPU" value="${escapeHTML(key)}" />
    <input type="text" class="spec-value" placeholder="規格內容，例如：8 核心" value="${escapeHTML(value)}" />
    <button type="button" class="secondary remove-spec">刪除</button>
  `;
  row.querySelector('.remove-spec').addEventListener('click', () => row.remove());
  specRows.appendChild(row);
}

addSpecBtn.addEventListener('click', () => addSpecRow());

function getSpecsFromForm() {
  return Array.from(specRows.querySelectorAll('.spec-row')).map(row => ({
    key: row.querySelector('.spec-key').value.trim(),
    value: row.querySelector('.spec-value').value.trim()
  })).filter(s => s.key || s.value);
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ---------- 表單 ----------

function resetForm() {
  editingId = null;
  productForm.reset();
  specRows.innerHTML = '';
  formTitle.textContent = '新增產品';
  submitBtn.textContent = '新增產品';
  cancelEditBtn.style.display = 'none';
  formMsg.textContent = '';
}

function loadProductIntoForm(product) {
  editingId = product.id;
  fieldName.value = product.name;
  fieldCategory.value = product.category;
  fieldUnit.value = product.unit;
  fieldOrigin.value = product.origin || '';
  fieldPackaging.value = product.packagingSpec || '';
  specRows.innerHTML = '';
  (product.specs || []).forEach(s => addSpecRow(s.key, s.value));
  formTitle.textContent = '編輯產品：' + product.name;
  submitBtn.textContent = '儲存變更';
  cancelEditBtn.style.display = 'inline-block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

productForm.addEventListener('submit', async e => {
  e.preventDefault();
  const data = {
    name: fieldName.value.trim(),
    category: fieldCategory.value.trim(),
    unit: fieldUnit.value.trim(),
    origin: fieldOrigin.value.trim(),
    packagingSpec: fieldPackaging.value.trim(),
    specs: getSpecsFromForm()
  };
  if (!data.name) return;

  submitBtn.disabled = true;
  try {
    if (editingId) {
      await updateProduct(editingId, data);
    } else {
      await addProduct(data);
    }
    resetForm();
  } catch (err) {
    formMsg.style.color = 'var(--color-danger)';
    formMsg.textContent = '儲存失敗：' + err.message;
  } finally {
    submitBtn.disabled = false;
  }
});

cancelEditBtn.addEventListener('click', resetForm);

// ---------- 列表 ----------

function renderTable() {
  if (currentProducts.length === 0) {
    productTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#6b7280;">尚未新增任何產品</td></tr>`;
    return;
  }
  productTableBody.innerHTML = currentProducts.map(p => `
    <tr>
      <td>${escapeHTML(p.name)}</td>
      <td>${escapeHTML(p.category) || '-'}</td>
      <td>${escapeHTML(p.origin) || '-'}</td>
      <td>${escapeHTML(p.packagingSpec) || '-'}</td>
      <td>${(p.specs || []).map(s => `${escapeHTML(s.key)}: ${escapeHTML(s.value)}`).join('<br/>') || '-'}</td>
      <td>
        <div class="row-actions">
          <button class="secondary edit-btn" data-id="${p.id}">編輯</button>
          <button class="danger delete-btn" data-id="${p.id}">刪除</button>
        </div>
      </td>
    </tr>
  `).join('');

  productTableBody.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const product = currentProducts.find(p => p.id === btn.dataset.id);
      if (product) loadProductIntoForm(product);
    });
  });

  productTableBody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const product = currentProducts.find(p => p.id === btn.dataset.id);
      if (product && confirm(`確定要刪除「${product.name}」嗎？此動作無法復原。`)) {
        try {
          await deleteProduct(btn.dataset.id);
          if (editingId === btn.dataset.id) resetForm();
        } catch (err) {
          alert('刪除失敗：' + err.message);
        }
      }
    });
  });
}

function renderDatalists() {
  const categories = Array.from(new Set(currentProducts.map(p => p.category).filter(Boolean))).sort();
  const origins = Array.from(new Set(currentProducts.map(p => p.origin).filter(Boolean))).sort();
  const packagingSpecs = Array.from(new Set(currentProducts.map(p => p.packagingSpec).filter(Boolean))).sort();
  categoryList.innerHTML = categories.map(c => `<option value="${escapeHTML(c)}"></option>`).join('');
  originList.innerHTML = origins.map(o => `<option value="${escapeHTML(o)}"></option>`).join('');
  packagingList.innerHTML = packagingSpecs.map(p => `<option value="${escapeHTML(p)}"></option>`).join('');
}

clearAllBtn.addEventListener('click', async () => {
  if (currentProducts.length === 0) return;
  if (!confirm('確定要清空「全部」產品嗎？此動作無法復原（若之前有備份，可以之後用「還原」救回）。')) return;
  try {
    await clearAllProducts();
    resetForm();
  } catch (err) {
    alert('清空失敗：' + err.message);
  }
});

// ---------- 業務登入碼管理 ----------

function renderSalesCodeList() {
  if (currentSalesCodes.length === 0) {
    salesCodeList.innerHTML = `<p class="hint-text">尚未設定任何登入碼，業務目前都無法登入查看價格。</p>`;
    return;
  }
  salesCodeList.innerHTML = currentSalesCodes.map(code => `
    <span class="badge" style="display:inline-flex; align-items:center; gap:8px; margin:0 8px 8px 0;">
      ${escapeHTML(code)}
      <button type="button" class="danger remove-sales-code" data-code="${escapeHTML(code)}" style="padding:2px 8px; font-size:12px;">移除</button>
    </span>
  `).join('');

  salesCodeList.querySelectorAll('.remove-sales-code').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`確定要移除登入碼「${btn.dataset.code}」嗎？`)) return;
      try {
        await setSalesCodes(currentSalesCodes.filter(c => c !== btn.dataset.code));
      } catch (err) {
        alert('移除失敗：' + err.message);
      }
    });
  });
}

addSalesCodeBtn.addEventListener('click', async () => {
  const code = newSalesCode.value.trim();
  if (!code) return;
  if (currentSalesCodes.includes(code)) {
    alert('這個登入碼已經存在了');
    return;
  }
  try {
    await setSalesCodes([...currentSalesCodes, code]);
    newSalesCode.value = '';
  } catch (err) {
    alert('新增失敗：' + err.message);
  }
});

newSalesCode.addEventListener('keydown', e => {
  if (e.key === 'Enter') addSalesCodeBtn.click();
});

// ---------- 匯出 / 匯入（備份用） ----------

exportBtn.addEventListener('click', () => {
  const json = exportProductsAsJSON(currentProducts);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `products-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

importBtn.addEventListener('click', () => importFile.click());

importFile.addEventListener('change', () => {
  const file = importFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed)) throw new Error('檔案格式不正確，必須是商品陣列');
      if (!confirm('還原將會覆蓋目前的所有產品資料，確定要繼續嗎？')) return;
      await importProducts(parsed);
      ioMsg.style.color = 'var(--color-success)';
      ioMsg.textContent = '還原成功！';
    } catch (err) {
      ioMsg.style.color = 'var(--color-danger)';
      ioMsg.textContent = '還原失敗：' + err.message;
    }
  };
  reader.readAsText(file);
  importFile.value = '';
});
