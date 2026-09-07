const client = window.supaClient;

const loading = document.getElementById('adminLoading');
const denied = document.getElementById('adminDenied');
const deniedText = document.getElementById('adminDeniedText');
const content = document.getElementById('adminContent');
const uploadForm = document.getElementById('uploadForm');
const uploadBtn = document.getElementById('uploadBtn');
const priceInput = document.getElementById('price');
const freeFields = document.getElementById('freeFields');
const paidFields = document.getElementById('paidFields');
const schematicFileInput = document.getElementById('schematicFile');
const purchaseUrlInput = document.getElementById('purchaseUrl');
const previewFileInput = document.getElementById('previewFile');
const formNotice = document.getElementById('formNotice');

let currentUser = null;
let currentProfile = null;

function showNotice(message, type = '') {
  formNotice.textContent = message;
  formNotice.className = `notice ${type}`.trim();
}

function hideNotice() {
  formNotice.className = 'notice hidden';
  formNotice.textContent = '';
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

function syncPriceFields() {
  const paid = Number(priceInput.value || 0) > 0;
  freeFields.classList.toggle('hidden', paid);
  paidFields.classList.toggle('hidden', !paid);
  schematicFileInput.required = !paid;
  purchaseUrlInput.required = paid;
}

priceInput.addEventListener('input', () => {
  let value = Number(priceInput.value || 0);
  if (value < 0) value = 0;
  if (value > 5) value = 5;
  priceInput.value = value;
  syncPriceFields();
});

async function checkAdmin() {
  if (!client) {
    loading.classList.add('hidden');
    denied.classList.remove('hidden');
    deniedText.textContent = 'Die Verbindung zum Account-System konnte nicht geladen werden.';
    return;
  }

  const { data: { session } } = await client.auth.getSession();
  currentUser = session?.user || null;

  if (!currentUser) {
    loading.classList.add('hidden');
    denied.classList.remove('hidden');
    deniedText.textContent = 'Du bist nicht angemeldet. Melde dich zuerst auf der Website an.';
    return;
  }

  const { data: profile, error } = await client
    .from('profiles')
    .select('username, role')
    .eq('id', currentUser.id)
    .maybeSingle();

  currentProfile = profile || null;
  loading.classList.add('hidden');

  if (error || currentProfile?.role !== 'admin') {
    denied.classList.remove('hidden');
    deniedText.textContent = 'Dein Account ist angemeldet, hat aber noch keine Admin-Rechte.';
    return;
  }

  content.classList.remove('hidden');
  document.getElementById('adminUsername').textContent = currentProfile.username || 'Owner';
  document.getElementById('adminEmail').textContent = currentUser.email || '';
}

function validateFiles(price) {
  const schematic = schematicFileInput.files[0];
  const preview = previewFileInput.files[0];

  if (price <= 0) {
    if (!schematic) throw new Error('Wähle eine Schematic-Datei aus.');
    const ext = schematic.name.split('.').pop().toLowerCase();
    if (!['litematic', 'schem', 'schematic'].includes(ext)) {
      throw new Error('Erlaubt sind nur .litematic, .schem oder .schematic Dateien.');
    }
    if (schematic.size > 25 * 1024 * 1024) {
      throw new Error('Die Schematic darf maximal 25 MB groß sein.');
    }
  }

  if (preview && !['image/png', 'image/jpeg', 'image/webp'].includes(preview.type)) {
    throw new Error('Das Preview muss PNG, JPG oder WEBP sein.');
  }
  if (preview && preview.size > 5 * 1024 * 1024) {
    throw new Error('Das Preview darf maximal 5 MB groß sein.');
  }

  return { schematic, preview };
}

async function uploadPublicFile(bucket, path, file) {
  const { error } = await client.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false
  });
  if (error) throw error;
  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

uploadForm.addEventListener('submit', async event => {
  event.preventDefault();
  hideNotice();

  const price = Number(priceInput.value || 0);
  const title = document.getElementById('title').value.trim();
  const category = document.getElementById('category').value;
  const description = document.getElementById('description').value.trim();
  const minecraftVersion = document.getElementById('version').value.trim() || '1.21.11';
  const purchaseUrl = purchaseUrlInput.value.trim();

  if (!title) return showNotice('Gib einen Namen ein.', 'error');
  if (price < 0 || price > 5) return showNotice('Der Preis muss zwischen 0 € und 5 € liegen.', 'error');
  if (price > 0 && !purchaseUrl) return showNotice('Bei Paid brauchst du einen Kauf-Link.', 'error');

  let files;
  try {
    files = validateFiles(price);
  } catch (error) {
    showNotice(error.message, 'error');
    return;
  }

  uploadBtn.disabled = true;
  uploadBtn.textContent = 'Wird veröffentlicht...';

  try {
    const baseSlug = slugify(title);
    const unique = Date.now().toString(36);
    const slug = `${baseSlug}-${unique}`;

    let previewUrl = null;
    let downloadUrl = null;
    let fileType = 'LITEMATIC';

    if (files.preview) {
      const ext = files.preview.name.split('.').pop().toLowerCase();
      previewUrl = await uploadPublicFile('previews', `${slug}.${ext}`, files.preview);
    }

    if (price <= 0 && files.schematic) {
      const ext = files.schematic.name.split('.').pop().toLowerCase();
      fileType = ext.toUpperCase();
      downloadUrl = await uploadPublicFile('schematics', `${slug}.${ext}`, files.schematic);
    }

    const { error } = await client.from('schematics').insert({
      title,
      slug,
      category,
      description,
      minecraft_version: minecraftVersion,
      price,
      file_type: fileType,
      download_url: downloadUrl,
      preview_url: previewUrl,
      purchase_url: price > 0 ? purchaseUrl : null,
      created_by: currentUser.id,
      published: true
    });

    if (error) throw error;

    showNotice('Schematic wurde veröffentlicht und ist jetzt auf der Website sichtbar.', 'ok');
    uploadForm.reset();
    priceInput.value = 0;
    document.getElementById('version').value = '1.21.11';
    syncPriceFields();
  } catch (error) {
    console.error(error);
    showNotice(error.message || 'Upload fehlgeschlagen.', 'error');
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Schematic veröffentlichen';
  }
});

syncPriceFields();
checkAdmin();
