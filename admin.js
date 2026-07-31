// 後台管理：Firebase Authentication 登入 + Firestore 即時讀寫。
// 存檔後，前台頁面會透過 Firestore 的即時監聽自動更新，不需要任何手動發布步驟。

import { auth } from './firebase-config.js?v=46';
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
} from './products-service.js?v=46';

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
const addProductBtn = document.getElementById('addProductBtn');
const formMsg = document.getElementById('formMsg');
const fieldName = document.getElementById('fieldName');
const fieldCategory = document.getElementById('fieldCategory');
const fieldOrigin = document.getElementById('fieldOrigin');
const fieldHideOrigin = document.getElementById('fieldHideOrigin');
const fieldManufacturer = document.getElementById('fieldManufacturer');
const fieldPackaging = document.getElementById('fieldPackaging');
const fieldHiddenFromGuest = document.getElementById('fieldHiddenFromGuest');
const fieldNewBadge = document.getElementById('fieldNewBadge');
const photoUrlInput = document.getElementById('photoUrlInput');
const addPhotoUrlBtn = document.getElementById('addPhotoUrlBtn');
const photoPreviewGrid = document.getElementById('photoPreviewGrid');
const photoUploadMsg = document.getElementById('photoUploadMsg');
const loadImageLibraryBtn = document.getElementById('loadImageLibraryBtn');
const imageLibraryGrid = document.getElementById('imageLibraryGrid');
const githubPatInput = document.getElementById('githubPatInput');
const saveGithubPatBtn = document.getElementById('saveGithubPatBtn');
const uploadFolderInput = document.getElementById('uploadFolderInput');
const uploadDropZone = document.getElementById('uploadDropZone');
const uploadFileInput = document.getElementById('uploadFileInput');
const uploadMsg = document.getElementById('uploadMsg');

// 表單裡的商品照片/訪客規格/業務價格三大塊，點標題可以個別折疊，不用每次都捲過整段
document.querySelectorAll('.form-section-toggle').forEach(header => {
  const body = header.nextElementSibling;
  const arrow = header.querySelector('.toggle-arrow');
  header.addEventListener('click', () => {
    const collapsed = body.style.display === 'none';
    body.style.display = collapsed ? '' : 'none';
    arrow.textContent = collapsed ? '▾' : '▸';
  });
});

// 進階設定（業務登入碼管理、備份與還原）平常用不到，預設收起來
const toggleAdvancedBtn = document.getElementById('toggleAdvancedBtn');
const advancedSettings = document.getElementById('advancedSettings');
toggleAdvancedBtn.addEventListener('click', () => {
  const collapsed = advancedSettings.style.display === 'none';
  advancedSettings.style.display = collapsed ? '' : 'none';
  toggleAdvancedBtn.textContent = collapsed ? '進階設定（業務登入碼、備份與還原） ▴' : '進階設定（業務登入碼、備份與還原） ▾';
});
const guestSpecRows = document.getElementById('guestSpecRows');
const addGuestSpecBtn = document.getElementById('addGuestSpecBtn');
const fieldGuestNotes = document.getElementById('fieldGuestNotes');
const priceRows = document.getElementById('priceRows');
const addPriceBtn = document.getElementById('addPriceBtn');
const fieldPriceNotes = document.getElementById('fieldPriceNotes');
const categoryList = document.getElementById('categoryList');
const originList = document.getElementById('originList');
const manufacturerList = document.getElementById('manufacturerList');
const productTableBody = document.getElementById('productTableBody');
const clearAllBtn = document.getElementById('clearAllBtn');
const productSearchInput = document.getElementById('productSearchInput');

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

// 跟前台同一套分類順序，讓列表排序跟前台一致，上/下移才有意義
const CATEGORY_ORDER = ['軟體類', '蝦蟹類', '魚類', '螺貝類', '其他調理類'];

function categoryRank(category) {
  const idx = CATEGORY_ORDER.indexOf(category);
  return idx === -1 ? CATEGORY_ORDER.length : idx;
}

function sortedProducts() {
  return [...currentProducts].sort((a, b) => {
    const catDiff = categoryRank(a.category) - categoryRank(b.category);
    if (catDiff !== 0) return catDiff;
    const orderDiff = (a.sortOrder || 0) - (b.sortOrder || 0);
    if (orderDiff !== 0) return orderDiff;
    return a.name.localeCompare(b.name, 'zh-Hant');
  });
}

function nextSortOrderFor(category) {
  const inCategory = currentProducts.filter(p => p.category === category);
  if (!inCategory.length) return 10;
  return Math.max(...inCategory.map(p => p.sortOrder || 0)) + 10;
}

async function moveProduct(id, direction) {
  const list = sortedProducts();
  const idx = list.findIndex(p => p.id === id);
  const swapIdx = idx + direction;
  if (idx === -1 || swapIdx < 0 || swapIdx >= list.length) return;
  const a = list[idx];
  const b = list[swapIdx];
  if (a.category !== b.category) return;
  let aOrder = a.sortOrder || 0;
  let bOrder = b.sortOrder || 0;
  if (aOrder === bOrder) {
    // 兩者順序值相同時交換無效，先錯開一點
    bOrder = direction > 0 ? aOrder + 1 : aOrder - 1;
  }
  const { id: aId, ...aData } = a;
  const { id: bId, ...bData } = b;
  try {
    await updateProduct(aId, { ...aData, sortOrder: bOrder });
    await updateProduct(bId, { ...bData, sortOrder: aOrder });
  } catch (err) {
    alert('調整順序失敗：' + err.message);
  }
}

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

// ---------- 照片庫 (瀏覽 GitHub images 資料夾裡已經上傳的照片，點選即可加入；也可以永久刪除) ----------

const PAGES_BASE = 'https://yy3p9tw.github.io/seafood-price-list/';
const GITHUB_REPO = 'yy3p9tw/seafood-price-list';
const GITHUB_PAT_KEY = 'seafood_admin_github_pat';
let libraryFiles = null;

githubPatInput.value = localStorage.getItem(GITHUB_PAT_KEY) || '';

saveGithubPatBtn.addEventListener('click', () => {
  const pat = githubPatInput.value.trim();
  if (pat) {
    localStorage.setItem(GITHUB_PAT_KEY, pat);
    alert('已儲存權杖到這台瀏覽器');
  } else {
    localStorage.removeItem(GITHUB_PAT_KEY);
    alert('已清空權杖');
  }
});

function encodeGithubPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function deleteLibraryPhoto(path, url) {
  const pat = localStorage.getItem(GITHUB_PAT_KEY);
  if (!pat) {
    alert('請先在上面貼上 GitHub 個人存取權杖並存檔，才能刪除照片');
    return;
  }
  if (!confirm('確定要永久刪除這張照片嗎？這個動作無法復原。如果有商品正在使用這張照片，記得也要去該商品編輯畫面把它移除。')) return;
  try {
    const apiPath = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + encodeGithubPath(path);
    const getRes = await fetch(apiPath, { headers: { Authorization: 'Bearer ' + pat } });
    if (!getRes.ok) {
      const errBody = await getRes.json().catch(() => ({}));
      throw new Error('讀取檔案資訊失敗 (' + getRes.status + ')：' + (errBody.message || '未知錯誤'));
    }
    const fileInfo = await getRes.json();
    const delRes = await fetch(apiPath, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + pat, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '刪除照片：' + path, sha: fileInfo.sha, branch: 'main' })
    });
    if (!delRes.ok) {
      const errBody = await delRes.json().catch(() => ({}));
      throw new Error(errBody.message || ('刪除失敗 (' + delRes.status + ')'));
    }
    libraryFiles = libraryFiles.filter(f => f.path !== path);
    const idx = currentPhotos.indexOf(url);
    if (idx !== -1) {
      currentPhotos.splice(idx, 1);
      renderPhotoPreview();
    }
    renderImageLibrary();
  } catch (err) {
    alert('刪除失敗：' + err.message);
  }
}

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
            <div class="photo-preview-item library-item${selected ? ' selected' : ''}" data-url="${escapeHTML(f.url)}" data-path="${escapeHTML(f.path)}">
              <img src="${escapeHTML(f.url)}" alt="" loading="lazy" />
              <button type="button" class="photo-library-delete" data-url="${escapeHTML(f.url)}" data-path="${escapeHTML(f.path)}" title="永久刪除這張照片">🗑</button>
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
  imageLibraryGrid.querySelectorAll('.photo-library-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      deleteLibraryPhoto(btn.dataset.path, btn.dataset.url);
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
          path: t.path,
          url: PAGES_BASE + t.path.split('/').map(encodeURIComponent).join('/')
        };
      });
    renderImageLibrary();
  } catch (err) {
    imageLibraryGrid.style.display = '';
    imageLibraryGrid.innerHTML = `<p class="hint-text" style="color:var(--color-danger);">讀取照片庫失敗：${escapeHTML(err.message)}</p>`;
  }
});

// ---------- 上傳照片 (拖曳或選檔案，直接透過 GitHub API 存進 repo，不用先手動丟進資料夾) ----------

function resizeImageToDataURL(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('圖片讀取失敗'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('檔案讀取失敗'));
    reader.readAsDataURL(file);
  });
}

function sanitizeFileBase(name) {
  const base = name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9一-鿿-]+/g, '-').slice(0, 40);
  return base || 'photo';
}

async function uploadFilesToGithub(files) {
  const pat = localStorage.getItem(GITHUB_PAT_KEY);
  if (!pat) {
    uploadMsg.style.color = 'var(--color-danger)';
    uploadMsg.textContent = '請先在上面貼上 GitHub 個人存取權杖並存檔，才能上傳照片';
    return;
  }
  const folder = uploadFolderInput.value.trim();
  if (!folder) {
    uploadMsg.style.color = 'var(--color-danger)';
    uploadMsg.textContent = '請先填要放進哪個資料夾';
    return;
  }
  let uploadedCount = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    uploadMsg.style.color = 'var(--color-text-muted)';
    uploadMsg.textContent = `上傳中...（${i + 1}/${files.length}）`;
    try {
      const dataUrl = await resizeImageToDataURL(file);
      const base64 = dataUrl.split(',')[1];
      const filename = sanitizeFileBase(file.name) + '-' + Date.now() + '-' + i + '.jpg';
      const path = 'images/' + folder + '/' + filename;
      const apiPath = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + encodeGithubPath(path);
      const res = await fetch(apiPath, {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + pat, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '上傳照片：' + path, content: base64, branch: 'main' })
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || ('上傳失敗 (' + res.status + ')'));
      }
      const url = PAGES_BASE + path.split('/').map(encodeURIComponent).join('/');
      currentPhotos.push(url);
      if (libraryFiles) libraryFiles.push({ folder, path, url });
      uploadedCount++;
    } catch (err) {
      uploadMsg.style.color = 'var(--color-danger)';
      uploadMsg.textContent = `上傳失敗（${file.name}）：${err.message}`;
      renderPhotoPreview();
      renderImageLibrary();
      return;
    }
  }
  renderPhotoPreview();
  renderImageLibrary();
  uploadMsg.style.color = 'var(--color-success)';
  uploadMsg.textContent = `已上傳 ${uploadedCount} 張照片，並自動加入這個商品的已選擇照片`;
}

uploadDropZone.addEventListener('click', () => uploadFileInput.click());

uploadDropZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadDropZone.classList.add('dragover');
});

uploadDropZone.addEventListener('dragleave', () => {
  uploadDropZone.classList.remove('dragover');
});

uploadDropZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadDropZone.classList.remove('dragover');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  if (files.length) uploadFilesToGithub(files);
});

uploadFileInput.addEventListener('change', () => {
  const files = Array.from(uploadFileInput.files);
  if (files.length) uploadFilesToGithub(files);
  uploadFileInput.value = '';
});

// ---------- 表單 (預設收起來，點「新增產品」或表格裡的「編輯」才展開) ----------

function showForm() {
  productForm.style.display = '';
  addProductBtn.style.display = 'none';
}

function hideForm() {
  productForm.style.display = 'none';
  addProductBtn.style.display = '';
}

function resetForm() {
  editingId = null;
  productForm.reset();
  currentPhotos = [];
  renderPhotoPreview();
  photoUploadMsg.textContent = '';
  fieldHiddenFromGuest.checked = false;
  fieldNewBadge.checked = false;
  fieldHideOrigin.checked = false;
  guestSpecRows.innerHTML = '';
  fieldGuestNotes.value = '';
  priceRows.innerHTML = '';
  fieldPriceNotes.value = '';
  formTitle.textContent = '新增產品';
  submitBtn.textContent = '新增產品';
  cancelEditBtn.style.display = 'none';
  formMsg.textContent = '';
  hideForm();
}

addProductBtn.addEventListener('click', () => {
  resetForm();
  showForm();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

function loadProductIntoForm(product) {
  editingId = product.id;
  fieldName.value = product.name;
  fieldCategory.value = product.category;
  fieldOrigin.value = product.origin || '';
  fieldHideOrigin.checked = !!product.hideOrigin;
  fieldManufacturer.value = product.manufacturer || '';
  fieldPackaging.value = product.packagingSpec || '';
  currentPhotos = [...(product.photos || [])];
  renderPhotoPreview();
  photoUploadMsg.textContent = '';
  fieldHiddenFromGuest.checked = !!product.hiddenFromGuest;
  fieldNewBadge.checked = !!product.newBadge;
  guestSpecRows.innerHTML = '';
  (product.specs || []).forEach(s => addKeyValueRow(guestSpecRows, s.key, s.value, '規格名稱，例如：20/30', '規格內容，例如：尺寸/等級'));
  fieldGuestNotes.value = (product.specNotes || []).join('\n');
  priceRows.innerHTML = '';
  (product.prices || []).forEach(s => addKeyValueRow(priceRows, s.key, s.value, '規格名稱，例如：20/30 基本', '價格，例如：$200'));
  fieldPriceNotes.value = (product.priceNotes || []).join('\n');
  formTitle.textContent = '編輯產品：' + product.name;
  submitBtn.textContent = '儲存變更';
  cancelEditBtn.style.display = 'inline-block';
  showForm();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

productForm.addEventListener('submit', async e => {
  e.preventDefault();
  const category = fieldCategory.value.trim();
  const existingProduct = editingId ? currentProducts.find(p => p.id === editingId) : null;
  const data = {
    name: fieldName.value.trim(),
    category,
    origin: fieldOrigin.value.trim(),
    hideOrigin: fieldHideOrigin.checked,
    manufacturer: fieldManufacturer.value.trim(),
    packagingSpec: fieldPackaging.value.trim(),
    hiddenFromGuest: fieldHiddenFromGuest.checked,
    newBadge: fieldNewBadge.checked,
    // 編輯時沿用原本的排序值；新增產品預設排在該分類最後面，之後可以用上/下移調整
    sortOrder: existingProduct ? (existingProduct.sortOrder || 0) : nextSortOrderFor(category),
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
    productTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#6b7280;">尚未新增任何產品</td></tr>`;
    return;
  }

  const keyword = productSearchInput.value.trim().toLowerCase();
  const sorted = sortedProducts();
  const list = keyword
    ? sorted.filter(p => (p.name || '').toLowerCase().includes(keyword) || (p.category || '').toLowerCase().includes(keyword))
    : sorted;

  if (list.length === 0) {
    productTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#6b7280;">沒有符合搜尋的產品</td></tr>`;
    return;
  }

  productTableBody.innerHTML = list.map((p, i) => {
    const prev = list[i - 1];
    const next = list[i + 1];
    // 篩選時上/下移可能會跳過其他同分類的產品，關掉篩選再排序比較不會亂
    const canMoveUp = !keyword && prev && prev.category === p.category;
    const canMoveDown = !keyword && next && next.category === p.category;
    const showCategoryHeader = !prev || prev.category !== p.category;
    const categoryHeaderRow = showCategoryHeader
      ? `<tr class="admin-table-category-row"><td colspan="6">${escapeHTML(p.category || '未分類')}</td></tr>`
      : '';
    return categoryHeaderRow + `
    <tr>
      <td>${escapeHTML(p.name)}</td>
      <td>${(p.photos || []).length ? `${p.photos.length} 張` : '-'}</td>
      <td>${p.hiddenFromGuest ? '<span style="color:var(--color-danger); font-weight:600;">僅業務</span>' : '是'}</td>
      <td>${(p.specs || []).length ? `${p.specs.length} 項` : '-'}</td>
      <td>${(p.prices || []).length ? `${p.prices.length} 項` : '-'}</td>
      <td>
        <div class="row-actions">
          <button type="button" class="secondary move-up-btn" data-id="${p.id}" title="上移" ${canMoveUp ? '' : 'disabled'}>▲</button>
          <button type="button" class="secondary move-down-btn" data-id="${p.id}" title="下移" ${canMoveDown ? '' : 'disabled'}>▼</button>
          <button class="secondary edit-btn" data-id="${p.id}">編輯</button>
          <button class="danger delete-btn" data-id="${p.id}">刪除</button>
        </div>
      </td>
    </tr>
  `;
  }).join('');

  productTableBody.querySelectorAll('.move-up-btn').forEach(btn => {
    btn.addEventListener('click', () => moveProduct(btn.dataset.id, -1));
  });

  productTableBody.querySelectorAll('.move-down-btn').forEach(btn => {
    btn.addEventListener('click', () => moveProduct(btn.dataset.id, 1));
  });

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

productSearchInput.addEventListener('input', renderTable);

function renderDatalists() {
  const categories = Array.from(new Set(currentProducts.map(p => p.category).filter(Boolean))).sort();
  const origins = Array.from(new Set(currentProducts.map(p => p.origin).filter(Boolean))).sort();
  const manufacturers = Array.from(new Set(currentProducts.map(p => p.manufacturer).filter(Boolean))).sort();
  categoryList.innerHTML = categories.map(c => `<option value="${escapeHTML(c)}"></option>`).join('');
  originList.innerHTML = origins.map(o => `<option value="${escapeHTML(o)}"></option>`).join('');
  manufacturerList.innerHTML = manufacturers.map(m => `<option value="${escapeHTML(m)}"></option>`).join('');
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
