const OWNER = 'Away232323';
const REPO = 'Shematic-Hub';
const BRANCH = 'main';
const API = 'https://api.github.com';

const tokenInput = document.getElementById('githubToken');
const connectBtn = document.getElementById('connectBtn');
const logoutBtn = document.getElementById('logoutBtn');
const connectionStatus = document.getElementById('connectionStatus');
const connectionText = document.getElementById('connectionText');
const uploadForm = document.getElementById('uploadForm');
const uploadBtn = document.getElementById('uploadBtn');
const priceInput = document.getElementById('price');
const freeFields = document.getElementById('freeFields');
const paidFields = document.getElementById('paidFields');
const schematicFileInput = document.getElementById('schematicFile');
const purchaseUrlInput = document.getElementById('purchaseUrl');
const previewFileInput = document.getElementById('previewFile');
const formNotice = document.getElementById('formNotice');
const progress = document.getElementById('progress');
const progressBar = document.getElementById('progressBar');

let token = sessionStorage.getItem('schematicHubToken') || '';

function apiHeaders(json = false) {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

function setConnection(connected, text) {
  connectionStatus.classList.toggle('connected', connected);
  connectionText.textContent = text;
  connectBtn.classList.toggle('hidden', connected);
  logoutBtn.classList.toggle('hidden', !connected);
  tokenInput.disabled = connected;
}

function showNotice(message, type = '') {
  formNotice.className = `notice ${type}`.trim();
  formNotice.textContent = message;
  formNotice.classList.remove('hidden');
}

function hideNotice() {
  formNotice.classList.add('hidden');
}

function setProgress(percent) {
  progress.classList.remove('hidden');
  progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function resetProgress() {
  progress.classList.add('hidden');
  progressBar.style.width = '0%';
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let message = `GitHub Fehler ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.message) message += `: ${payload.message}`;
    } catch (_) {}
    throw new Error(message);
  }
  return response;
}

async function verifyToken() {
  if (!token) throw new Error('Bitte zuerst einen GitHub Token eingeben.');

  const userRes = await apiFetch(`${API}/user`, { headers: apiHeaders() });
  const user = await userRes.json();
  if (String(user.login).toLowerCase() !== OWNER.toLowerCase()) {
    throw new Error(`Dieser Admin-Bereich ist aktuell nur für @${OWNER} freigeschaltet.`);
  }

  const repoRes = await apiFetch(`${API}/repos/${OWNER}/${REPO}`, { headers: apiHeaders() });
  const repo = await repoRes.json();
  if (!repo.permissions?.push) {
    throw new Error('Der Token hat keine Schreibrechte auf das Repository.');
  }

  return user;
}

connectBtn.addEventListener('click', async () => {
  hideNotice();
  token = tokenInput.value.trim();
  if (!token) {
    showNotice('Füge zuerst deinen Fine-grained GitHub Token ein.', 'error');
    return;
  }

  connectBtn.disabled = true;
  connectBtn.textContent = 'Prüfe...';
  try {
    const user = await verifyToken();
    sessionStorage.setItem('schematicHubToken', token);
    tokenInput.value = '';
    setConnection(true, `Verbunden als @${user.login}`);
    showNotice('GitHub verbunden. Du kannst jetzt Schematics veröffentlichen.', 'ok');
  } catch (error) {
    token = '';
    sessionStorage.removeItem('schematicHubToken');
    setConnection(false, 'Nicht verbunden');
    showNotice(error.message, 'error');
  } finally {
    connectBtn.disabled = false;
    connectBtn.textContent = 'Verbinden';
  }
});

logoutBtn.addEventListener('click', () => {
  token = '';
  sessionStorage.removeItem('schematicHubToken');
  tokenInput.value = '';
  setConnection(false, 'Nicht verbunden');
  showNotice('GitHub-Verbindung für diese Sitzung beendet.', 'ok');
});

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

function slugify(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 55) || 'schematic';
}

function toBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  return toBase64(bytes.buffer);
}

function base64ToUtf8(base64) {
  const clean = base64.replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function putRepoFile(path, base64Content, message, sha = null) {
  const body = {
    message,
    content: base64Content,
    branch: BRANCH
  };
  if (sha) body.sha = sha;

  const response = await apiFetch(`${API}/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}`, {
    method: 'PUT',
    headers: apiHeaders(true),
    body: JSON.stringify(body)
  });
  return response.json();
}

async function uploadBinary(path, file, message) {
  const buffer = await file.arrayBuffer();
  return putRepoFile(path, toBase64(buffer), message);
}

async function getCatalog() {
  const response = await apiFetch(`${API}/repos/${OWNER}/${REPO}/contents/data/schematics.json?ref=${BRANCH}`, {
    headers: apiHeaders()
  });
  const payload = await response.json();
  const items = JSON.parse(base64ToUtf8(payload.content || 'W10='));
  return { items: Array.isArray(items) ? items : [], sha: payload.sha };
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
    throw new Error('Das Vorschaubild muss PNG, JPG oder WEBP sein.');
  }
  if (preview && preview.size > 5 * 1024 * 1024) {
    throw new Error('Das Vorschaubild darf maximal 5 MB groß sein.');
  }

  return { schematic, preview };
}

uploadForm.addEventListener('submit', async event => {
  event.preventDefault();
  hideNotice();
  resetProgress();

  try {
    await verifyToken();
  } catch (error) {
    showNotice(`${error.message} Verbinde zuerst GitHub.`, 'error');
    return;
  }

  const title = document.getElementById('title').value.trim();
  const category = document.getElementById('category').value;
  const description = document.getElementById('description').value.trim();
  const minecraftVersion = document.getElementById('version').value.trim();
  const price = Number(priceInput.value || 0);
  const purchaseUrl = purchaseUrlInput.value.trim();

  if (!title) {
    showNotice('Gib einen Namen für die Schematic ein.', 'error');
    return;
  }
  if (price < 0 || price > 5) {
    showNotice('Der Preis muss zwischen 0 € und 5 € liegen.', 'error');
    return;
  }
  if (price > 0 && !purchaseUrl) {
    showNotice('Bei Paid brauchst du einen Kauf-Link.', 'error');
    return;
  }

  let files;
  try {
    files = validateFiles(price);
  } catch (error) {
    showNotice(error.message, 'error');
    return;
  }

  uploadBtn.disabled = true;
  uploadBtn.textContent = 'Veröffentliche...';

  try {
    const now = new Date();
    const id = `${slugify(title)}-${Date.now()}`;
    let downloadPath = '';
    let previewPath = '';
    let fileType = 'LITEMATIC';

    setProgress(8);

    if (price <= 0 && files.schematic) {
      const ext = files.schematic.name.split('.').pop().toLowerCase();
      fileType = ext.toUpperCase();
      downloadPath = `schematics/${id}.${ext}`;
      setProgress(18);
      await uploadBinary(downloadPath, files.schematic, `Upload schematic: ${title}`);
      setProgress(47);
    }

    if (files.preview) {
      const extMap = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
      const ext = extMap[files.preview.type] || 'png';
      previewPath = `previews/${id}.${ext}`;
      await uploadBinary(previewPath, files.preview, `Upload preview: ${title}`);
    }

    setProgress(67);
    const catalog = await getCatalog();

    const item = {
      id,
      title,
      description,
      category,
      price,
      minecraftVersion,
      fileType,
      downloadPath,
      purchaseUrl: price > 0 ? purchaseUrl : '',
      previewPath,
      createdAt: now.toISOString(),
      author: OWNER
    };

    const nextItems = [item, ...catalog.items];
    const json = `${JSON.stringify(nextItems, null, 2)}\n`;

    setProgress(82);
    await putRepoFile(
      'data/schematics.json',
      utf8ToBase64(json),
      `Publish schematic: ${title}`,
      catalog.sha
    );

    setProgress(100);
    showNotice(`„${title}“ wurde veröffentlicht. GitHub Pages kann kurz brauchen, bis die Änderung live ist.`, 'ok');
    uploadForm.reset();
    priceInput.value = '0';
    syncPriceFields();
  } catch (error) {
    console.error(error);
    showNotice(error.message || 'Upload fehlgeschlagen.', 'error');
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Schematic veröffentlichen';
    setTimeout(resetProgress, 1600);
  }
});

uploadForm.addEventListener('reset', () => {
  setTimeout(() => {
    priceInput.value = '0';
    document.getElementById('version').value = '1.21.11';
    syncPriceFields();
    hideNotice();
    resetProgress();
  }, 0);
});

(async function init() {
  syncPriceFields();
  if (!token) {
    setConnection(false, 'Nicht verbunden');
    return;
  }
  try {
    const user = await verifyToken();
    setConnection(true, `Verbunden als @${user.login}`);
  } catch (_) {
    token = '';
    sessionStorage.removeItem('schematicHubToken');
    setConnection(false, 'Nicht verbunden');
  }
})();
