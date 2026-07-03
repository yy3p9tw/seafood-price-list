// 公開展示頁：即時訂閱 Firestore 的商品資料，後台一存檔，這裡不用重新整理就會自動更新。
import { subscribeToProducts, formatPrice } from './products-service.js';

const productGrid = document.getElementById('productGrid');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const sortSelect = document.getElementById('sortSelect');
const dataSourceHint = document.getElementById('dataSourceHint');

let allProducts = [];

const RECENT_UPDATE_MS = 14 * 24 * 60 * 60 * 1000; // 14 天內視為「本次更新」
const CATEGORY_ORDER = ['軟體類', '蝦類', '魚類', '螺貝類', '其他'];

function categoryRank(category) {
  const idx = CATEGORY_ORDER.indexOf(category);
  return idx === -1 ? CATEGORY_ORDER.length : idx;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function isRecentlyUpdated(product) {
  return product.updatedAt && (Date.now() - product.updatedAt) < RECENT_UPDATE_MS;
}

function formatQuoteText(product) {
  const lines = [product.name];
  const metaParts = [];
  if (product.origin) metaParts.push(`產地：${product.origin}`);
  if (product.packagingSpec) metaParts.push(`包裝：${product.packagingSpec}`);
  if (metaParts.length) lines.push(metaParts.join('｜'));
  if (product.specs && product.specs.length) {
    lines.push('—');
    product.specs.forEach(s => lines.push(`${s.key}：${s.value}`));
  } else {
    lines.push(formatPrice(product.price, product.unit));
  }
  return lines.join('\n');
}

function getCategoriesFrom(products) {
  const set = new Set(products.map(p => p.category).filter(Boolean));
  return Array.from(set).sort();
}

function renderCategoryOptions() {
  const categories = getCategoriesFrom(allProducts);
  const current = categoryFilter.value;
  categoryFilter.innerHTML = '<option value="">全部分類</option>' +
    categories.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
  categoryFilter.value = categories.includes(current) ? current : '';
}

function productMatchesKeyword(product, keyword) {
  if (!keyword) return true;
  const haystacks = [
    product.name,
    product.category,
    product.origin,
    product.packagingSpec,
    ...(product.specs || []).flatMap(s => [s.key, s.value])
  ];
  return haystacks.some(text => (text || '').toLowerCase().includes(keyword));
}

function renderProducts() {
  let products = allProducts;

  const keyword = searchInput.value.trim().toLowerCase();
  products = products.filter(p => productMatchesKeyword(p, keyword));

  const category = categoryFilter.value;
  if (category) {
    products = products.filter(p => p.category === category);
  }

  const sort = sortSelect.value;
  if (sort === 'price-asc') {
    products = [...products].sort((a, b) => a.price - b.price);
  } else if (sort === 'price-desc') {
    products = [...products].sort((a, b) => b.price - a.price);
  } else {
    // 預設先依分類排序（軟體類、蝦類、魚類、螺貝類…），同分類內再依名稱排序，
    // 讓同系列商品（例如「軟絲 3A」「軟絲 4A」）自然排在一起
    products = [...products].sort((a, b) => {
      const catDiff = categoryRank(a.category) - categoryRank(b.category);
      if (catDiff !== 0) return catDiff;
      return a.name.localeCompare(b.name, 'zh-Hant');
    });
  }

  if (products.length === 0) {
    productGrid.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  productGrid.innerHTML = products.map(p => `
    <div class="product-card">
      <div class="badge-row">
        ${p.category ? `<span class="badge">${escapeHTML(p.category)}</span>` : ''}
        ${isRecentlyUpdated(p) ? `<span class="badge badge-new">本次更新</span>` : ''}
      </div>
      <h3>${escapeHTML(p.name)}</h3>
      ${(!p.specs || p.specs.length === 0) ? `<div class="price">${formatPrice(p.price, p.unit)}</div>` : ''}
      ${(p.origin || p.packagingSpec) ? `
        <div class="meta-info">
          ${p.origin ? `<span>產地：${escapeHTML(p.origin)}</span>` : ''}
          ${p.packagingSpec ? `<span>包裝規格：${escapeHTML(p.packagingSpec)}</span>` : ''}
        </div>
      ` : ''}
      ${p.specs && p.specs.length ? `
        <ul class="spec-list">
          ${p.specs.map(s => `<li><span>${escapeHTML(s.key)}</span><span>${escapeHTML(s.value)}</span></li>`).join('')}
        </ul>
      ` : ''}
      <button type="button" class="secondary copy-quote-btn" data-id="${p.id}">複製報價</button>
    </div>
  `).join('');
}

productGrid.addEventListener('click', async e => {
  const btn = e.target.closest('.copy-quote-btn');
  if (!btn) return;
  const product = allProducts.find(p => p.id === btn.dataset.id);
  if (!product) return;
  try {
    await navigator.clipboard.writeText(formatQuoteText(product));
    const original = btn.textContent;
    btn.textContent = '已複製！';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, 1500);
  } catch (err) {
    alert('複製失敗，請手動選取文字複製');
  }
});

searchInput.addEventListener('input', renderProducts);
categoryFilter.addEventListener('change', renderProducts);
sortSelect.addEventListener('change', renderProducts);

subscribeToProducts(
  products => {
    allProducts = products;
    if (dataSourceHint) dataSourceHint.style.display = 'none';
    renderCategoryOptions();
    renderProducts();
  },
  err => {
    console.error('讀取商品資料失敗', err);
    if (dataSourceHint) {
      dataSourceHint.textContent = '目前無法連線到資料庫，請稍後再試或聯絡管理員。';
      dataSourceHint.style.display = 'block';
    }
  }
);
