// 後台管理：Firebase Authentication 登入 + Firestore 即時讀寫。
// 存檔後，前台頁面會透過 Firestore 的即時監聽自動更新，不需要任何手動發布步驟。

import { auth } from './firebase-config.js?v=19';
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
} from './products-service.js?v=19';

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
const fieldOrigin = document.getElementById('fieldOrigin');
const fieldPackaging = document.getElementById('fieldPackaging');
const fieldHiddenFromGuest = document.getElementById('fieldHiddenFromGuest');
const photoUrlInput = document.getElementById('photoUrlInput');
const addPhotoUrlBtn = document.getElementById('addPhotoUrlBtn');
const photoPreviewGrid = document.getElementById('photoPreviewGrid');
const photoUploadMsg = document.getElementById('photoUploadMsg');
const loadImageLibraryBtn = document.getElementById('loadImageLibraryBtn');
const imageLibraryGrid = document.getElementById('imageLibraryGrid');
const guestSpecRows = document.getElementById('guestSpecRows');
const addGuestSpecBtn = document.getElementById('addGuestSpecBtn');
const fieldGuestNotes = document.getElementById('fieldGuestNotes');
const priceRows = document.getElementById('priceRows');
const addPriceBtn = document.getElementById('addPriceBtn');
const fieldPriceNotes = document.getElementById('fieldPriceNotes');
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
let currentPhotos = [];
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

// ---------- 規格/價格欄位 (動態新增/刪除，訪客規格與業務價格共用同一套邏輯) ----------

function addKeyValueRow(container, key = '', value = '', keyPlaceholder = '名稱', valuePlaceholder = '內容') {
  const row = document.createElement('div');
  row.className = 'spec-row';
  row.innerHTML = `
    <input type="text" class="spec-key" placeholder="${escapeHTML(keyPlaceholder)}" value="${escapeHTML(key)}" />
    <input type="text" class="spec-value" placeholder="${escapeHTML(valuePlaceholder)}" value="${escapeHTML(value)}" />
    <button type="button" class="secondary remove-spec">刪除</button>
  `;
  row.querySelector('.remove-spec').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

function getRowsFrom(container) {
  return Array.from(container.querySelectorAll('.spec-row')).map(row => ({
    key: row.querySelector('.spec-key').value.trim(),
    value: row.querySelector('.spec-value').value.trim()
  })).filter(s => s.key || s.value);
}

function getNotesFrom(textarea) {
  return textarea.value.split('\n').map(line => line.trim()).filter(Boolean);
}

addGuestSpecBtn.addEventListener('click', () => addKeyValueRow(guestSpecRows, '', '', '規格名稱，例如：20/30', '規格內容，例如：尺寸/等級'));
addPriceBtn.addEventListener('click', () => addKeyValueRow(priceRows, '', '', '規格名稱，例如：20/30 基本', '價格，例如：$200'));

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ---------- 商品照片 (直接貼網址，Firestore 只存網址字串) ----------

function renderPhotoPreview() {
  photoPreviewGrid.innerHTML = currentPhotos.map((url, i) => `
    <div class="photo-preview-item">
      <img src="${escapeHTML(url)}" alt="" />
      <button type="button" class="photo-preview-remove" data-index="${i}">×</button>
    </div>
  `).join('');
  photoPreviewGrid.querySelectorAll('.photo-preview-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPhotos.splice(Number(btn.dataset.index), 1);
      renderPhotoPreview();
      renderImageLibrary();
    });
  });
}

function addPhotoUrl() {
  const url = photoUrlInput.value.trim();
  if (!url) return;
  currentPhotos.push(url);
  photoUrlInput.value = '';
  photoUploadMsg.textContent = '';
  renderPhotoPreview();
}

addPhotoUrlBtn.addEventListener('click', addPhotoUrl);
photoUrlInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addPhotoUrl();
  }
});

// ---------- 照片庫 (瀏覽 GitHub images 資料夾裡已經上傳的照片，點選即可加入) ----------

const PAGES_BASE = 'https://yy3p9tw.github.io/seafood-price-list/';
let libraryFiles = null;

function renderImageLibrary() {
  if (!libraryFiles) return;
  if (!libraryFiles.length) {
    imageLibraryGrid.style.display = '';
    imageLibraryGrid.innerHTML = `<p class="hint-text">images 資料夾裡還沒有照片</p>`;
    return;
  }
  const groups = {};
  libraryFiles.forEach(f => {
    const key = f.folder || '（根目錄）';
    (groups[key] = groups[key] || []).push(f);
  });
  imageLibraryGrid.style.display = 'block';
  imageLibraryGrid.innerHTML = Object.entries(groups).map(([folder, files]) => `
    <div style="margin-bottom:10px;">
      <div class="hint-text" style="font-weight:600; margin-bottom:4px;">${escapeHTML(folder)}</div>
      <div class="photo-preview-grid">
        ${files.map(f => {
          const selected = currentPhotos.includes(f.url);
          return `
            <div class="photo-preview-item library-item${selected ? ' selected' : ''}" data-url="${escapeHTML(f.url)}">
              <img src="${escapeHTML(f.url)}" alt="" loading="lazy" />
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `).join('');
  imageLibraryGrid.querySelectorAll('.library-item').forEach(item => {
    item.addEventListener('click', () => {
      const url = item.dataset.url;
      const idx = currentPhotos.indexOf(url);
      if (idx === -1) currentPhotos.push(url);
      else currentPhotos.splice(idx, 1);
      renderPhotoPreview();
      renderImageLibrary();
    });
  });
}

loadImageLibraryBtn.addEventListener('click', async () => {
  imageLibraryGrid.style.display = '';
  imageLibraryGrid.innerHTML = `<p class="hint-text">載入中...</p>`;
  try {
    const res = await fetch('https://api.github.com/repos/yy3p9tw/seafood-price-list/git/trees/main?recursive=1');
    if (!res.ok) throw new Error('讀取失敗 (' + res.status + ')');
    const data = await res.json();
    libraryFiles = (data.tree || [])
      .filter(t => t.type === 'blob' && t.path.startsWith('images/') && /\.(jpe?g|png|gif|webp)$/i.test(t.path))
      .map(t => {
        const relative = t.path.slice('images/'.length);
        const parts = relative.split('/');
        return {
          folder: parts.length > 1 ? parts[0] : '',
          url: PAGES_BASE + t.path.split('/').map(encodeURIComponent).join('/')
        };
      });
    renderImageLibrary();
  } catch (err) {
    imageLibraryGrid.style.display = '';
    imageLibraryGrid.innerHTML = `<p class="hint-text" style="color:var(--color-danger);">讀取照片庫失敗：${escapeHTML(err.message)}</p>`;
  }
});

// ---------- 表單 ----------

function resetForm() {
  editingId = null;
  productForm.reset();
  currentPhotos = [];
  renderPhotoPreview();
  photoUploadMsg.textContent = '';
  fieldHiddenFromGuest.checked = false;
  guestSpecRows.innerHTML = '';
  fieldGuestNotes.value = '';
  priceRows.innerHTML = '';
  fieldPriceNotes.value = '';
  formTitle.textContent = '新增產品';
  submitBtn.textContent = '新增產品';
  cancelEditBtn.style.display = 'none';
  formMsg.textContent = '';
}

function loadProductIntoForm(product) {
  editingId = product.id;
  fieldName.value = product.name;
  fieldCategory.value = product.category;
  fieldOrigin.value = product.origin || '';
  fieldPackaging.value = product.packagingSpec || '';
  currentPhotos = [...(product.photos || [])];
  renderPhotoPreview();
  photoUploadMsg.textContent = '';
  fieldHiddenFromGuest.checked = !!product.hiddenFromGuest;
  guestSpecRows.innerHTML = '';
  (product.specs || []).forEach(s => addKeyValueRow(guestSpecRows, s.key, s.value, '規格名稱，例如：20/30', '規格內容，例如：尺寸/等級'));
  fieldGuestNotes.value = (product.specNotes || []).join('\n');
  priceRows.innerHTML = '';
  (product.prices || []).forEach(s => addKeyValueRow(priceRows, s.key, s.value, '規格名稱，例如：20/30 基本', '價格，例如：$200'));
  fieldPriceNotes.value = (product.priceNotes || []).join('\n');
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
    origin: fieldOrigin.value.trim(),
    packagingSpec: fieldPackaging.value.trim(),
    hiddenFromGuest: fieldHiddenFromGuest.checked,
    photos: currentPhotos,
    specs: getRowsFrom(guestSpecRows),
    specNotes: getNotesFrom(fieldGuestNotes),
    prices: getRowsFrom(priceRows),
    priceNotes: getNotesFrom(fieldPriceNotes)
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
    productTableBody.innerHTML = `<tr><td colspan="11" style="text-align:center; color:#6b7280;">尚未新增任何產品</td></tr>`;
    return;
  }
  productTableBody.innerHTML = currentProducts.map(p => {
    return `
    <tr>
      <td>${escapeHTML(p.name)}</td>
      <td>${(p.photos || []).length ? `${p.photos.length} 張` : '-'}</td>
      <td>${p.hiddenFromGuest ? '<span style="color:var(--color-danger); font-weight:600;">僅業務</span>' : '是'}</td>
      <td>${escapeHTML(p.category) || '-'}</td>
      <td>${escapeHTML(p.origin) || '-'}</td>
      <td>${escapeHTML(p.packagingSpec) || '-'}</td>
      <td>${(p.specs || []).map(s => `${escapeHTML(s.key)}: ${escapeHTML(s.value)}`).join('<br/>') || '-'}</td>
      <td>${(p.specNotes || []).map(escapeHTML).join('<br/>') || '-'}</td>
      <td>${(p.prices || []).map(s => `${escapeHTML(s.key)}: ${escapeHTML(s.value)}`).join('<br/>') || '-'}</td>
      <td>${(p.priceNotes || []).map(escapeHTML).join('<br/>') || '-'}</td>
      <td>
        <div class="row-actions">
          <button class="secondary edit-btn" data-id="${p.id}">編輯</button>
          <button class="danger delete-btn" data-id="${p.id}">刪除</button>
        </div>
      </td>
    </tr>
  `;
  }).join('');

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
