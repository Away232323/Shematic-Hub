const client = window.supaClient;

const byId = id => document.getElementById(id);
const loading = byId('accountLoading');
const denied = byId('accountDenied');
const content = byId('dashboardContent');
const uploadForm = byId('uploadForm');
const uploadBtn = byId('uploadBtn');
const priceInput = byId('price');
const freeFields = byId('freeFields');
const paidFields = byId('paidFields');
const schematicFileInput = byId('schematicFile');
const purchaseUrlInput = byId('purchaseUrl');
const previewFilesInput = byId('previewFiles');
const formNotice = byId('formNotice');
const existingGalleryWrap = byId('existingGalleryWrap');
const existingGallery = byId('existingGallery');

let currentUser = null;
let currentProfile = null;
let editingItem = null;
let existingImages = [];

function showNotice(message, type = '', target = formNotice) {
  if (!target) return;
  target.textContent = message;
  target.className = `notice ${type}`.trim();
}

function hideNotice(target = formNotice) {
  if (!target) return;
  target.className = 'notice hidden';
  target.textContent = '';
}

function slugify(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 55) || 'schematic';
}

function money(value) {
  const n = Number(value || 0);
  return n <= 0 ? 'FREE' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function pathFromPublicUrl(bucket, url) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  if (index < 0) return null;
  try { return decodeURIComponent(url.slice(index + marker.length)); }
  catch (_) { return url.slice(index + marker.length); }
}

async function uploadPublicFile(bucket, path, file) {
  const { error } = await client.storage.from(bucket).upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

async function removeStorageFiles(bucket, paths) {
  const clean = [...new Set((paths || []).filter(Boolean))];
  if (!clean.length) return;
  const { error } = await client.storage.from(bucket).remove(clean);
  if (error) console.warn(`Could not remove ${bucket} files`, error);
}

function isAdmin() {
  return currentProfile?.role === 'admin';
}

function syncPriceFields() {
  const paid = Number(priceInput.value || 0) > 0;
  freeFields.classList.toggle('hidden', paid);
  paidFields.classList.toggle('hidden', !paid);
  purchaseUrlInput.required = paid;

  const hasExistingFreeFile = Boolean(editingItem?.download_url);
  schematicFileInput.required = !paid && !hasExistingFreeFile;
  byId('schematicRequiredMark').textContent = schematicFileInput.required ? '*' : '';
  byId('schematicHelp').textContent = hasExistingFreeFile && !paid
    ? 'Optional: leer lassen, um die bisherige Datei zu behalten.'
    : '.litematic, .schem oder .schematic · maximal 25 MB';
}

priceInput.addEventListener('input', () => {
  let value = Number(priceInput.value || 0);
  if (value < 0) value = 0;
  if (value > 5) value = 5;
  priceInput.value = value;
  syncPriceFields();
});

function buildExistingImages(item) {
  const urls = [];
  const paths = [];
  if (Array.isArray(item.gallery_urls) && item.gallery_urls.length) {
    item.gallery_urls.forEach((url, index) => {
      if (!url || urls.includes(url)) return;
      urls.push(url);
      paths.push(Array.isArray(item.gallery_paths) ? item.gallery_paths[index] || null : null);
    });
  }
  if (item.preview_url && !urls.includes(item.preview_url)) {
    urls.unshift(item.preview_url);
    paths.unshift(pathFromPublicUrl('previews', item.preview_url));
  }
  return urls.map((url, index) => ({ url, path: paths[index] || pathFromPublicUrl('previews', url), removed: false }));
}

function renderExistingGallery() {
  existingGallery.innerHTML = '';
  const visible = existingImages.filter(img => !img.removed);
  existingGalleryWrap.classList.toggle('hidden', existingImages.length === 0);

  existingImages.forEach((image, index) => {
    const card = document.createElement('div');
    card.className = `edit-gallery-item${image.removed ? ' removed' : ''}`;
    card.innerHTML = `
      <img src="${image.url}" alt="Vorschau" />
      <button type="button" data-remove-image="${index}">${image.removed ? 'Behalten' : 'Entfernen'}</button>
    `;
    existingGallery.appendChild(card);
  });

  existingGallery.querySelectorAll('[data-remove-image]').forEach(button => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.removeImage);
      existingImages[index].removed = !existingImages[index].removed;
      renderExistingGallery();
    });
  });

  if (!visible.length && existingImages.length) existingGalleryWrap.classList.remove('hidden');
}

function resetFormState(clearQuery = true) {
  editingItem = null;
  existingImages = [];
  uploadForm.reset();
  priceInput.value = 0;
  byId('version').value = '1.21.11';
  byId('formEyebrow').textContent = 'NEUER UPLOAD';
  byId('formTitle').textContent = 'Schematic veröffentlichen';
  byId('uploadBtn').textContent = 'Schematic veröffentlichen';
  byId('cancelEditBtn').classList.add('hidden');
  existingGalleryWrap.classList.add('hidden');
  existingGallery.innerHTML = '';
  hideNotice();
  syncPriceFields();
  if (clearQuery && location.search) history.replaceState({}, '', 'admin.html');
}

byId('resetBtn').addEventListener('click', () => resetFormState());
byId('cancelEditBtn').addEventListener('click', () => resetFormState());

function validateSelectedFiles(price) {
  const schematic = schematicFileInput.files[0] || null;
  const previews = Array.from(previewFilesInput.files || []);

  if (price <= 0 && !schematic && !editingItem?.download_url) {
    throw new Error('Wähle eine Schematic-Datei aus.');
  }

  if (schematic) {
    const ext = schematic.name.split('.').pop().toLowerCase();
    if (!['litematic', 'schem', 'schematic'].includes(ext)) throw new Error('Erlaubt sind nur .litematic, .schem oder .schematic Dateien.');
    if (schematic.size > 25 * 1024 * 1024) throw new Error('Die Schematic darf maximal 25 MB groß sein.');
  }

  const keptExisting = existingImages.filter(img => !img.removed).length;
  if (keptExisting + previews.length > 8) throw new Error('Maximal 8 Bilder pro Schematic.');

  for (const preview of previews) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(preview.type)) throw new Error('Bilder müssen PNG, JPG oder WEBP sein.');
    if (preview.size > 5 * 1024 * 1024) throw new Error('Jedes Bild darf maximal 5 MB groß sein.');
  }

  return { schematic, previews };
}

async function loadAccount() {
  if (!client) {
    loading.classList.add('hidden');
    denied.classList.remove('hidden');
    return;
  }

  const { data: { session } } = await client.auth.getSession();
  currentUser = session?.user || null;

  if (!currentUser) {
    loading.classList.add('hidden');
    denied.classList.remove('hidden');
    return;
  }

  const { data: profile, error } = await client.from('profiles').select('username, role').eq('id', currentUser.id).maybeSingle();
  if (error || !profile) {
    loading.classList.add('hidden');
    denied.classList.remove('hidden');
    denied.querySelector('p').textContent = 'Dein Profil konnte nicht geladen werden.';
    return;
  }

  currentProfile = profile;
  loading.classList.add('hidden');
  content.classList.remove('hidden');

  const username = currentProfile.username || currentUser.email?.split('@')[0] || 'Account';
  byId('dashboardUsername').textContent = username;
  byId('dashboardEmail').textContent = currentUser.email || '';
  byId('accountBigAvatar').textContent = username.charAt(0).toUpperCase();
  byId('dashboardRole').textContent = isAdmin() ? 'ADMIN' : 'USER';
  byId('dashboardRole').classList.toggle('admin', isAdmin());

  document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !isAdmin()));
  byId('rightsNav').classList.toggle('hidden', !isAdmin());

  await loadMyUploads();
  if (isAdmin()) await loadAllUploads();

  const editId = new URLSearchParams(location.search).get('edit');
  if (editId) await startEditing(editId);
}

async function startEditing(id) {
  hideNotice();
  const { data, error } = await client.from('schematics').select('*').eq('id', id).maybeSingle();
  if (error || !data) {
    showNotice('Diese Schematic konnte nicht geladen werden oder du hast keine Rechte dafür.', 'error');
    return;
  }

  const allowed = data.created_by === currentUser.id || isAdmin();
  if (!allowed) {
    showNotice('Du darfst nur deine eigenen Schematics bearbeiten.', 'error');
    return;
  }

  editingItem = data;
  existingImages = buildExistingImages(data);
  byId('title').value = data.title || '';
  byId('category').value = data.category || 'Other';
  byId('description').value = data.description || '';
  byId('version').value = data.minecraft_version || '1.21.11';
  byId('price').value = Number(data.price || 0);
  byId('purchaseUrl').value = data.purchase_url || '';
  schematicFileInput.value = '';
  previewFilesInput.value = '';

  byId('formEyebrow').textContent = 'BEARBEITEN';
  byId('formTitle').textContent = data.title || 'Schematic bearbeiten';
  byId('uploadBtn').textContent = 'Änderungen speichern';
  byId('cancelEditBtn').classList.remove('hidden');
  renderExistingGallery();
  syncPriceFields();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

uploadForm.addEventListener('submit', async event => {
  event.preventDefault();
  hideNotice();

  const price = Number(priceInput.value || 0);
  const title = byId('title').value.trim();
  const category = byId('category').value;
  const description = byId('description').value.trim();
  const minecraftVersion = byId('version').value.trim() || '1.21.11';
  const purchaseUrl = purchaseUrlInput.value.trim();

  if (!title) return showNotice('Gib einen Namen ein.', 'error');
  if (price < 0 || price > 5) return showNotice('Der Preis muss zwischen 0 € und 5 € liegen.', 'error');
  if (price > 0 && !purchaseUrl) return showNotice('Bei Paid brauchst du einen Kauf-Link.', 'error');

  let files;
  try { files = validateSelectedFiles(price); }
  catch (error) { return showNotice(error.message, 'error'); }

  uploadBtn.disabled = true;
  uploadBtn.textContent = editingItem ? 'Wird gespeichert…' : 'Wird veröffentlicht…';

  const pathsToDeleteAfterSave = { previews: [], schematics: [] };

  try {
    const slug = editingItem?.slug || `${slugify(title)}-${Date.now().toString(36)}`;
    const ownerFolder = editingItem?.created_by || currentUser.id;

    const keptImages = existingImages.filter(img => !img.removed);
    existingImages.filter(img => img.removed).forEach(img => {
      if (img.path) pathsToDeleteAfterSave.previews.push(img.path);
    });

    const uploadedImages = [];
    for (let i = 0; i < files.previews.length; i++) {
      const file = files.previews[i];
      const ext = file.name.split('.').pop().toLowerCase();
      const path = `${ownerFolder}/${slug}/gallery/${Date.now()}-${i}.${ext}`;
      uploadedImages.push(await uploadPublicFile('previews', path, file));
    }

    const finalImages = [
      ...keptImages.map(img => ({ url: img.url, path: img.path })),
      ...uploadedImages
    ];

    let downloadUrl = editingItem?.download_url || null;
    let schematicPath = editingItem?.schematic_path || pathFromPublicUrl('schematics', editingItem?.download_url);
    let fileType = editingItem?.file_type || 'LITEMATIC';

    if (price > 0) {
      if (schematicPath) pathsToDeleteAfterSave.schematics.push(schematicPath);
      downloadUrl = null;
      schematicPath = null;
    } else if (files.schematic) {
      const ext = files.schematic.name.split('.').pop().toLowerCase();
      const path = `${ownerFolder}/${slug}/file/${Date.now()}.${ext}`;
      const uploaded = await uploadPublicFile('schematics', path, files.schematic);
      if (schematicPath) pathsToDeleteAfterSave.schematics.push(schematicPath);
      downloadUrl = uploaded.url;
      schematicPath = uploaded.path;
      fileType = ext.toUpperCase();
    }

    const payload = {
      title,
      slug,
      category,
      description,
      minecraft_version: minecraftVersion,
      price,
      file_type: fileType,
      download_url: downloadUrl,
      schematic_path: schematicPath,
      preview_url: finalImages[0]?.url || null,
      gallery_urls: finalImages.map(img => img.url),
      gallery_paths: finalImages.map(img => img.path || pathFromPublicUrl('previews', img.url)).filter(Boolean),
      purchase_url: price > 0 ? purchaseUrl : null,
      published: true
    };

    let saved;
    if (editingItem) {
      const { data, error } = await client.from('schematics').update(payload).eq('id', editingItem.id).select('*').single();
      if (error) throw error;
      saved = data;
    } else {
      const { data, error } = await client.from('schematics').insert({ ...payload, created_by: currentUser.id }).select('*').single();
      if (error) throw error;
      saved = data;
    }

    await Promise.all([
      removeStorageFiles('previews', pathsToDeleteAfterSave.previews),
      removeStorageFiles('schematics', pathsToDeleteAfterSave.schematics)
    ]);

    showNotice(editingItem ? 'Änderungen gespeichert.' : 'Schematic wurde veröffentlicht.', 'ok');
    const wasEditing = Boolean(editingItem);
    editingItem = saved;
    existingImages = buildExistingImages(saved);
    renderExistingGallery();
    syncPriceFields();
    await loadMyUploads();
    if (isAdmin()) await loadAllUploads();

    if (!wasEditing) {
      setTimeout(() => resetFormState(), 900);
    }
  } catch (error) {
    console.error(error);
    showNotice(error.message || 'Speichern fehlgeschlagen.', 'error');
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = editingItem ? 'Änderungen speichern' : 'Schematic veröffentlichen';
  }
});

function manageItemMarkup(item, global = false) {
  const preview = item.preview_url || (Array.isArray(item.gallery_urls) ? item.gallery_urls[0] : '') || '';
  const canDelete = global ? isAdmin() : true;
  return `
    <div class="manage-item" data-id="${item.id}">
      <div class="manage-thumb">${preview ? `<img src="${preview}" alt="" />` : '<span>S</span>'}</div>
      <div class="manage-info">
        <div class="manage-title-line"><strong>${escapeHtml(item.title || 'Unnamed')}</strong><span>${money(item.price)}</span></div>
        <small>${escapeHtml(item.category || 'Other')} · MC ${escapeHtml(item.minecraft_version || '?')} · ${formatDate(item.created_at)}${global && item.author_username ? ` · von ${escapeHtml(item.author_username)}` : ''}</small>
      </div>
      <div class="manage-actions">
        <a class="mini-btn" href="schematic.html?id=${encodeURIComponent(item.id)}">Ansehen</a>
        <button class="mini-btn" type="button" data-edit="${item.id}">Bearbeiten</button>
        ${canDelete ? `<button class="mini-btn danger" type="button" data-delete="${item.id}">Löschen</button>` : ''}
      </div>
    </div>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function bindManageActions(container, items) {
  container.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.edit;
    history.replaceState({}, '', `admin.html?edit=${encodeURIComponent(id)}`);
    startEditing(id);
  }));

  container.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', async () => {
    const item = items.find(row => row.id === button.dataset.delete);
    if (item) await deleteSchematic(item);
  }));
}

async function loadMyUploads() {
  const { data, error } = await client.from('schematics').select('*').eq('created_by', currentUser.id).order('created_at', { ascending: false });
  const items = error ? [] : (data || []);
  byId('myUploadCount').textContent = items.length;
  byId('myUploadsEmpty').classList.toggle('hidden', items.length > 0);
  byId('myUploadsList').innerHTML = items.map(item => manageItemMarkup(item, false)).join('');
  bindManageActions(byId('myUploadsList'), items);
}

async function loadAllUploads() {
  const { data, error } = await client.from('schematics').select('*').order('created_at', { ascending: false });
  const items = error ? [] : (data || []);
  byId('allUploadCount').textContent = items.length;
  byId('allUploadsList').innerHTML = items.map(item => manageItemMarkup(item, true)).join('');
  bindManageActions(byId('allUploadsList'), items);
}

async function deleteSchematic(item) {
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
  await Promise.all([
    removeStorageFiles('schematics', [schematicPath]),
    removeStorageFiles('previews', galleryPaths)
  ]);

  if (editingItem?.id === item.id) resetFormState();
  await loadMyUploads();
  if (isAdmin()) await loadAllUploads();
}

async function searchUsers() {
  const input = byId('userSearchInput').value.trim();
  const notice = byId('userSearchNotice');
  hideNotice(notice);
  byId('userResults').innerHTML = '<div class="manage-empty">Suche…</div>';

  const { data, error } = await client.rpc('admin_search_users', { search_text: input });
  if (error) {
    byId('userResults').innerHTML = '';
    showNotice('Benutzer konnten nicht geladen werden.', 'error', notice);
    return;
  }

  const users = data || [];
  byId('userResults').innerHTML = users.length ? users.map(user => `
    <div class="user-row">
      <div><strong>${escapeHtml(user.username || 'User')}</strong><small>${user.role === 'admin' ? 'Admin' : 'User'}</small></div>
      <button class="mini-btn ${user.role === 'admin' ? 'danger' : ''}" type="button" data-role-user="${escapeHtml(user.username)}" data-new-role="${user.role === 'admin' ? 'user' : 'admin'}">
        ${user.role === 'admin' ? 'Admin entfernen' : 'Admin geben'}
      </button>
    </div>`).join('') : '<div class="manage-empty">Kein Benutzer gefunden.</div>';

  byId('userResults').querySelectorAll('[data-role-user]').forEach(button => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      const { error: roleError } = await client.rpc('admin_set_role', {
        target_username: button.dataset.roleUser,
        new_role: button.dataset.newRole
      });
      button.disabled = false;
      if (roleError) {
        const message = roleError.message?.includes('cannot_remove_own_admin') ? 'Deine eigenen Admin-Rechte kannst du hier nicht entfernen.' : 'Rechte konnten nicht geändert werden.';
        showNotice(message, 'error', notice);
        return;
      }
      showNotice('Rechte aktualisiert.', 'ok', notice);
      await searchUsers();
    });
  });
}

byId('userSearchBtn').addEventListener('click', searchUsers);
byId('userSearchInput').addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    searchUsers();
  }
});

syncPriceFields();
loadAccount();
