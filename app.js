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
const template = document.getElementById('schematicCardTemplate');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const priceFilter = document.getElementById('priceFilter');
const sortFilter = document.getElementById('sortFilter');

document.getElementById('year').textContent = new Date().getFullYear();

function money(value) {
  const n = Number(value || 0);
  if (n <= 0) return 'FREE';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function filteredSchematics() {
  const query = state.search.trim().toLowerCase();
  const items = state.schematics.filter(item => {
    const haystack = [item.title, item.description, item.category, item.minecraft_version, item.author_username]
      .filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = !query || haystack.includes(query);
    const matchesCategory = state.category === 'all' || item.category === state.category;
    const p = Number(item.price || 0);
    const matchesPrice = state.price === 'all' || (state.price === 'free' ? p <= 0 : p > 0);
    return matchesSearch && matchesCategory && matchesPrice;
  });

  items.sort((a, b) => {
    if (state.sort === 'name') return String(a.title).localeCompare(String(b.title), 'de');
    if (state.sort === 'priceAsc') return Number(a.price || 0) - Number(b.price || 0);
    if (state.sort === 'priceDesc') return Number(b.price || 0) - Number(a.price || 0);
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });
  return items;
}

function firstPreview(item) {
  if (item.preview_url) return item.preview_url;
  if (Array.isArray(item.gallery_urls) && item.gallery_urls.length) return item.gallery_urls[0];
  return '';
}

function render() {
  const items = filteredSchematics();
  grid.innerHTML = '';
  resultCount.textContent = `${items.length} ${items.length === 1 ? 'Schematic' : 'Schematics'}`;
  document.getElementById('heroTotal').textContent = state.schematics.length;
  emptyState.hidden = items.length !== 0;

  for (const item of items) {
    const node = template.content.cloneNode(true);
    const card = node.querySelector('.schematic-card');
    const preview = node.querySelector('.preview');
    const fallback = node.querySelector('.preview-fallback');
    const category = node.querySelector('.category-badge');
    const price = node.querySelector('.price-badge');
    const action = node.querySelector('.card-action');

    card.dataset.schematicId = item.id;
    node.querySelector('.title').textContent = item.title || 'Unnamed Schematic';
    node.querySelector('.description').textContent = item.description || 'Minecraft Schematic';
    node.querySelector('.version').textContent = item.minecraft_version ? `MC ${item.minecraft_version}` : 'MINECRAFT';
    node.querySelector('.date').textContent = formatDate(item.created_at);
    node.querySelector('.file-type').textContent = (item.file_type || 'LITEMATIC').toUpperCase();
    category.textContent = item.category || 'Other';
    price.textContent = money(item.price);

    if (Number(item.price || 0) > 0) price.classList.add('paid');

    const previewUrl = firstPreview(item);
    if (previewUrl) {
      preview.src = previewUrl;
      preview.alt = `${item.title || 'Schematic'} Vorschau`;
      preview.addEventListener('load', () => fallback.classList.add('hidden'));
      preview.addEventListener('error', () => preview.classList.add('hidden'));
    } else {
      preview.classList.add('hidden');
    }

    if (Number(item.price || 0) <= 0 && item.download_url) {
      action.textContent = 'Download';
      action.href = item.download_url;
      action.setAttribute('download', '');
    } else if (Number(item.price || 0) > 0 && item.purchase_url) {
      action.textContent = `Kaufen · ${money(item.price)}`;
      action.href = item.purchase_url;
    } else {
      action.textContent = 'Bald verfügbar';
      action.removeAttribute('href');
      action.style.opacity = '.5';
      action.style.pointerEvents = 'none';
    }

    card.tabIndex = 0;
    card.setAttribute('role', 'link');
    card.setAttribute('aria-label', `${item.title || 'Schematic'} ansehen`);
    const openDetails = event => {
      if (event?.target?.closest?.('.card-action')) return;
      const url = `schematic.html?id=${encodeURIComponent(item.id)}`;
      if (window.hubNavigate) window.hubNavigate(url);
      else location.href = url;
    };
    card.addEventListener('click', openDetails);
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDetails(event);
      }
    });

    grid.appendChild(node);
  }
}

async function loadFromSupabase() {
  if (!window.supaClient) throw new Error('Supabase client missing');
  const { data, error } = await window.supaClient
    .from('schematics')
    .select('*')
    .eq('published', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function loadLegacyFallback() {
  const response = await fetch(`data/schematics.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) return [];
  const data = await response.json();
  if (!Array.isArray(data)) return [];
  return data.map(item => ({
    id: item.id,
    title: item.title,
    description: item.description,
    category: item.category,
    minecraft_version: item.minecraftVersion,
    price: item.price,
    file_type: item.fileType,
    download_url: item.downloadPath,
    preview_url: item.previewPath,
    purchase_url: item.purchaseUrl,
    created_at: item.createdAt,
    published: true
  }));
}

async function loadSchematics() {
  try {
    state.schematics = await loadFromSupabase();
  } catch (error) {
    console.error('Supabase catalog failed, using fallback', error);
    try { state.schematics = await loadLegacyFallback(); }
    catch (_) { state.schematics = []; }
  }
  render();
}

searchInput.addEventListener('input', event => {
  state.search = event.target.value;
  render();
});
categoryFilter.addEventListener('change', event => {
  state.category = event.target.value;
  render();
});
priceFilter.addEventListener('change', event => {
  state.price = event.target.value;
  render();
});
sortFilter.addEventListener('change', event => {
  state.sort = event.target.value;
  render();
});

document.querySelectorAll('[data-cat-target]').forEach(button => {
  button.addEventListener('click', () => {
    state.category = button.dataset.catTarget;
    categoryFilter.value = state.category;
    document.getElementById('schematics').scrollIntoView({ behavior: 'smooth' });
    render();
  });
});

document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    searchInput.focus();
  }
});

loadSchematics();
