// Viewport Sync.
// Abre por cima da própria página do site (dentro de uma "shadow root", isolado do site).
// Como os ecrãs ficam no mesmo site que a página por baixo, os cookies e logins são os
// normais desse site: aceitar cookies ou iniciar sessão fica gravado, como na navegação normal.
// Também corre dentro de viewer.html, para páginas onde a extensão não pode entrar.
(() => {
  'use strict';
  if (window.__vsyncOverlay) { window.__vsyncOverlay.toggle(); return; }

  const hasChrome = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
  const isExtPage = location.protocol === 'chrome-extension:';

  // Ecrãs que se podem adicionar rapidamente.
  const PRESETS = [
    { name: 'iPhone SE', width: 375, height: 667, type: 'mobile' },
    { name: 'iPhone 16 Pro', width: 402, height: 874, type: 'mobile' },
    { name: 'iPhone 16 Pro Max', width: 440, height: 956, type: 'mobile' },
    { name: 'Android', width: 412, height: 915, type: 'mobile' },
    { name: 'iPad Mini', width: 744, height: 1133, type: 'tablet' },
    { name: 'iPad', width: 820, height: 1180, type: 'tablet' },
    { name: 'iPad Pro', width: 1024, height: 1366, type: 'tablet' },
    { name: 'Portátil', width: 1280, height: null, type: 'desktop' },
    { name: 'Desktop', width: 1440, height: null, type: 'desktop' },
    { name: 'Full HD', width: 1920, height: null, type: 'desktop' },
  ];

  // Ecrãs com que a extensão começa (e "Repor predefinidos").
  const DEFAULT_DEVICES = [
    { id: 'desktop', name: 'Desktop', width: 1440, height: null, type: 'desktop', on: true },
    { id: 'laptop', name: 'Portátil', width: 1280, height: null, type: 'desktop', on: false },
    { id: 'tablet', name: 'Tablet', width: 768, height: null, type: 'tablet', on: false },
    { id: 'mobile', name: 'Mobile', width: 402, height: null, type: 'mobile', on: true },
  ];
  const DEFAULT_SETTINGS = { devices: DEFAULT_DEVICES, syncScroll: true, syncNav: true, zoom: 'fit', theme: 'auto' };

  const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox ' +
    'allow-modals allow-downloads allow-pointer-lock allow-presentation allow-storage-access-by-user-activation';
  const HEAD = 34; // altura do título de cada ecrã (igual ao CSS)

  const svg = (inner) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const ICON_SUN = svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>');
  const ICON_MOON = svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>');

  const TEMPLATE = `
  <div class="app" id="app">
    <header class="bar">
      <form id="urlForm" class="url">
        <input id="url" type="text" spellcheck="false" autocomplete="off" placeholder="Endereço do site (ex: example.com)">
        <button type="button" id="reload" class="icon-btn" title="Recarregar todos os ecrãs" aria-label="Recarregar todos os ecrãs">
          ${svg('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>')}
        </button>
      </form>
      <div id="chips" class="chips" aria-label="Ecrãs"></div>
      <button type="button" id="manageBtn" class="btn">+ Ecrãs</button>
      <div class="spacer"></div>
      <label class="toggle"><input type="checkbox" id="syncScroll"> Sincronizar scroll</label>
      <label class="toggle"><input type="checkbox" id="syncNav"> Sincronizar navegação</label>
      <select id="zoom" title="Zoom">
        <option value="fit">Ajustar à janela</option>
        <option value="1">100%</option>
        <option value="0.75">75%</option>
        <option value="0.5">50%</option>
        <option value="0.33">33%</option>
      </select>
      <span id="scaleInfo" class="muted num"></span>
      <button type="button" id="themeBtn" class="icon-btn"></button>
      <button type="button" id="exitBtn" class="btn exit" title="Parar a pré-visualização e voltar ao site">
        ${svg('<path d="M18 6 6 18M6 6l12 12"/>')} Sair
      </button>
    </header>
    <main id="stage">
      <p id="empty" class="empty" hidden>Nenhum ecrã ligado. Clica num ecrã em cima para o mostrar.</p>
    </main>
    <dialog id="manage">
      <div class="dlg">
        <div class="dlg-head">
          <h2>Ecrãs</h2>
          <button type="button" id="closeDlg" class="icon-btn" title="Fechar" aria-label="Fechar">×</button>
        </div>
        <p class="muted">Liga, edita ou apaga ecrãs. Altura vazia = usa a altura da janela.</p>
        <div class="row rows-head"><span></span><span>Nome</span><span>Tipo</span><span>Largura</span><span>Altura</span><span></span></div>
        <div id="rows"></div>
        <div class="dlg-foot">
          <select id="addPreset"><option value="">+ Adicionar ecrã…</option></select>
          <button type="button" id="resetBtn" class="btn ghost">Repor predefinidos</button>
        </div>
      </div>
    </dialog>
  </div>`;

  // ---------- Estado ----------
  let isOpen = false;
  let host = null;     // elemento por cima da página
  let root = null;     // shadow root
  let ui = {};         // referências aos elementos da interface
  let settings = null;
  let currentUrl = '';
  let panels = new Map(); // id do ecrã → { device, el, name, w, box, iframe, badge, url, lastInteract }
  let savedOverflow = '';
  let cssSheet = null;

  // ---------- Guardar definições ----------
  const store = {
    async get() {
      try {
        if (hasChrome) return (await chrome.storage.local.get('settings')).settings;
        return JSON.parse(localStorage.getItem('vsync-settings') || 'null');
      } catch (e) { return null; }
    },
    async set(value) {
      try {
        if (hasChrome) await chrome.storage.local.set({ settings: value });
        else localStorage.setItem('vsync-settings', JSON.stringify(value));
      } catch (e) {}
    },
  };
  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.set(settings), 250);
  }

  // ---------- Utilitários ----------
  function el(tag, cls, props) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (props) Object.assign(n, props);
    return n;
  }
  const clampW = (v) => Math.max(200, Math.min(4000, Math.round(+v) || 200));
  const parseH = (v) => { const n = Math.round(+v); return n >= 200 ? Math.min(n, 6000) : null; };
  const frameName = (d) => `vsync:${d.type}:${d.id}`;
  function normalize(raw) {
    let u = (raw || '').trim();
    if (!u) return '';
    if (!/^[a-z][\w+.-]*:/i.test(u)) u = (/^(localhost|127\.|\[::1\])/i.test(u) ? 'http://' : 'https://') + u;
    return u;
  }
  function msgBackground(msg) {
    if (!hasChrome) return Promise.resolve();
    return chrome.runtime.sendMessage(msg).catch(() => {});
  }

  // ---------- Tema (só da extensão, não muda os sites) ----------
  function currentTheme() {
    if (settings.theme === 'light' || settings.theme === 'dark') return settings.theme;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme() {
    const t = currentTheme();
    host.setAttribute('data-theme', t);
    // O botão mostra para onde vai: no claro mostra a lua, no escuro mostra o sol.
    ui.themeBtn.innerHTML = t === 'dark' ? ICON_SUN : ICON_MOON;
    const label = t === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro';
    ui.themeBtn.title = label;
    ui.themeBtn.setAttribute('aria-label', label);
  }

  // ---------- Barra de ecrãs ----------
  function renderChips() {
    ui.chips.replaceChildren(...settings.devices.map((d) => {
      const b = el('button', 'chip', { type: 'button', title: d.on ? 'Esconder este ecrã' : 'Mostrar este ecrã' });
      b.setAttribute('aria-pressed', String(!!d.on));
      b.append(d.name, el('small', '', { textContent: d.width }));
      b.onclick = () => { d.on = !d.on; save(); render(); };
      return b;
    }));
  }

  // ---------- Vistas ----------
  function createPanel(d) {
    const p = { device: d, url: '', lastInteract: 0 };
    p.el = el('section', 'panel');

    const head = el('div', 'panel-head');
    p.name = el('span', 'name');
    p.w = el('input', '', { type: 'number', min: 200, max: 4000, step: 1, title: 'Largura (px)' });
    p.w.addEventListener('change', () => {
      p.device.width = clampW(p.w.value);
      p.w.value = p.device.width;
      save();
      renderChips();
      layout();
    });
    p.w.addEventListener('keydown', (e) => { if (e.key === 'Enter') p.w.blur(); });
    const unit = el('span', 'unit', { textContent: 'px' });
    const close = el('button', 'close', { type: 'button', title: 'Esconder este ecrã', textContent: '×' });
    close.setAttribute('aria-label', 'Esconder este ecrã');
    close.onclick = () => { p.device.on = false; save(); render(); };
    head.append(p.name, p.w, unit, close);

    p.box = el('div', 'frame-box');
    p.iframe = el('iframe');
    p.iframe.name = frameName(d); // tem de estar antes de carregar: é assim que os scripts sabem o tipo
    p.iframe.setAttribute('sandbox', SANDBOX); // sem allow-top-navigation: o site não consegue "fugir" da vista
    p.iframe.setAttribute('allow', 'clipboard-write; fullscreen; geolocation');
    p.iframe.src = currentUrl || 'about:blank';
    p.box.append(p.iframe);

    // Pegas para redimensionar com o cursor: direita = largura, baixo = altura, canto = as duas.
    p.badge = el('div', 'size-badge num', { hidden: true });
    const handles = [
      ['e', 'Arrasta para mudar a largura'],
      ['s', 'Arrasta para mudar a altura · duplo clique = altura automática'],
      ['se', 'Arrasta para mudar largura e altura · duplo clique = altura automática'],
    ].map(([mode, title]) => {
      const hd = el('div', 'rz rz-' + mode, { title });
      hd.addEventListener('pointerdown', (e) => startResize(p, mode, e));
      if (mode !== 'e') hd.addEventListener('dblclick', () => { p.device.height = null; save(); layout(); });
      return hd;
    });

    p.el.append(head, p.box, p.badge, ...handles);
    return p;
  }

  let dragScale = null; // durante o arrasto o zoom fica fixo, para o ecrã seguir o cursor
  let lastScale = 1;

  function startResize(p, mode, e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    try { handle.setPointerCapture(e.pointerId); } catch (err) {}
    const d = p.device;
    const s = lastScale;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = d.width;
    const startH = d.height || Math.round(parseFloat(p.iframe.style.height));
    dragScale = s;

    // Prende os ecrãs à esquerda durante o arrasto, para a borda acompanhar o cursor.
    const stage = ui.stage;
    const first = stage.querySelector('.panel');
    const off = first.getBoundingClientRect().left - stage.getBoundingClientRect().left
      - parseFloat(getComputedStyle(stage).paddingLeft) + stage.scrollLeft;
    stage.classList.add('rz-lock');
    first.style.marginLeft = Math.max(0, off) + 'px';
    ui.app.classList.add('resizing', 'resizing-' + mode);

    const show = () => { p.badge.textContent = `${d.width} × ${d.height || 'auto'}`; };
    p.badge.hidden = false;
    show();

    const move = (ev) => {
      if (mode !== 's') d.width = clampW(startW + (ev.clientX - startX) / s);
      if (mode !== 'e') d.height = Math.max(200, Math.min(6000, Math.round(startH + (ev.clientY - startY) / s)));
      p.w.value = d.width;
      show();
      layout();
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      dragScale = null;
      stage.classList.remove('rz-lock');
      first.style.marginLeft = '';
      ui.app.classList.remove('resizing', 'resizing-' + mode);
      p.badge.hidden = true;
      save();
      renderChips();
      layout();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }

  function render() {
    renderChips();
    const on = settings.devices.filter((d) => d.on);

    for (const [id, p] of panels) {
      if (!on.some((d) => d.id === id)) { p.el.remove(); panels.delete(id); }
    }

    on.forEach((d, i) => {
      let p = panels.get(d.id);
      if (!p) {
        p = createPanel(d);
        panels.set(d.id, p);
        // Insere no sítio certo sem mexer nas vistas que já existem (mexer recarrega-as).
        const next = on.slice(i + 1).map((n) => panels.get(n.id)).find(Boolean);
        ui.stage.insertBefore(p.el, next ? next.el : ui.empty);
      }
      p.device = d;
      p.name.textContent = d.name;
      p.name.title = d.name;
      if (root.activeElement !== p.w) p.w.value = d.width;
      const nm = frameName(d);
      if (p.iframe.name !== nm) { // mudou o tipo (desktop/tablet/mobile) → recarrega
        p.iframe.name = nm;
        p.iframe.src = p.url || currentUrl || 'about:blank';
      }
    });

    ui.empty.hidden = on.length > 0;
    layout();
  }

  function layout() {
    if (!isOpen) return;
    const on = settings.devices.filter((d) => d.on && panels.has(d.id));
    if (!on.length) { ui.scaleInfo.textContent = ''; return; }
    const stage = ui.stage;
    const cs = getComputedStyle(stage);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const gap = parseFloat(cs.columnGap) || 0;
    const availW = stage.clientWidth - padX - gap * (on.length - 1);
    const availH = stage.clientHeight - padY - HEAD;

    let s;
    if (dragScale) {
      s = dragScale;
    } else if (settings.zoom === 'fit') {
      const sumW = on.reduce((a, d) => a + d.width, 0);
      s = Math.min(1, availW / sumW);
      const fixedH = Math.max(0, ...on.map((d) => d.height || 0));
      if (fixedH) s = Math.min(s, availH / fixedH);
    } else {
      s = parseFloat(settings.zoom) || 1;
    }
    s = Math.max(0.1, s);
    lastScale = s;

    for (const d of on) {
      const p = panels.get(d.id);
      const h = d.height || Math.max(200, Math.floor(availH / s));
      p.iframe.style.width = d.width + 'px';
      p.iframe.style.height = h + 'px';
      p.iframe.style.transform = `scale(${s})`;
      p.box.style.width = Math.round(d.width * s) + 'px';
      p.box.style.height = Math.round(h * s) + 'px';
      p.el.style.width = Math.round(d.width * s) + 'px';
    }
    ui.scaleInfo.textContent = Math.round(s * 100) + '%';
  }

  // ---------- Navegação ----------
  function updateAddress() {
    ui.url.value = currentUrl;
    if (!isExtPage) return; // por cima de um site não mexemos no endereço nem no título dele
    let h = '';
    try { h = new URL(currentUrl).host; } catch (e) {}
    document.title = (h ? h + ' · ' : '') + 'Viewport Sync';
    try { history.replaceState(null, '', '?url=' + encodeURIComponent(currentUrl)); } catch (e) {}
  }

  // Recarrega de verdade (mudar só o endereço não recarrega quando ele tem um "#").
  function reloadFrame(p) {
    try { p.iframe.contentWindow.location.reload(); }
    catch (e) { p.iframe.src = p.url || currentUrl || 'about:blank'; }
  }

  function navigate(raw) {
    const u = normalize(raw);
    if (!u) return;
    currentUrl = u;
    updateAddress();
    for (const p of panels.values()) { p.url = ''; p.iframe.src = u; }
  }

  // Mensagens que vêm das vistas (scroll, cliques, mudança de página, cookies).
  window.addEventListener('message', (e) => {
    if (!isOpen) return;
    const d = e.data;
    if (!d || d.__vsync !== 1) return;
    let src = null;
    for (const p of panels.values()) if (p.iframe.contentWindow === e.source) { src = p; break; }
    if (!src) return;

    if (d.type === 'scroll') {
      if (!settings.syncScroll) return;
      for (const p of panels.values()) if (p !== src) p.iframe.contentWindow?.postMessage(d, '*');
    } else if (d.type === 'interact') {
      src.lastInteract = Date.now();
    } else if (d.type === 'consent') {
      // Aceitaste/recusaste cookies num ecrã → recarrega os outros para o aviso desaparecer.
      for (const p of panels.values()) if (p !== src) reloadFrame(p);
    } else if (d.type === 'nav') {
      src.url = d.url;
      const byUser = Date.now() - src.lastInteract < 5000;
      if (!byUser || d.url === currentUrl) return;
      src.lastInteract = 0;
      currentUrl = d.url;
      updateAddress();
      if (settings.syncNav) {
        for (const p of panels.values()) if (p !== src && p.url !== d.url) p.iframe.src = d.url;
      }
    }
  });
  window.addEventListener('resize', () => layout());

  // ---------- Janela "Ecrãs" ----------
  function renderRows() {
    ui.rows.replaceChildren(...settings.devices.map((d) => {
      const r = el('div', 'row');

      const on = el('input', '', { type: 'checkbox', checked: !!d.on, title: 'Mostrar' });
      on.onchange = () => { d.on = on.checked; save(); render(); };

      const name = el('input', '', { type: 'text', value: d.name });
      name.oninput = () => { d.name = name.value.trim() || 'Ecrã'; save(); render(); };

      const type = el('select');
      for (const [v, t] of [['desktop', 'Desktop'], ['tablet', 'Tablet'], ['mobile', 'Mobile']]) {
        type.append(new Option(t, v, false, d.type === v));
      }
      type.onchange = () => { d.type = type.value; save(); render(); };

      const w = el('input', '', { type: 'number', min: 200, max: 4000, value: d.width, title: 'Largura (px)' });
      w.onchange = () => { d.width = clampW(w.value); w.value = d.width; save(); render(); };

      const h = el('input', '', { type: 'number', min: 200, max: 6000, value: d.height ?? '', placeholder: 'auto', title: 'Altura (px)' });
      h.onchange = () => { d.height = parseH(h.value); h.value = d.height ?? ''; save(); render(); };

      const del = el('button', 'icon-btn', { type: 'button', title: 'Apagar ecrã', textContent: '×' });
      del.setAttribute('aria-label', 'Apagar ecrã ' + d.name);
      del.onclick = () => {
        settings.devices = settings.devices.filter((x) => x !== d);
        save(); render(); renderRows();
      };

      r.append(on, name, type, w, h, del);
      return r;
    }));
  }

  function fillPresets() {
    const groups = { mobile: 'Mobile', tablet: 'Tablet', desktop: 'Desktop' };
    for (const [type, label] of Object.entries(groups)) {
      const g = el('optgroup');
      g.label = label;
      PRESETS.forEach((p, i) => {
        if (p.type === type) g.append(new Option(`${p.name} — ${p.width}${p.height ? ' × ' + p.height : ''}`, String(i)));
      });
      ui.addPreset.append(g);
    }
    ui.addPreset.append(new Option('Personalizado…', 'custom'));
  }

  function wireUi() {
    ui.addPreset.onchange = () => {
      const v = ui.addPreset.value;
      ui.addPreset.value = '';
      if (!v) return;
      const base = v === 'custom'
        ? { name: 'Novo ecrã', width: 1024, height: null, type: 'desktop' }
        : PRESETS[+v];
      settings.devices.push({ ...base, id: 'd' + Date.now().toString(36), on: true });
      save(); render(); renderRows();
      const last = ui.rows.lastElementChild;
      if (last) { last.scrollIntoView({ block: 'nearest' }); last.querySelector('input[type=text]')?.select(); }
    };
    ui.resetBtn.onclick = () => {
      if (!confirm('Repor os ecrãs predefinidos? Os ecrãs que criaste são apagados.')) return;
      settings.devices = structuredClone(DEFAULT_DEVICES);
      save(); render(); renderRows();
    };
    ui.manageBtn.onclick = () => { renderRows(); ui.manage.showModal(); };
    ui.closeDlg.onclick = () => ui.manage.close();
    ui.manage.addEventListener('click', (e) => { if (e.target === ui.manage) ui.manage.close(); });

    ui.urlForm.addEventListener('submit', (e) => { e.preventDefault(); navigate(ui.url.value); });
    ui.reload.onclick = () => { for (const p of panels.values()) reloadFrame(p); };
    ui.syncScroll.onchange = (e) => { settings.syncScroll = e.target.checked; save(); };
    ui.syncNav.onchange = (e) => { settings.syncNav = e.target.checked; save(); };
    ui.zoom.onchange = (e) => { settings.zoom = e.target.value; save(); layout(); };
    ui.exitBtn.onclick = () => close();
    ui.themeBtn.onclick = () => {
      settings.theme = currentTheme() === 'dark' ? 'light' : 'dark';
      save();
      applyTheme();
    };
  }

  // ---------- Abrir / fechar ----------
  async function loadCss() {
    if (cssSheet) return cssSheet;
    const url = hasChrome ? chrome.runtime.getURL('overlay.css') : (window.__vsyncCssUrl || 'overlay.css');
    const text = await (await fetch(url)).text();
    cssSheet = new CSSStyleSheet();
    cssSheet.replaceSync(text);
    return cssSheet;
  }

  async function open(startUrl) {
    if (isOpen) return;
    isOpen = true;
    const [sheet, saved] = await Promise.all([loadCss(), store.get()]);
    settings = Object.assign(structuredClone(DEFAULT_SETTINGS), saved || {});
    if (!Array.isArray(settings.devices) || !settings.devices.length) settings.devices = structuredClone(DEFAULT_DEVICES);

    host = document.createElement('vsync-viewer');
    host.style.cssText = 'all:initial;position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;' +
      'margin:0;padding:0;border:0;overflow:hidden;z-index:2147483647;display:block;background:transparent;';
    root = host.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [sheet];
    root.innerHTML = TEMPLATE;
    ui = {};
    root.querySelectorAll('[id]').forEach((n) => { ui[n.id] = n; });

    // O que se escreve no visualizador não chega aos atalhos de teclado nem aos avisos do site.
    for (const ev of ['keydown', 'keyup', 'keypress', 'beforeinput', 'input', 'focusin', 'focusout', 'paste', 'copy', 'cut', 'wheel', 'touchmove']) {
      host.addEventListener(ev, (e) => e.stopPropagation());
    }

    document.documentElement.appendChild(host);
    try { host.popover = 'manual'; host.showPopover(); } catch (e) {} // fica por cima de tudo

    // A página do site fica parada por baixo.
    savedOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    if (!isExtPage) document.querySelectorAll('video, audio').forEach((m) => { try { m.pause(); } catch (e) {} });

    ui.syncScroll.checked = settings.syncScroll;
    ui.syncNav.checked = settings.syncNav;
    ui.zoom.value = settings.zoom;
    applyTheme();
    fillPresets();
    wireUi();

    await msgBackground({ vsync: 'allow-framing' }); // antes de carregar qualquer ecrã

    currentUrl = normalize(startUrl);
    updateAddress();
    panels = new Map();
    render();
    if (!currentUrl) ui.url.focus();
  }

  async function close() {
    if (!isOpen) return;
    const target = currentUrl;
    await msgBackground({ vsync: 'stop-framing' });
    if (isExtPage) {
      if (target) location.replace(target); else history.back();
      return;
    }
    isOpen = false;
    panels = new Map();
    try { host.hidePopover(); } catch (e) {}
    host.remove();
    host = root = null;
    document.documentElement.style.overflow = savedOverflow;
    // Se navegaste para outra página dentro dos ecrãs, o separador vai para essa página.
    if (target && target !== location.href) location.href = target;
  }

  window.__vsyncOverlay = {
    toggle() { if (isOpen) close(); else open(location.href); },
    isOpen() { return isOpen; },
  };
  if (hasChrome && !isExtPage) {
    chrome.runtime.onMessage.addListener((msg, sender, reply) => {
      if (msg && msg.vsync === 'toggle') { window.__vsyncOverlay.toggle(); reply(true); }
    });
  }

  open(isExtPage ? (new URLSearchParams(location.search).get('url') || '') : location.href);
})();
