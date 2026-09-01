// 公開展示頁：即時訂閱 Firestore 的商品資料，後台一存檔，這裡不用重新整理就會自動更新。
import { subscribeToProducts } from './products-service.js?v=61';
import { hashPassword, getReportPasswordHash } from './settings-service.js?v=61';

const productGrid = document.getElementById('productGrid');
const productOverview = document.getElementById('productOverview');
const backToOverviewBtn = document.getElementById('backToOverviewBtn');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const categoryFilterChips = document.getElementById('categoryFilterChips');
let selectedCategory = '';
const dataSourceHint = document.getElementById('dataSourceHint');
const siteFooter = document.getElementById('siteFooter');

// 店家聯絡資訊：顯示在頁尾（全部留空頁尾就不會顯示文字，但圖標一定會顯示）
const BUSINESS_INFO = {
  name: '磐宇生物科技股份有限公司',
  phone: '02-2225-0202',
  fax: '02-2900-8168',
  address: '243081 新北市泰山區憲訓路36號',
  taxId: '70604138',
  hours: ''
};

function renderFooter() {
  const rows = [
    BUSINESS_INFO.address ? `<span>地址：${escapeHTML(BUSINESS_INFO.address)}</span>` : '',
    BUSINESS_INFO.phone ? `<span>電話：${escapeHTML(BUSINESS_INFO.phone)}</span>` : '',
    BUSINESS_INFO.fax ? `<span>傳真：${escapeHTML(BUSINESS_INFO.fax)}</span>` : '',
    BUSINESS_INFO.taxId ? `<span>統一編號：${escapeHTML(BUSINESS_INFO.taxId)}</span>` : '',
    BUSINESS_INFO.hours ? `<span>營業時間：${escapeHTML(BUSINESS_INFO.hours)}</span>` : ''
  ].filter(Boolean);
  siteFooter.innerHTML = `
    <img src="logo.png" alt="品牌圖標" class="footer-logo" />
    ${BUSINESS_INFO.name ? `<div class="footer-name">${escapeHTML(BUSINESS_INFO.name)}</div>` : ''}
    ${rows.length ? `<div class="footer-details">${rows.join('')}</div>` : ''}
  `;
  siteFooter.style.display = '';
}

let allProducts = [];

const CATEGORY_ORDER = ['軟體類', '蝦蟹類', '魚類', '螺貝類', '其他調理類'];

// 分類標題旁的小圖示，純手繪 inline SVG（不依賴外部圖示網站，避免又遇到連結失效/需要標註來源的問題）
const CATEGORY_ICONS = {
  '軟體類': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c3 0 5.5 2.3 5.5 6 0 2-.8 3.6-2 4.8"/><path d="M12 3c-3 0-5.5 2.3-5.5 6 0 2 .8 3.6 2 4.8"/><path d="M8.5 13.8c0 2 .3 4-1 6.2M11 14.3c0 2.3.2 4.3-.7 6.7M13 14.3c0 2.3-.2 4.3.7 6.7M15.5 13.8c0 2-.3 4 1 6.2"/></svg>',
  '蝦蟹類': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17c-1.5-3 0-9 6-11 4-1.3 8 .5 9 4 .8 3-1 5.5-4 6.5"/><path d="M16 16.5c1 1 1 2.5 0 3.5M13 17.5c.6 1 .5 2.2-.3 3"/><path d="M11 6c-.8-1-2-1.6-3.2-1.6M9.5 7.3C8.7 6.5 7.6 6 6.5 6"/></svg>',
  '魚類': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12c3-4 8-6 13-4 2 .8 3.5 2.3 4.5 4-1 1.7-2.5 3.2-4.5 4-5 2-10 0-13-4z"/><path d="M17 8l3-3M17 16l3 3"/><circle cx="7.5" cy="11" r="0.9" fill="currentColor" stroke="none"/></svg>',
  '螺貝類': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20c-4.4 0-8-3.6-8-8s3.6-8 8-8 7 3 7 6.5-2.5 5.5-5.5 5.5S8 14 8 11.5 9.8 8 12 8"/></svg>',
  '其他調理類': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11h16l-1.2 6.5a2 2 0 01-2 1.5H7.2a2 2 0 01-2-1.5L4 11z"/><path d="M2 11h20M9 5.5c0 1-.7 1-.7 2M12 5c0 1-.7 1-.7 2M15 5.5c0 1-.7 1-.7 2"/></svg>'
};
const DEFAULT_CATEGORY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/></svg>';

// 同一系列商品（例如「軟絲 3A」「軟絲 4A」）在總覽區只顯示一個名稱，不用每個規格都列一個
const OVERVIEW_GROUP_PREFIXES = [
  '軟絲 ',
  '藍龍軟絲 ',
  '白蝦仁(調理) ',
  '白蝦AZU(850) ',
  '白蝦 藍翡翠Ａ(850) ',
  '冷凍干貝(調理)',
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

// 原料/產地/包裝規格這幾行用同一個排版：標籤固定寬度，值另外分行時會對齊標籤後面，不會頂到最左邊
function metaLine(label, value) {
  return `<div class="meta-line"><span class="meta-label">${escapeHTML(label)}：</span><span class="meta-value">${escapeHTML(value)}</span></div>`;
}

// 報告檔名只顯示英數字編號（例如 AFA26401641），中文品名/廠商名跟後台上傳時
// 補的「-時間戳-序號」都不顯示，訪客看到的就是報告單號
function formatReportLabel(url) {
  const filename = decodeURIComponent(url.split('/').pop() || '');
  const stripped = filename.replace(/\.pdf$/i, '').replace(/-\d{10,}-\d+$/, '');
  const match = stripped.match(/[A-Za-z0-9]{5,}/);
  return match ? match[0] : stripped;
}

// 照片燈箱：點縮圖放大看，點右上角 ✕ 或點任何地方關閉
const lightbox = document.createElement('div');
lightbox.className = 'photo-lightbox';
lightbox.innerHTML = '<button type="button" class="lightbox-close" aria-label="關閉">✕</button><img />';
lightbox.addEventListener('click', () => lightbox.classList.remove('open'));
document.body.appendChild(lightbox);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') lightbox.classList.remove('open');
});

function openLightbox(src) {
  lightbox.querySelector('img').src = src;
  lightbox.classList.add('open');
}

// 檢驗報告下載：輸入一次密碼後，同一台裝置這次瀏覽就不用再輸入
const REPORT_UNLOCK_KEY = 'seafood_report_unlocked';
let cachedReportPasswordHash = null;
let pendingReportUrl = null;

const reportModal = document.createElement('div');
reportModal.className = 'report-password-modal';
reportModal.innerHTML = `
  <div class="report-password-box">
    <button type="button" class="lightbox-close report-modal-close" aria-label="關閉">✕</button>
    <h2>請輸入密碼</h2>
    <p class="hint-text">下載檢驗報告需要密碼，請洽業務或客服人員。</p>
    <input type="text" inputmode="numeric" class="report-password-field" placeholder="密碼" autocomplete="off" />
    <div class="error-text report-password-error"></div>
    <button type="button" class="report-password-submit">確認</button>
  </div>
`;
document.body.appendChild(reportModal);

const reportPasswordField = reportModal.querySelector('.report-password-field');
const reportPasswordError = reportModal.querySelector('.report-password-error');

function closeReportModal() {
  reportModal.classList.remove('open');
  reportPasswordField.value = '';
  reportPasswordError.textContent = '';
  pendingReportUrl = null;
}

function openReportModal(url) {
  pendingReportUrl = url;
  reportPasswordError.textContent = '';
  reportPasswordField.value = '';
  reportModal.classList.add('open');
  reportPasswordField.focus();
}

reportModal.addEventListener('click', e => {
  if (e.target === reportModal) closeReportModal();
});
reportModal.querySelector('.report-modal-close').addEventListener('click', closeReportModal);

async function submitReportPassword() {
  const entered = reportPasswordField.value.trim();
  if (!entered) return;
  try {
    if (cachedReportPasswordHash === null) {
      cachedReportPasswordHash = await getReportPasswordHash();
    }
    const enteredHash = await hashPassword(entered);
    if (!cachedReportPasswordHash || enteredHash !== cachedReportPasswordHash) {
      reportPasswordError.textContent = '密碼不正確';
      return;
    }
    sessionStorage.setItem(REPORT_UNLOCK_KEY, '1');
    const url = pendingReportUrl;
    closeReportModal();
    if (url) window.open(url, '_blank', 'noopener');
  } catch (err) {
    reportPasswordError.textContent = '驗證失敗，請稍後再試';
  }
}

reportModal.querySelector('.report-password-submit').addEventListener('click', submitReportPassword);
reportPasswordField.addEventListener('keydown', e => {
  if (e.key === 'Enter') submitReportPassword();
});

function requestReportDownload(url) {
  if (sessionStorage.getItem(REPORT_UNLOCK_KEY) === '1') {
    window.open(url, '_blank', 'noopener');
    return;
  }
  openReportModal(url);
}

function getCategoriesFrom(products) {
  const set = new Set(products.map(p => p.category).filter(Boolean));
  return Array.from(set).sort();
}

function renderCategoryOptions() {
  const categories = getCategoriesFrom(allProducts);
  if (selectedCategory && !categories.includes(selectedCategory)) {
    selectedCategory = '';
  }
  const chips = [{ value: '', label: '全部分類' }, ...categories.map(c => ({ value: c, label: c }))];
  categoryFilterChips.innerHTML = chips.map(chip => `
    <button type="button" class="category-filter-chip${chip.value === selectedCategory ? ' active' : ''}" data-category="${escapeHTML(chip.value)}">${escapeHTML(chip.label)}</button>
  `).join('');
}

categoryFilterChips.addEventListener('click', e => {
  const chip = e.target.closest('.category-filter-chip');
  if (!chip) return;
  selectedCategory = chip.dataset.category;
  renderCategoryOptions();
  renderProducts();
});

function productMatchesKeyword(product, keyword) {
  if (!keyword) return true;
  const haystacks = [
    product.name,
    product.category,
    product.origin,
    product.manufacturer,
    product.packagingSpec,
    ...(product.specNotes || [])
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

  productOverview.innerHTML = `
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

  if (selectedCategory) {
    products = products.filter(p => p.category === selectedCategory);
  }

  // 先依分類排序（軟體類、蝦類、魚類、螺貝類…），同分類內再依後台設定的順序排序
  // （後台可以用上/下移調整，不用再靠中文排序猜順序）
  products = [...products].sort((a, b) => {
    const catDiff = categoryRank(a.category) - categoryRank(b.category);
    if (catDiff !== 0) return catDiff;
    const orderDiff = (a.sortOrder || 0) - (b.sortOrder || 0);
    if (orderDiff !== 0) return orderDiff;
    return a.name.localeCompare(b.name, 'zh-Hant');
  });

  if (products.length === 0) {
    productGrid.innerHTML = '';
    productOverview.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  renderOverview(products);

  const cardHTML = p => {
    const specNotes = p.specNotes || [];
    const photos = p.photos || [];
    return `
    <div class="product-card" id="product-${p.id}">
      <h3>${escapeHTML(p.name)}</h3>
      ${((!p.hideOrigin && p.origin) || p.manufacturer || p.packagingSpec) ? `
        <div class="meta-info">
          ${(!p.hideOrigin && p.origin) ? metaLine('原料產地', p.origin) : ''}
          ${p.manufacturer ? metaLine('生產加工', p.manufacturer) : ''}
          ${p.packagingSpec ? metaLine('包裝規格', p.packagingSpec) : ''}
        </div>
      ` : ''}
      ${photos.length ? `
        <div class="photo-strip">
          ${photos.map((url, i) => `<img class="photo-thumb" src="${escapeHTML(url)}" data-product-id="${p.id}" data-photo-index="${i}" alt="${escapeHTML(p.name)}" loading="lazy" />`).join('')}
        </div>
      ` : ''}
      ${specNotes.length ? `
        <div class="spec-notes">
          <div class="spec-notes-title">備註</div>
          <ul>
            ${specNotes.map(n => `<li>${escapeHTML(n)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      ${(p.reportUrls || []).length ? `
        <div class="report-download-list">
          ${p.reportUrls.map(url => `
            <button type="button" class="report-download-btn" data-report-url="${escapeHTML(url)}">📄 ${escapeHTML(formatReportLabel(url))}</button>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
  };

  // 依分類分組並插入標題，讓整份目錄第一眼就能看出有哪些大類、方便瀏覽找商品
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
    <h2 class="category-heading">
      <span class="category-icon-badge">${CATEGORY_ICONS[g.category] || DEFAULT_CATEGORY_ICON}</span>
      ${escapeHTML(g.category)}<span class="category-count">${g.items.length} 項</span>
    </h2>
    <div class="product-grid">${g.items.map(cardHTML).join('')}</div>
  `).join('');
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

productGrid.addEventListener('click', e => {
  const thumb = e.target.closest('.photo-thumb');
  if (thumb) {
    openLightbox(thumb.src);
    return;
  }
  const reportBtn = e.target.closest('.report-download-btn');
  if (reportBtn) {
    requestReportDownload(reportBtn.dataset.reportUrl);
  }
});

searchInput.addEventListener('input', renderProducts);

renderFooter();

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
