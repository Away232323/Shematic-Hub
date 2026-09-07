const client = window.supaClient;
const byId = id => document.getElementById(id);
const schematicId = new URLSearchParams(location.search).get('id');
let item = null;
let currentUser = null;
let currentProfile = null;
let gallery = [];
let activeImage = 0;

function money(value) {
  const n = Number(value || 0);
  return n <= 0 ? 'FREE' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
}

function pathFromPublicUrl(bucket, url) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  if (index < 0) return null;
  try { return decodeURIComponent(url.slice(index + marker.length)); }
  catch (_) { return url.slice(index + marker.length); }
}

function buildGallery(row) {
  const urls = [];
  if (Array.isArray(row.gallery_urls)) row.gallery_urls.forEach(url => { if (url && !urls.includes(url)) urls.push(url); });
  if (row.preview_url && !urls.includes(row.preview_url)) urls.unshift(row.preview_url);
  return urls;
}

function showImage(index) {
  if (!gallery.length) return;
  activeImage = Math.max(0, Math.min(index, gallery.length - 1));
  const main = byId('mainPreview');
  main.src = gallery[activeImage];
  main.classList.remove('hidden');
  byId('detailFallback').classList.add('hidden');
  byId('detailThumbs').querySelectorAll('.detail-thumb').forEach((thumb, i) => thumb.classList.toggle('active', i === activeImage));
}

function renderGallery() {
  gallery = buildGallery(item);
  const thumbs = byId('detailThumbs');
  thumbs.innerHTML = '';

  if (!gallery.length) {
    byId('mainPreview').classList.add('hidden');
    byId('detailFallback').classList.remove('hidden');
    thumbs.classList.add('hidden');
    return;
  }

  showImage(0);
  if (gallery.length > 1) {
    thumbs.classList.remove('hidden');
    gallery.forEach((url, index) => {
      const button = document.createElement('button');
      button.className = `detail-thumb${index === 0 ? ' active' : ''}`;
      button.type = 'button';
      button.innerHTML = `<img src="${url}" alt="Vorschau ${index + 1}" />`;
      button.addEventListener('click', () => showImage(index));
      thumbs.appendChild(button);
    });
  } else {
    thumbs.classList.add('hidden');
  }
}

function renderItem() {
  document.title = `${item.title || 'Schematic'} · Schematic Hub`;
  byId('detailCategory').textContent = item.category || 'Other';
  byId('detailPrice').textContent = money(item.price);
  byId('detailTitle').textContent = item.title || 'Unnamed Schematic';
  byId('detailAuthor').textContent = `von ${item.author_username || 'User'}`;
  byId('detailDate').textContent = formatDate(item.created_at);
  byId('detailDescription').textContent = item.description || 'Für diese Schematic wurde noch keine Beschreibung eingetragen.';
  byId('factVersion').textContent = item.minecraft_version || '–';
  byId('factType').textContent = (item.file_type || 'LITEMATIC').toUpperCase();
  byId('factCategory').textContent = item.category || 'Other';
  byId('factAuthor').textContent = item.author_username || 'User';

  const action = byId('detailAction');
  if (Number(item.price || 0) <= 0 && item.download_url) {
    action.textContent = 'Schematic downloaden';
    action.href = item.download_url;
    action.setAttribute('download', '');
  } else if (Number(item.price || 0) > 0 && item.purchase_url) {
    action.textContent = `Kaufen · ${money(item.price)}`;
    action.href = item.purchase_url;
  } else {
    action.textContent = 'Noch nicht verfügbar';
    action.removeAttribute('href');
    action.style.opacity = '.55';
    action.style.pointerEvents = 'none';
  }

  renderGallery();
  byId('detailLoading').classList.add('hidden');
  byId('detailContent').classList.remove('hidden');
}

async function loadAuth() {
  const { data: { session } } = await client.auth.getSession();
  currentUser = session?.user || null;
  if (!currentUser) return;

  byId('detailUploadLink').classList.remove('hidden');
  const { data } = await client.from('profiles').select('username, role').eq('id', currentUser.id).maybeSingle();
  currentProfile = data || null;

  const canEdit = item && (item.created_by === currentUser.id || currentProfile?.role === 'admin');
  if (canEdit) {
    byId('detailOwnerActions').classList.remove('hidden');
    byId('detailEditBtn').href = `admin.html?edit=${encodeURIComponent(item.id)}`;
  }
  if (currentProfile?.role === 'admin') byId('detailDeleteBtn').classList.remove('hidden');
}

async function deleteAsAdmin() {
  if (!item || currentProfile?.role !== 'admin') return;
  if (!confirm(`„${item.title}“ wirklich löschen?`)) return;

  const { error } = await client.from('schematics').delete().eq('id', item.id);
  if (error) {
    alert(error.message || 'Löschen fehlgeschlagen.');
    return;
  }

  const schematicPath = item.schematic_path || pathFromPublicUrl('schematics', item.download_url);
  const galleryPaths = Array.isArray(item.gallery_paths) && item.gallery_paths.length
    ? item.gallery_paths
    : [pathFromPublicUrl('previews', item.preview_url)].filter(Boolean);

  if (schematicPath) await client.storage.from('schematics').remove([schematicPath]);
  if (galleryPaths.length) await client.storage.from('previews').remove(galleryPaths);
  location.href = './#schematics';
}

async function init() {
  if (!schematicId) {
    byId('detailLoading').classList.add('hidden');
    byId('detailError').classList.remove('hidden');
    return;
  }

  const { data, error } = await client.from('schematics').select('*').eq('id', schematicId).eq('published', true).maybeSingle();
  if (error || !data) {
    byId('detailLoading').classList.add('hidden');
    byId('detailError').classList.remove('hidden');
    return;
  }

  item = data;
  renderItem();
  await loadAuth();
}

byId('mainPreview').addEventListener('click', () => {
  if (!gallery.length) return;
  byId('lightboxImage').src = gallery[activeImage];
  byId('lightbox').classList.remove('hidden');
  byId('lightbox').setAttribute('aria-hidden', 'false');
});

function closeLightbox() {
  byId('lightbox').classList.add('hidden');
  byId('lightbox').setAttribute('aria-hidden', 'true');
}
byId('lightboxClose').addEventListener('click', closeLightbox);
byId('lightbox').addEventListener('click', event => { if (event.target === byId('lightbox')) closeLightbox(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeLightbox(); });
byId('detailDeleteBtn').addEventListener('click', deleteAsAdmin);

init();
