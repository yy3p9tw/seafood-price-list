// 公開展示頁：即時訂閱 Firestore 的商品資料，後台一存檔，這裡不用重新整理就會自動更新。
import { subscribeToProducts, formatPrice } from './products-service.js';

const productGrid = document.getElementById('productGrid');
const productOverview = document.getElementById('productOverview');
const backToOverviewBtn = document.getElementById('backToOverviewBtn');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const sortSelect = document.getElementById('sortSelect');
const dataSourceHint = document.getElementById('dataSourceHint');

let allProducts = [];

const RECENT_UPDATE_MS = 14 * 24 * 60 * 60 * 1000; // 14 天內視為「本次更新」
const CATEGORY_ORDER = ['軟體類', '蝦類', '魚類', '螺貝類', '其他'];

// 同一系列商品（例如「軟絲 3A」「軟絲 4A」）在總覽區只顯示一個名稱，不用每個規格都列一個
const OVERVIEW_GROUP_PREFIXES = [
  '軟絲 ',
  '藍龍軟絲 ',
  '調理白蝦仁 ',
  '白蝦AZU(850) ',
  '白蝦 藍翡翠Ａ(850) ',
  '調理干貝（俗稱美國干貝）',
];

function getOverviewName(name) {
  for (const prefix of OVERVIEW_GROUP_PREFIXES) {
    if (name.startsWith(prefix) && name.length > prefix.length) {
      return prefix.trim();
    }
  }
  return name;
}

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

function renderOverview(products) {
  // 手機上卡片一個個往下拉才看得到，先在最上面放一份「全部品項」總覽，
  // 讓人一進來就知道有哪些東西在賣，點名稱可以直接跳到該商品卡片。
  // 同系列規格（例如白蝦AZU 六種尺寸）只顯示一個名稱，不然總覽會被規格洗版。
  const groups = [];
  const seenOverviewNames = new Set();
  products.forEach(p => {
    const cat = p.category || '未分類';
    const overviewName = getOverviewName(p.name);
    const dedupeKey = cat + '||' + overviewName;
    if (seenOverviewNames.has(dedupeKey)) return;
    seenOverviewNames.add(dedupeKey);

    const lastGroup = groups[groups.length - 1];
    const chip = { id: p.id, label: overviewName };
    if (!lastGroup || lastGroup.category !== cat) {
      groups.push({ category: cat, items: [chip] });
    } else {
      lastGroup.items.push(chip);
    }
  });

  const chipCount = groups.reduce((sum, g) => sum + g.items.length, 0);

  productOverview.innerHTML = `
    <div class="overview-title">全部品項（共 ${chipCount} 項，點名稱可直接跳過去）</div>
    ${groups.map(g => `
      <div class="overview-group">
        <span class="overview-cat">${escapeHTML(g.category)}</span>
        <div class="overview-chips">
          ${g.items.map(chip => `<button type="button" class="overview-chip" data-id="${chip.id}">${escapeHTML(chip.label)}</button>`).join('')}
        </div>
      </div>
    `).join('')}
  `;
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
    productOverview.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  renderOverview(products);

  const cardHTML = p => `
    <div class="product-card" id="product-${p.id}">
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
  `;

  // 預設排序時，依分類分組並插入標題，讓整份目錄第一眼就能看出有哪些大類、方便瀏覽找商品
  if (sort !== 'price-asc' && sort !== 'price-desc') {
    const groups = [];
    products.forEach(p => {
      const cat = p.category || '未分類';
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.category !== cat) {
        groups.push({ category: cat, items: [p] });
      } else {
        lastGroup.items.push(p);
      }
    });
    productGrid.innerHTML = groups.map(g => `
      <h2 class="category-heading">${escapeHTML(g.category)}<span class="category-count">${g.items.length} 項</span></h2>
      <div class="product-grid">${g.items.map(cardHTML).join('')}</div>
    `).join('');
  } else {
    productGrid.innerHTML = `<div class="product-grid">${products.map(cardHTML).join('')}</div>`;
  }
}

productOverview.addEventListener('click', e => {
  const chip = e.target.closest('.overview-chip');
  if (!chip) return;
  const card = document.getElementById('product-' + chip.dataset.id);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('highlight');
  setTimeout(() => card.classList.remove('highlight'), 1500);
});

backToOverviewBtn.addEventListener('click', () => {
  productOverview.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

window.addEventListener('scroll', () => {
  const overviewBottom = productOverview.offsetTop + productOverview.offsetHeight;
  backToOverviewBtn.style.display = window.scrollY > overviewBottom ? 'block' : 'none';
});

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
