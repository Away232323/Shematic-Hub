(() => {
  const client = window.supaClient;
  if (!client) return;

  const byId = id => document.getElementById(id);
  const authButton = byId('authButton');
  const authModal = byId('authModal');
  const loginForm = byId('loginForm');
  const registerForm = byId('registerForm');
  const authMessage = byId('authMessage');
  const accountWrap = byId('accountWrap');
  const accountButton = byId('accountButton');
  const accountPopover = byId('accountPopover');
  const logoutButton = byId('logoutButton');
  const adminNav = byId('adminNav');
  const popoverAdmin = byId('popoverAdmin');

  window.schematicHubAuth = {
    session: null,
    user: null,
    profile: null,
    ready: false
  };

  function showMessage(message, error = false) {
    if (!authMessage) return;
    authMessage.textContent = message;
    authMessage.className = `auth-message${error ? ' error' : ''}`;
  }

  function clearMessage() {
    if (!authMessage) return;
    authMessage.textContent = '';
    authMessage.className = 'auth-message hidden';
  }

  function openModal(tab = 'login') {
    if (!authModal) return;
    authModal.classList.remove('hidden');
    authModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTab(tab);
    clearMessage();
  }

  function closeModal() {
    if (!authModal) return;
    authModal.classList.add('hidden');
    authModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function setTab(tab) {
    document.querySelectorAll('[data-auth-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.authTab === tab);
    });
    if (loginForm) loginForm.classList.toggle('hidden', tab !== 'login');
    if (registerForm) registerForm.classList.toggle('hidden', tab !== 'register');
  }

  async function getProfile(userId) {
    if (!userId) return null;
    const { data, error } = await client
      .from('profiles')
      .select('username, role')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.error('Profile load failed', error);
      return null;
    }
    return data;
  }

  function renderAccount() {
    const state = window.schematicHubAuth;
    const loggedIn = Boolean(state.user);
    const isAdmin = state.profile?.role === 'admin';

    if (authButton) authButton.classList.toggle('hidden', loggedIn);
    if (accountWrap) accountWrap.classList.toggle('hidden', !loggedIn);
    if (adminNav) adminNav.classList.toggle('hidden', !isAdmin);
    if (popoverAdmin) popoverAdmin.classList.toggle('hidden', !isAdmin);

    if (!loggedIn) return;

    const username = state.profile?.username || state.user.email?.split('@')[0] || 'Account';
    const email = state.user.email || '';
    const initial = username.trim().charAt(0).toUpperCase() || 'A';

    const accountName = byId('accountName');
    const accountAvatar = byId('accountAvatar');
    const popoverName = byId('popoverName');
    const popoverEmail = byId('popoverEmail');
    if (accountName) accountName.textContent = username;
    if (accountAvatar) accountAvatar.textContent = initial;
    if (popoverName) popoverName.textContent = username;
    if (popoverEmail) popoverEmail.textContent = email;
  }

  async function refreshAuthState() {
    const { data: { session } } = await client.auth.getSession();
    window.schematicHubAuth.session = session || null;
    window.schematicHubAuth.user = session?.user || null;
    window.schematicHubAuth.profile = session?.user ? await getProfile(session.user.id) : null;
    window.schematicHubAuth.ready = true;
    renderAccount();
    window.dispatchEvent(new CustomEvent('schematic-auth-ready', { detail: window.schematicHubAuth }));
  }

  if (authButton) authButton.addEventListener('click', () => openModal('login'));
  document.querySelectorAll('[data-auth-close]').forEach(el => el.addEventListener('click', closeModal));
  document.querySelectorAll('[data-auth-tab]').forEach(el => el.addEventListener('click', () => setTab(el.dataset.authTab)));

  if (accountButton && accountPopover) {
    accountButton.addEventListener('click', event => {
      event.stopPropagation();
      accountPopover.classList.toggle('hidden');
    });
    document.addEventListener('click', event => {
      if (!accountWrap?.contains(event.target)) accountPopover.classList.add('hidden');
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      await client.auth.signOut();
      accountPopover?.classList.add('hidden');
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async event => {
      event.preventDefault();
      clearMessage();
      const email = byId('loginEmail').value.trim();
      const password = byId('loginPassword').value;
      const button = loginForm.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = 'Anmelden...';

      const { error } = await client.auth.signInWithPassword({ email, password });
      button.disabled = false;
      button.textContent = 'Anmelden';

      if (error) {
        showMessage('E-Mail oder Passwort ist falsch.', true);
        return;
      }

      closeModal();
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async event => {
      event.preventDefault();
      clearMessage();
      const username = byId('registerUsername').value.trim();
      const email = byId('registerEmail').value.trim();
      const password = byId('registerPassword').value;
      const button = registerForm.querySelector('button[type="submit"]');

      if (username.length < 3) {
        showMessage('Der Benutzername muss mindestens 3 Zeichen haben.', true);
        return;
      }

      button.disabled = true;
      button.textContent = 'Account wird erstellt...';

      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { data: { username } }
      });

      button.disabled = false;
      button.textContent = 'Account erstellen';

      if (error) {
        showMessage(error.message || 'Account konnte nicht erstellt werden.', true);
        return;
      }

      if (data.session) {
        showMessage('Account erstellt. Du bist jetzt angemeldet.');
        setTimeout(closeModal, 700);
      } else {
        showMessage('Account erstellt. Schau in deine E-Mails und bestätige deine Adresse.');
      }
    });
  }

  client.auth.onAuthStateChange(() => {
    setTimeout(refreshAuthState, 0);
  });

  refreshAuthState();

  const params = new URLSearchParams(location.search);
  if (params.get('login') === '1') {
    window.addEventListener('DOMContentLoaded', () => openModal('login'), { once: true });
  }

  window.openSchematicAuth = openModal;
  window.refreshSchematicAuth = refreshAuthState;
})();
