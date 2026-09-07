(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.style.setProperty('--muted', '#9cafa4');
  document.body.classList.add('page-enter');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.body.classList.remove('page-enter');
    document.body.classList.add('page-ready');
  }));

  function getLogoDataUri() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--hub-logo').trim();
    const match = raw.match(/^url\(["']?(.*?)["']?\)$/);
    return match ? match[1] : '';
  }

  function installBranding() {
    const logo = getLogoDataUri();
    if (!logo) return;
    document.querySelectorAll('.brand-icon').forEach(el => {
      el.textContent = '';
      el.setAttribute('aria-hidden', 'true');
    });
    let favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      favicon.type = 'image/webp';
      document.head.appendChild(favicon);
    }
    favicon.href = logo;
  }

  let soundEnabled = localStorage.getItem('schematicHubSound') !== 'off';
  let audioCtx = null;
  let master = null;
  let lastHoverAt = 0;
  let lastHoverEl = null;

  function unlockAudio() {
    if (!soundEnabled) return;
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
      master = audioCtx.createGain();
      master.gain.value = 0.23;
      master.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  }

  function softTone({freq = 520, endFreq = 650, duration = .09, volume = .045, type = 'sine', delay = 0}) {
    if (!soundEnabled || !audioCtx || audioCtx.state !== 'running') return;
    const now = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 3200;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + .012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + duration + .02);
  }

  function playHover() {
    unlockAudio();
    if (!audioCtx || audioCtx.state !== 'running') return;
    softTone({freq:510,endFreq:690,duration:.085,volume:.035,type:'sine'});
    softTone({freq:760,endFreq:880,duration:.07,volume:.012,type:'triangle',delay:.018});
  }

  function playClick() {
    unlockAudio();
    if (!audioCtx || audioCtx.state !== 'running') return;
    softTone({freq:410,endFreq:590,duration:.10,volume:.055,type:'sine'});
    softTone({freq:820,endFreq:650,duration:.12,volume:.022,type:'triangle',delay:.025});
    softTone({freq:1180,endFreq:980,duration:.055,volume:.010,type:'sine',delay:.045});
  }

  function makeSoundToggle() {
    const nav = document.querySelector('.nav-account');
    if (!nav || nav.querySelector('.sound-toggle')) return;
    const button = document.createElement('button');
    button.className = 'sound-toggle';
    button.type = 'button';
    button.title = 'Interface-Sounds an/aus';
    button.setAttribute('aria-label', 'Interface-Sounds an oder aus');
    button.setAttribute('aria-pressed', soundEnabled ? 'true' : 'false');
    button.textContent = soundEnabled ? '♫' : '♩';
    nav.prepend(button);
    button.addEventListener('click', event => {
      event.stopPropagation();
      soundEnabled = !soundEnabled;
      localStorage.setItem('schematicHubSound', soundEnabled ? 'on' : 'off');
      button.setAttribute('aria-pressed', soundEnabled ? 'true' : 'false');
      button.textContent = soundEnabled ? '♫' : '♩';
      if (soundEnabled) {
        unlockAudio();
        setTimeout(playClick, 20);
      }
    });
  }

  const interactiveSelector = [
    'a[href]', 'button', '.schematic-card', '.manage-item', '.guide-grid article',
    '.detail-thumb', '.dashboard-card', 'select', '.auth-tab'
  ].join(',');

  document.addEventListener('pointerdown', unlockAudio, {passive:true});
  document.addEventListener('keydown', unlockAudio, {passive:true});

  document.addEventListener('pointerover', event => {
    if (!soundEnabled || event.pointerType === 'touch') return;
    const el = event.target.closest?.(interactiveSelector);
    if (!el) return;
    const related = event.relatedTarget?.closest?.(interactiveSelector);
    if (el === related) return;
    const now = performance.now();
    if (lastHoverEl === el && now - lastHoverAt < 160) return;
    lastHoverEl = el;
    lastHoverAt = now;
    playHover();
  });

  document.addEventListener('click', event => {
    const el = event.target.closest?.(interactiveSelector);
    if (el && !el.classList.contains('sound-toggle')) playClick();
  }, true);

  function navigateWithTransition(destination) {
    if (!destination) return;
    if (reducedMotion) {
      location.href = destination;
      return;
    }
    if (document.body.classList.contains('page-leave')) return;
    document.body.classList.add('page-leave');
    setTimeout(() => { location.href = destination; }, 205);
  }
  window.hubNavigate = navigateWithTransition;

  function isInternalNavigableLink(link) {
    if (!link || link.target === '_blank' || link.hasAttribute('download')) return false;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return false;
    try {
      const url = new URL(link.href, location.href);
      return url.origin === location.origin && url.href !== location.href;
    } catch (_) { return false; }
  }

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const card = event.target.closest?.('.schematic-card');
    if (card && !event.target.closest('.card-action')) {
      const id = card.dataset.schematicId;
      if (id) {
        event.preventDefault();
        event.stopPropagation();
        navigateWithTransition(`schematic.html?id=${encodeURIComponent(id)}`);
        return;
      }
    }

    const link = event.target.closest?.('a[href]');
    if (!isInternalNavigableLink(link)) return;
    event.preventDefault();
    navigateWithTransition(link.href);
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest?.('.schematic-card');
    if (!card) return;
    const id = card.dataset.schematicId;
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    navigateWithTransition(`schematic.html?id=${encodeURIComponent(id)}`);
  }, true);

  function setupReveals() {
    const targets = document.querySelectorAll(
      '.browse, .catalog, .guide, .schematic-card, .guide-grid article, .dashboard-section, .dashboard-card, .detail-main, .detail-side-card'
    );
    if (reducedMotion || !('IntersectionObserver' in window)) {
      targets.forEach(el => el.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, {threshold:.08, rootMargin:'0px 0px -25px 0px'});
    targets.forEach((el, i) => {
      el.classList.add('reveal-on-scroll');
      el.style.transitionDelay = `${Math.min((i % 6) * 35, 160)}ms`;
      observer.observe(el);
    });
  }

  function refreshDynamicReveals() {
    document.querySelectorAll('.schematic-card:not(.reveal-on-scroll), .manage-item:not(.reveal-on-scroll), .detail-thumb:not(.reveal-on-scroll)').forEach((el, i) => {
      el.classList.add('reveal-on-scroll');
      requestAnimationFrame(() => {
        el.style.transitionDelay = `${Math.min(i * 28, 140)}ms`;
        el.classList.add('is-visible');
      });
    });
  }

  const dynamicObserver = new MutationObserver(() => refreshDynamicReveals());
  dynamicObserver.observe(document.documentElement, {childList:true, subtree:true});

  installBranding();
  makeSoundToggle();
  setupReveals();
  refreshDynamicReveals();
})();
