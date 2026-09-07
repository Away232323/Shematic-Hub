const state = {
  schematics: [],
  search: '',
  category: 'all',
  price: 'all',
  sort: 'newest'
};

const grid = document.getElementById('schematicGrid');
const emptyState = document.getElementById('emptyState');
const resultCount = document.getElementById('resultCount');
const heroTotal = document.getElementById('heroTotal');
const template = document.getElementById('schematicCardTemplate');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const priceFilter = document.getElementById('priceFilter');
const sortFilter = document.getElementById('sortFilter');
const chips = [...document.querySelectorAll('.chip')];
const categoryTiles = [...document.querySelectorAll('[data-cat-target]')];

const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

function money(value) {
  const n = Number(value || 0);
  if (n <= 0) return 'FREE';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function resolveAsset(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return path.replace(/^\//, '');
}

function filteredSchematics() {
  const query = state.search.trim().toLowerCase();
  const items = state.schematics.filter(item => {
    const haystack = [item.title, item.description, item.category, item.minecraftVersion, item.fileType]
      .filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = !query || haystack.includes(query);
    const matchesCategory = state.category === 'all' || item.category === state.category;
    const price = Number(item.price || 0);
    const matchesPrice = state.price === 'all' || (state.price === 'free' ? price <= 0 : price > 0);
    return matchesSearch && matchesCategory && matchesPrice;
  });

  items.sort((a, b) => {
    if (state.sort === 'name') return String(a.title || '').localeCompare(String(b.title || ''), 'de');
    if (state.sort === 'priceAsc') return Number(a.price || 0) - Number(b.price || 0);
    if (state.sort === 'priceDesc') return Number(b.price || 0) - Number(a.price || 0);
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });
  return items;
}

function syncCategoryUi() {
  if (categoryFilter) categoryFilter.value = state.category;
  chips.forEach(chip => chip.classList.toggle('active', chip.dataset.category === state.category));
}

function setCategory(category, scroll = false) {
  state.category = category || 'all';
  syncCategoryUi();
  render();
  if (scroll) document.getElementById('schematics')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function render() {
  const items = filteredSchematics();
  grid.innerHTML = '';
  resultCount.textContent = `${items.length} ${items.length === 1 ? 'Schematic' : 'Schematics'}`;
  if (heroTotal) heroTotal.textContent = state.schematics.length;
  emptyState.hidden = items.length !== 0;

  items.forEach((item, index) => {
    const node = template.content.cloneNode(true);
    const card = node.querySelector('.schematic-card');
    const preview = node.querySelector('.preview');
    const fallback = node.querySelector('.preview-fallback');
    const category = node.querySelector('.category-badge');
    const price = node.querySelector('.price-badge');
    const action = node.querySelector('.card-action');

    node.querySelector('.title').textContent = item.title || 'Unnamed Schematic';
    node.querySelector('.description').textContent = item.description || 'Minecraft Schematic';
    node.querySelector('.version').textContent = item.minecraftVersion ? `MC ${item.minecraftVersion}` : 'MINECRAFT';
    node.querySelector('.date').textContent = formatDate(item.createdAt);
    node.querySelector('.file-type').textContent = (item.fileType || 'LITEMATIC').toUpperCase();
    category.textContent = item.category || 'Other';
    price.textContent = money(item.price);
    if (Number(item.price || 0) > 0) price.classList.add('paid');

    if (item.previewPath) {
      preview.src = resolveAsset(item.previewPath);
      preview.alt = `${item.title || 'Schematic'} Vorschau`;
      preview.addEventListener('load', () => fallback.classList.add('hidden'));
      preview.addEventListener('error', () => preview.classList.add('hidden'));
    } else {
      preview.classList.add('hidden');
    }

    if (Number(item.price || 0) <= 0 && item.downloadPath) {
      action.textContent = 'Download ↓';
      action.href = resolveAsset(item.downloadPath);
      action.setAttribute('download', '');
    } else if (Number(item.price || 0) > 0 && item.purchaseUrl) {
      action.textContent = `Kaufen ${money(item.price)}`;
      action.href = item.purchaseUrl;
    } else {
      action.textContent = 'Bald verfügbar';
      action.removeAttribute('href');
      action.style.opacity = '.5';
      action.style.pointerEvents = 'none';
    }

    card.dataset.id = item.id || '';
    card.style.animationDelay = `${Math.min(index * 45, 300)}ms`;
    grid.appendChild(node);
  });
}

async function loadSchematics() {
  try {
    const response = await fetch(`data/schematics.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.schematics = Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Could not load schematics:', error);
    state.schematics = [];
  }
  render();
}

searchInput?.addEventListener('input', e => { state.search = e.target.value; render(); });
categoryFilter?.addEventListener('change', e => setCategory(e.target.value));
priceFilter?.addEventListener('change', e => { state.price = e.target.value; render(); });
sortFilter?.addEventListener('change', e => { state.sort = e.target.value; render(); });
chips.forEach(chip => chip.addEventListener('click', () => setCategory(chip.dataset.category)));
categoryTiles.forEach(tile => tile.addEventListener('click', () => setCategory(tile.dataset.catTarget, true)));

document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    searchInput?.focus();
    document.getElementById('schematics')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

const revealObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 })
  : null;

document.querySelectorAll('.reveal').forEach(el => {
  if (revealObserver) revealObserver.observe(el);
  else el.classList.add('visible');
});

loadSchematics();
