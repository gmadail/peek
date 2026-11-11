// Peek.
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
    // Telemóveis (tamanho CSS na vertical)
    { name: 'Galaxy Z Fold (folded)', width: 344, height: 882, type: 'mobile' },
    { name: 'Galaxy S25', width: 360, height: 780, type: 'mobile' },
    { name: 'iPhone SE', width: 375, height: 667, type: 'mobile' },
    { name: 'iPhone 17 / 17 Pro', width: 402, height: 874, type: 'mobile' },
    { name: 'Pixel 10', width: 412, height: 923, type: 'mobile' },
    { name: 'iPhone Air', width: 420, height: 912, type: 'mobile' },
    { name: 'iPhone 17 Pro Max', width: 440, height: 956, type: 'mobile' },
    // Tablets
    { name: 'iPad mini', width: 744, height: 1133, type: 'tablet' },
    { name: 'iPad / iPad Air 11"', width: 820, height: 1180, type: 'tablet' },
    { name: 'iPad Pro 11"', width: 834, height: 1210, type: 'tablet' },
    { name: 'iPad Air 13"', width: 1024, height: 1366, type: 'tablet' },
    { name: 'iPad Pro 13"', width: 1032, height: 1376, type: 'tablet' },
    // Computadores
    { key: 'laptop', name: 'Laptop', width: 1280, height: null, type: 'desktop' },
    { name: 'Laptop HD', width: 1366, height: 768, type: 'desktop' },
    { key: 'desktop', name: 'Desktop', width: 1440, height: null, type: 'desktop' },
    { name: 'MacBook Air 13"', width: 1470, height: 956, type: 'desktop' },
    { name: 'MacBook Pro 14"', width: 1512, height: 982, type: 'desktop' },
    { name: 'Laptop Full HD (125%)', width: 1536, height: 864, type: 'desktop' },
    { name: 'MacBook Pro 16"', width: 1728, height: 1117, type: 'desktop' },
    { name: 'Full HD', width: 1920, height: null, type: 'desktop' },
    { name: 'QHD', width: 2560, height: null, type: 'desktop' },
  ];

  // Ecrãs com que a extensão começa (e "Repor predefinidos").
  const DEFAULT_DEVICES = [
    { id: 'desktop', name: 'Desktop', width: 1440, height: null, type: 'desktop', on: true },
    { id: 'laptop', name: 'Laptop', width: 1280, height: null, type: 'desktop', on: false },
    { id: 'tablet', name: 'Tablet', width: 768, height: null, type: 'tablet', on: false },
    { id: 'mobile', name: 'Mobile', width: 402, height: null, type: 'mobile', on: true },
  ];
  const DEFAULT_SETTINGS = { devices: DEFAULT_DEVICES, syncScroll: true, syncNav: true, zoom: 'fit', theme: 'auto', lang: 'en', tool: 'browse' };
  // Modos da extensão. Para juntar um modo novo: acrescenta aqui e um botão em TEMPLATE.
  const TOOLS = ['browse', 'inspect'];

  const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox ' +
    'allow-modals allow-downloads allow-pointer-lock allow-presentation allow-storage-access-by-user-activation';
  const HEAD = 34; // altura do título de cada ecrã (igual ao CSS)

  const svg = (inner) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const ICON_SUN = svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>');
  const ICON_RESET = svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>');
  const ICON_MOON = svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>');
  const ICON_POINTER = svg('<path d="M4.04 4.69a.5.5 0 0 1 .65-.65l16 6.5a.5.5 0 0 1-.06.95l-6.13 1.58a2 2 0 0 0-1.43 1.43l-1.58 6.13a.5.5 0 0 1-.95.06z"/>');
  const ICON_INSPECT = svg('<path d="M12.03 12.68a.5.5 0 0 1 .65-.65l9 3.5a.5.5 0 0 1-.03.94l-3.45 1.07a1 1 0 0 0-.66.66l-1.07 3.45a.5.5 0 0 1-.94.03z"/><path d="M5 3a2 2 0 0 0-2 2M19 3a2 2 0 0 1 2 2M5 21a2 2 0 0 1-2-2M9 3h1M9 21h2M14 3h1M3 9v1M21 9v2M3 14v1"/>');
  const ICON_SETTINGS = svg('<path d="M20 7h-9M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>');
  const ICON_COPY = svg('<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>');

  const TEMPLATE = `
  <div class="app" id="app">
    <header class="bar">
      <div class="seg" id="tools" role="group">
        <button type="button" class="seg-btn" data-tool="browse">${ICON_POINTER}<span data-i18n="tool_browse"></span></button>
        <button type="button" class="seg-btn" data-tool="inspect">${ICON_INSPECT}<span data-i18n="tool_inspect"></span></button>
      </div>
      <form id="urlForm" class="url">
        <input id="url" type="text" spellcheck="false" autocomplete="off" data-i18n-placeholder="url_placeholder">
        <button type="button" id="reload" class="icon-btn" data-i18n-title="reload">
          ${svg('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>')}
        </button>
      </form>
      <div id="chips" class="chips"></div>
      <button type="button" id="manageBtn" class="btn" data-i18n="screens_btn"></button>
      <div class="spacer"></div>
      <select id="zoom" data-i18n-title="zoom">
        <option value="fit" data-i18n="fit"></option>
        <option value="1">100%</option>
        <option value="0.75">75%</option>
        <option value="0.5">50%</option>
        <option value="0.33">33%</option>
      </select>
      <span id="scaleInfo" class="muted num"></span>
      <div class="menu-wrap" id="settingsWrap">
        <button type="button" id="settingsBtn" class="icon-btn" data-i18n-title="settings" aria-haspopup="true" aria-expanded="false">${ICON_SETTINGS}</button>
        <div id="settingsMenu" class="menu" hidden>
          <label class="menu-row"><span data-i18n="sync_scroll"></span><input type="checkbox" id="syncScroll"></label>
          <label class="menu-row"><span data-i18n="sync_nav"></span><input type="checkbox" id="syncNav"></label>
          <label class="menu-row"><span data-i18n="language"></span>
            <select id="lang" class="lang">
              <option value="en">English</option>
              <option value="pt">Português</option>
              <option value="fr">Français</option>
            </select>
          </label>
        </div>
      </div>
      <button type="button" id="themeBtn" class="icon-btn"></button>
      <button type="button" id="exitBtn" class="btn exit" data-i18n-title="exit_title">
        ${svg('<path d="M18 6 6 18M6 6l12 12"/>')} <span data-i18n="exit"></span>
      </button>
    </header>
    <div class="body">
      <main id="stage">
        <p id="empty" class="empty" hidden data-i18n="empty"></p>
      </main>
      <aside id="inspector" hidden>
        <div class="insp-head">
          <h2 data-i18n="tool_inspect"></h2>
          <button type="button" id="inspClose" class="icon-btn" data-i18n-title="close">×</button>
        </div>
        <div id="inspBody" class="insp-body"></div>
        <div id="inspToast" class="insp-toast" hidden></div>
      </aside>
    </div>
    <dialog id="manage">
      <div class="dlg">
        <div class="dlg-head">
          <h2 data-i18n="dlg_title"></h2>
          <button type="button" id="closeDlg" class="icon-btn" data-i18n-title="close">×</button>
        </div>
        <p class="muted" data-i18n="dlg_help"></p>
        <div class="row rows-head"><span></span><span data-i18n="col_name"></span><span data-i18n="col_type"></span><span data-i18n="col_width"></span><span data-i18n="col_height"></span><span></span><span></span></div>
        <div id="rows"></div>
        <div class="dlg-foot">
          <select id="addPreset"></select>
          <button type="button" id="resetBtn" class="btn ghost" data-i18n="reset"></button>
        </div>
      </div>
    </dialog>
  </div>`;

  // ---------- Textos (inglês por defeito, português e francês) ----------
  const STRINGS = {
    en: {
      url_placeholder: 'Website address (e.g. example.com)', reload: 'Reload all screens', screens_btn: '+ Screens',
      sync_scroll: 'Sync scroll', sync_nav: 'Sync navigation', zoom: 'Zoom', fit: 'Fit to window', language: 'Language',
      exit: 'Exit', exit_title: 'Stop previewing and go back to the site',
      empty: 'No screens on. Click a screen above to show it.',
      dlg_title: 'Screens', close: 'Close', dlg_help: 'Turn screens on, edit or delete them. Empty height = use the window height.',
      col_name: 'Name', col_type: 'Type', col_width: 'Width', col_height: 'Height',
      add_screen: '+ Add screen…', custom: 'Custom…', reset: 'Reset to defaults', reset_one: 'Reset this screen',
      reset_confirm: 'Reset to the default screens? Screens you created will be deleted.',
      show_screen: 'Show this screen', hide_screen: 'Hide this screen', show: 'Show', delete_screen: 'Delete screen',
      width_px: 'Width (px)', height_px: 'Height (px)',
      rz_e: 'Drag to change the width',
      rz_s: 'Drag to change the height · double-click = auto height',
      rz_se: 'Drag to change width and height · double-click = auto height',
      to_light: 'Switch to light mode', to_dark: 'Switch to dark mode',
      type_desktop: 'Desktop', type_tablet: 'Tablet', type_mobile: 'Mobile', screen: 'Screen',
      tools: 'Mode', tool_browse: 'Browse', tool_inspect: 'Inspect', settings: 'Settings',
      tool_browse_title: 'Use the site normally', tool_inspect_title: 'Click an element to see its styles',
      inspect_empty: 'Click an element on any screen to see its size, spacing, text and colors. While this mode is on, clicks do not open links.',
      insp_missing: 'This element does not exist on this screen.', insp_hidden: 'This element is hidden on this screen.',
      sec_box: 'Size and spacing', sec_type: 'Text', sec_colors: 'Colors', sec_border: 'Border', sec_layout: 'Layout', sec_effects: 'Effects',
      p_size: 'Size', p_font: 'Font', p_font_size: 'Size', p_weight: 'Weight', p_line: 'Line height', p_spacing: 'Letter spacing',
      p_align: 'Align', p_transform: 'Transform', p_text_color: 'Text', p_bg: 'Background', p_contrast: 'Contrast', p_border: 'Border', p_radius: 'Radius',
      p_display: 'Display', p_position: 'Position', p_direction: 'Direction', p_justify: 'Justify', p_items: 'Align items',
      p_gap: 'Gap', p_columns: 'Columns', p_overflow: 'Overflow', p_z: 'Z-index', p_shadow: 'Shadow', p_opacity: 'Opacity', p_natural: 'Image file',
      parent: 'parent', gradient: 'gradient', image: 'image', c_large: 'AA large text', c_fail: 'Fail',
      copy_css: 'Copy CSS', clear_sel: 'Clear', copied: 'Copied', click_copy: 'Click to copy',
    },
    pt: {
      url_placeholder: 'Endereço do site (ex: example.com)', reload: 'Recarregar todos os ecrãs', screens_btn: '+ Ecrãs',
      sync_scroll: 'Sincronizar scroll', sync_nav: 'Sincronizar navegação', zoom: 'Zoom', fit: 'Ajustar à janela', language: 'Idioma',
      exit: 'Sair', exit_title: 'Parar a pré-visualização e voltar ao site',
      empty: 'Nenhum ecrã ligado. Clica num ecrã em cima para o mostrar.',
      dlg_title: 'Ecrãs', close: 'Fechar', dlg_help: 'Liga, edita ou apaga ecrãs. Altura vazia = usa a altura da janela.',
      col_name: 'Nome', col_type: 'Tipo', col_width: 'Largura', col_height: 'Altura',
      add_screen: '+ Adicionar ecrã…', custom: 'Personalizado…', reset: 'Repor predefinidos', reset_one: 'Repor este ecrã',
      reset_confirm: 'Repor os ecrãs predefinidos? Os ecrãs que criaste são apagados.',
      show_screen: 'Mostrar este ecrã', hide_screen: 'Esconder este ecrã', show: 'Mostrar', delete_screen: 'Apagar ecrã',
      width_px: 'Largura (px)', height_px: 'Altura (px)',
      rz_e: 'Arrasta para mudar a largura',
      rz_s: 'Arrasta para mudar a altura · duplo clique = altura automática',
      rz_se: 'Arrasta para mudar largura e altura · duplo clique = altura automática',
      to_light: 'Mudar para modo claro', to_dark: 'Mudar para modo escuro',
      type_desktop: 'Desktop', type_tablet: 'Tablet', type_mobile: 'Mobile', screen: 'Ecrã',
      tools: 'Modo', tool_browse: 'Navegar', tool_inspect: 'Inspecionar', settings: 'Definições',
      tool_browse_title: 'Usar o site normalmente', tool_inspect_title: 'Clicar num elemento para ver os estilos',
      inspect_empty: 'Clica num elemento, em qualquer ecrã, para ver o tamanho, os espaçamentos, o texto e as cores. Com este modo ligado, os cliques não abrem links.',
      insp_missing: 'Este elemento não existe neste ecrã.', insp_hidden: 'Este elemento está escondido neste ecrã.',
      sec_box: 'Tamanho e espaçamento', sec_type: 'Texto', sec_colors: 'Cores', sec_border: 'Borda', sec_layout: 'Layout', sec_effects: 'Efeitos',
      p_size: 'Tamanho', p_font: 'Tipo de letra', p_font_size: 'Tamanho', p_weight: 'Peso', p_line: 'Altura da linha', p_spacing: 'Espaço entre letras',
      p_align: 'Alinhamento', p_transform: 'Transformação', p_text_color: 'Texto', p_bg: 'Fundo', p_contrast: 'Contraste', p_border: 'Borda', p_radius: 'Raio',
      p_display: 'Display', p_position: 'Posição', p_direction: 'Direção', p_justify: 'Justify', p_items: 'Align items',
      p_gap: 'Gap', p_columns: 'Colunas', p_overflow: 'Overflow', p_z: 'Z-index', p_shadow: 'Sombra', p_opacity: 'Opacidade', p_natural: 'Ficheiro da imagem',
      parent: 'do pai', gradient: 'gradiente', image: 'imagem', c_large: 'AA texto grande', c_fail: 'Insuficiente',
      copy_css: 'Copiar CSS', clear_sel: 'Limpar', copied: 'Copiado', click_copy: 'Clica para copiar',
    },
    fr: {
      url_placeholder: 'Adresse du site (ex. : example.com)', reload: 'Recharger tous les écrans', screens_btn: '+ Écrans',
      sync_scroll: 'Défilement synchronisé', sync_nav: 'Navigation synchronisée', zoom: 'Zoom', fit: 'Ajuster à la fenêtre', language: 'Langue',
      exit: 'Quitter', exit_title: 'Arrêter l’aperçu et revenir au site',
      empty: 'Aucun écran activé. Cliquez sur un écran en haut pour l’afficher.',
      dlg_title: 'Écrans', close: 'Fermer', dlg_help: 'Activez, modifiez ou supprimez des écrans. Hauteur vide = hauteur de la fenêtre.',
      col_name: 'Nom', col_type: 'Type', col_width: 'Largeur', col_height: 'Hauteur',
      add_screen: '+ Ajouter un écran…', custom: 'Personnalisé…', reset: 'Réinitialiser', reset_one: 'Réinitialiser cet écran',
      reset_confirm: 'Revenir aux écrans par défaut ? Les écrans que vous avez créés seront supprimés.',
      show_screen: 'Afficher cet écran', hide_screen: 'Masquer cet écran', show: 'Afficher', delete_screen: 'Supprimer l’écran',
      width_px: 'Largeur (px)', height_px: 'Hauteur (px)',
      rz_e: 'Faites glisser pour changer la largeur',
      rz_s: 'Faites glisser pour changer la hauteur · double-clic = hauteur auto',
      rz_se: 'Faites glisser pour changer largeur et hauteur · double-clic = hauteur auto',
      to_light: 'Passer en mode clair', to_dark: 'Passer en mode sombre',
      type_desktop: 'Ordinateur', type_tablet: 'Tablette', type_mobile: 'Mobile', screen: 'Écran',
      tools: 'Mode', tool_browse: 'Naviguer', tool_inspect: 'Inspecter', settings: 'Réglages',
      tool_browse_title: 'Utiliser le site normalement', tool_inspect_title: 'Cliquer sur un élément pour voir ses styles',
      inspect_empty: 'Cliquez sur un élément, sur n’importe quel écran, pour voir sa taille, ses espacements, son texte et ses couleurs. Dans ce mode, les clics n’ouvrent pas les liens.',
      insp_missing: 'Cet élément n’existe pas sur cet écran.', insp_hidden: 'Cet élément est masqué sur cet écran.',
      sec_box: 'Taille et espacement', sec_type: 'Texte', sec_colors: 'Couleurs', sec_border: 'Bordure', sec_layout: 'Mise en page', sec_effects: 'Effets',
      p_size: 'Taille', p_font: 'Police', p_font_size: 'Taille', p_weight: 'Graisse', p_line: 'Interligne', p_spacing: 'Espacement des lettres',
      p_align: 'Alignement', p_transform: 'Transformation', p_text_color: 'Texte', p_bg: 'Fond', p_contrast: 'Contraste', p_border: 'Bordure', p_radius: 'Rayon',
      p_display: 'Display', p_position: 'Position', p_direction: 'Direction', p_justify: 'Justify', p_items: 'Align items',
      p_gap: 'Gap', p_columns: 'Colonnes', p_overflow: 'Overflow', p_z: 'Z-index', p_shadow: 'Ombre', p_opacity: 'Opacité', p_natural: 'Fichier image',
      parent: 'du parent', gradient: 'dégradé', image: 'image', c_large: 'AA grand texte', c_fail: 'Insuffisant',
      copy_css: 'Copier le CSS', clear_sel: 'Effacer', copied: 'Copié', click_copy: 'Cliquer pour copier',
    },
  };
  // Nomes dos ecrãs predefinidos em cada língua (mudam com a língua enquanto não forem renomeados).
  const DEV_NAMES = {
    desktop: { en: 'Desktop', pt: 'Desktop', fr: 'Ordinateur' },
    laptop: { en: 'Laptop', pt: 'Portátil', fr: 'Portable' },
    tablet: { en: 'Tablet', pt: 'Tablet', fr: 'Tablette' },
    mobile: { en: 'Mobile', pt: 'Mobile', fr: 'Mobile' },
    new: { en: 'New screen', pt: 'Novo ecrã', fr: 'Nouvel écran' },
  };
  const lang = () => (STRINGS[settings && settings.lang] ? settings.lang : 'en');
  const t = (key) => STRINGS[lang()][key] ?? STRINGS.en[key] ?? key;
  const nameOf = (d) => (!d.custom && DEV_NAMES[d.key || d.id]) ? DEV_NAMES[d.key || d.id][lang()] : d.name;

  function applyI18n() {
    root.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
    root.querySelectorAll('[data-i18n-title]').forEach((n) => {
      n.title = t(n.dataset.i18nTitle);
      n.setAttribute('aria-label', t(n.dataset.i18nTitle));
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((n) => { n.placeholder = t(n.dataset.i18nPlaceholder); });
    ui.chips.setAttribute('aria-label', t('dlg_title'));
    ui.tools.setAttribute('aria-label', t('tools'));
    ui.tools.querySelectorAll('[data-tool]').forEach((b) => { b.title = t('tool_' + b.dataset.tool + '_title'); });
  }
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
  // Modo Inspecionar: elemento escolhido e os estilos dele em cada ecrã.
  let inspect = { sel: 0, path: '', infos: new Map(), view: null };
  let looseInteract = 0; // clique cujo ecrã mudou de página antes de o aviso chegar

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
    const theme = currentTheme();
    host.setAttribute('data-theme', theme);
    // O botão mostra para onde vai: no claro mostra a lua, no escuro mostra o sol.
    ui.themeBtn.innerHTML = theme === 'dark' ? ICON_SUN : ICON_MOON;
    const label = t(theme === 'dark' ? 'to_light' : 'to_dark');
    ui.themeBtn.title = label;
    ui.themeBtn.setAttribute('aria-label', label);
  }

  // ---------- Barra de ecrãs ----------
  function renderChips() {
    ui.chips.replaceChildren(...settings.devices.map((d) => {
      const b = el('button', 'chip', { type: 'button', title: t(d.on ? 'hide_screen' : 'show_screen') });
      b.setAttribute('aria-pressed', String(!!d.on));
      b.append(nameOf(d), el('small', '', { textContent: d.width }));
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
    p.w = el('input', '', { type: 'number', min: 200, max: 4000, step: 1 });
    p.w.addEventListener('change', () => {
      p.device.width = clampW(p.w.value);
      p.w.value = p.device.width;
      save();
      renderChips();
      layout();
    });
    p.w.addEventListener('keydown', (e) => { if (e.key === 'Enter') p.w.blur(); });
    const unit = el('span', 'unit', { textContent: 'px' });
    const close = el('button', 'close', { type: 'button', textContent: '×' });
    p.close = close;
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
    p.handles = ['e', 's', 'se'].map((mode) => {
      const hd = el('div', 'rz rz-' + mode);
      hd.dataset.mode = mode;
      hd.addEventListener('pointerdown', (e) => startResize(p, mode, e));
      if (mode !== 'e') hd.addEventListener('dblclick', () => { p.device.height = null; save(); layout(); });
      return hd;
    });

    p.el.append(head, p.box, p.badge, ...p.handles);
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
      p.name.textContent = nameOf(d);
      p.name.title = nameOf(d);
      p.w.title = t('width_px');
      p.close.title = t('hide_screen');
      p.close.setAttribute('aria-label', t('hide_screen'));
      p.handles.forEach((hd) => { hd.title = t('rz_' + hd.dataset.mode); });
      if (root.activeElement !== p.w) p.w.value = d.width;
      const nm = frameName(d);
      if (p.iframe.name !== nm) { // mudou o tipo (desktop/tablet/mobile) → recarrega
        p.iframe.name = nm;
        p.iframe.src = p.url || currentUrl || 'about:blank';
      }
    });

    ui.empty.hidden = on.length > 0;
    layout();
    renderInspector();
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
    if (settings.tool === 'inspect') for (const p of panels.values()) sendInspect(p);
  }

  // ---------- Navegação ----------
  function updateAddress() {
    ui.url.value = currentUrl;
    if (!isExtPage) return; // por cima de um site não mexemos no endereço nem no título dele
    let h = '';
    try { h = new URL(currentUrl).host; } catch (e) {}
    document.title = (h ? h + ' · ' : '') + 'Peek';
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
    clearSelection();
    for (const p of panels.values()) { p.url = ''; p.iframe.src = u; }
  }

  // Mensagens que vêm das vistas (scroll, cliques, mudança de página, cookies).
  window.addEventListener('message', (e) => {
    if (!isOpen) return;
    const d = e.data;
    if (!d || d.__vsync !== 1) return;
    let src = null;
    for (const p of panels.values()) if (p.iframe.contentWindow === e.source) { src = p; break; }
    if (!src) {
      // Página rápida: o ecrã já mudou de página quando o aviso do clique chega (fica sem origem).
      if (e.source === null && d.type === 'interact') looseInteract = Date.now();
      return;
    }

    if (d.type === 'scroll') {
      if (!settings.syncScroll) return;
      for (const p of panels.values()) if (p !== src) p.iframe.contentWindow?.postMessage(d, '*');
    } else if (d.type === 'interact') {
      src.lastInteract = Date.now();
    } else if (d.type === 'consent') {
      // Aceitaste/recusaste cookies num ecrã → recarrega os outros para o aviso desaparecer.
      for (const p of panels.values()) if (p !== src) reloadFrame(p);
    } else if (d.type === 'inspect-pick') {
      if (settings.tool === 'inspect' && typeof d.path === 'string') select(d.path, src);
    } else if (d.type === 'inspect-info') {
      if (d.sel !== inspect.sel || !d.info || typeof d.info !== 'object') return;
      inspect.infos.set(src.device.id, d.info);
      renderInspector();
    } else if (d.type === 'inspect-ready') {
      if (d.on) guard(src, false);
    } else if (d.type === 'inspect-esc') {
      escInspect();
    } else if (d.type === 'nav') {
      // Página nova neste ecrã: volta a dizer-lhe o modo e o elemento escolhido.
      if (settings.tool === 'inspect') {
        sendInspect(src);
        if (inspect.path) post(src, { type: 'inspect-show', path: inspect.path, sel: inspect.sel, reveal: false });
      }
      src.url = d.url;
      const byUser = Date.now() - Math.max(src.lastInteract, looseInteract) < 5000;
      if (!byUser || d.url === currentUrl) return;
      src.lastInteract = 0;
      looseInteract = 0;
      currentUrl = d.url;
      updateAddress();
      if (settings.syncNav) {
        for (const p of panels.values()) if (p !== src && p.url !== d.url) p.iframe.src = d.url;
      }
    }
  });
  window.addEventListener('resize', () => layout());
  window.addEventListener('blur', () => { if (isOpen) setMenu(false); }); // clique dentro de um ecrã fecha o menu

  // ---------- Modos (Navegar / Inspecionar) ----------
  function post(p, msg) {
    try { p.iframe.contentWindow.postMessage(Object.assign({ __vsync: 1 }, msg), '*'); } catch (e) {}
  }
  function sendInspect(p) {
    post(p, { type: 'inspect', on: settings.tool === 'inspect', scale: lastScale });
  }
  function setTool(tool) {
    if (!TOOLS.includes(tool)) tool = 'browse';
    if (settings.tool !== tool) { settings.tool = tool; save(); }
    if (tool !== 'inspect') clearSelection();
    ui.tools.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
    ui.inspector.hidden = tool !== 'inspect';
    ui.app.classList.toggle('inspecting', tool === 'inspect');
    for (const p of panels.values()) { guard(p, tool === 'inspect'); sendInspect(p); }
    renderInspector();
    layout(); // o painel ocupa espaço: os ecrãs voltam a ajustar-se
  }
  // Ao ligar o modo Inspecionar, cada ecrã só volta a receber cliques depois de confirmar
  // que já está nesse modo. Assim um clique rápido nunca abre um link por engano.
  function guard(p, on) {
    clearTimeout(p.waitTimer);
    p.box.classList.toggle('wait', on);
    if (on) p.waitTimer = setTimeout(() => p.box.classList.remove('wait'), 1500);
  }
  function setMenu(open) {
    if (!ui.settingsMenu) return;
    ui.settingsMenu.hidden = !open;
    ui.settingsBtn.setAttribute('aria-expanded', String(open));
  }

  // ---------- Modo Inspecionar ----------
  // Um clique num ecrã escolhe o elemento. Os outros ecrãs marcam o mesmo elemento e cada um
  // devolve os seus valores, para se poder comparar desktop e mobile.
  function select(path, src) {
    inspect.sel++;
    inspect.path = path;
    inspect.infos = new Map();
    if (src) inspect.view = src.device.id;
    for (const p of panels.values()) post(p, { type: 'inspect-show', path, sel: inspect.sel, reveal: p !== src });
    renderInspector();
  }
  function clearSelection() {
    if (!inspect.path) return;
    inspect.sel++;
    inspect.path = '';
    inspect.infos = new Map();
    for (const p of panels.values()) post(p, { type: 'inspect-clear' });
    renderInspector();
  }
  function escInspect() {
    if (settings.tool !== 'inspect') return;
    if (inspect.path) clearSelection(); else setTool('browse');
  }

  // Os valores vêm de dentro da página: são sempre tratados como texto simples.
  const str = (v, max = 120) => String(v ?? '').slice(0, max);
  const fmt = (n) => String(Math.round((+n || 0) * 100) / 100);
  const arr4 = (v) => [0, 1, 2, 3].map((k) => (Array.isArray(v) ? +v[k] || 0 : 0));
  const col = (c) => (c && /^#[0-9a-f]{6}$/i.test(c.hex)
    ? { hex: c.hex.toUpperCase(), a: Math.max(0, Math.min(1, +c.a || 0)) } : null);
  const colorText = (c) => c.hex + (c.a < 1 ? ' ' + Math.round(c.a * 100) + '%' : '');
  const colorCss = (c) => (c.a < 1
    ? `rgba(${[1, 3, 5].map((k) => parseInt(c.hex.slice(k, k + 2), 16)).join(', ')}, ${c.a})` : c.hex);

  let toastTimer;
  async function copyText(text) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {}
    if (!ok) {
      try {
        const ta = el('textarea', '', { value: text });
        ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0;';
        ui.app.append(ta);
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch (e) {}
    }
    if (!ok || !ui.inspToast) return;
    const one = !text.includes('\n') && text.length <= 34;
    ui.inspToast.textContent = t('copied') + (one ? ': ' + text : '');
    ui.inspToast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (ui.inspToast) ui.inspToast.hidden = true; }, 1400);
  }

  function prop(label, text, opts = {}) {
    const r = el('div', 'prop');
    const v = el('button', 'prop-v', { type: 'button', title: opts.title || t('click_copy') });
    if (opts.color) {
      const sw = el('i', 'sw');
      sw.style.backgroundColor = opts.color;
      v.append(sw);
    }
    v.append(el('span', '', { textContent: text }));
    if (opts.note) v.append(el('small', '', { textContent: opts.note }));
    v.onclick = () => copyText(opts.copy ?? text);
    r.append(el('span', 'prop-k', { textContent: label }), v);
    return r;
  }
  const colorProp = (label, c, note) => prop(label, colorText(c), { color: colorCss(c), copy: colorCss(c), note });
  function section(title, rows) {
    const s = el('section', 'insp-sec');
    s.append(el('h3', '', { textContent: title }), ...rows.filter(Boolean));
    return s;
  }

  // Desenho da caixa: margin > border > padding > conteúdo (como nas ferramentas do browser).
  function boxDiagram(i) {
    const cell = (v, cls) => el('span', 'bm-n ' + cls, { textContent: v ? fmt(v) : '-' });
    const layer = (cls, name, v, inner) => {
      const b = el('div', 'bm ' + cls);
      b.append(el('span', 'bm-name', { textContent: name }), cell(v[0], 'bm-t'), cell(v[3], 'bm-l'), inner, cell(v[1], 'bm-r'), cell(v[2], 'bm-b'));
      return b;
    };
    const size = arr4(i.content);
    const c = el('div', 'bm-c', { textContent: `${fmt(size[0])} × ${fmt(size[1])}` });
    return layer('bm-margin', 'margin', arr4(i.margin),
      layer('bm-border', 'border', arr4(i.border),
        layer('bm-padding', 'padding', arr4(i.padding), c)));
  }

  function inspTabs(on) {
    const tabs = el('div', 'insp-tabs');
    for (const d of on) {
      const i = inspect.infos.get(d.id);
      const b = el('button', 'chip', { type: 'button' });
      b.setAttribute('aria-pressed', String(d.id === inspect.view));
      if (i && (i.missing || i.hidden)) b.classList.add('dim');
      b.append(nameOf(d), el('small', '', { textContent: d.width }));
      b.onclick = () => { inspect.view = d.id; renderInspector(); };
      tabs.append(b);
    }
    return tabs;
  }

  function inspHeader(i) {
    const h = el('div', 'insp-el');
    const title = el('div', 'insp-tag');
    title.append(el('b', '', { textContent: str(i.tag, 40) }));
    const extra = (i.id ? '#' + i.id : '') + (Array.isArray(i.cls) ? i.cls.map((c) => '.' + c).join('') : '');
    if (extra) title.append(el('span', 'muted', { textContent: str(extra) }));
    h.append(title);
    if (i.text) h.append(el('div', 'insp-text muted', { textContent: '"' + str(i.text, 80) + '"' }));
    // Caminho até ao elemento: clicar num dos pais seleciona esse pai.
    if (Array.isArray(i.crumbs) && i.crumbs.length > 1) {
      const nav = el('div', 'crumbs');
      i.crumbs.slice(0, 6).forEach((c, k, all) => {
        const last = k === all.length - 1;
        const b = el('button', 'crumb', { type: 'button', textContent: str(c && c.label, 40), disabled: last });
        if (!last && c && typeof c.path === 'string') b.onclick = () => select(c.path, null);
        nav.append(b);
        if (!last) nav.append(el('span', 'crumb-sep', { textContent: '›' }));
      });
      h.append(nav);
    }
    return h;
  }

  function cssOf(i) {
    const f = i.font || {};
    const short = (v) => {
      const [a, b, c, d] = arr4(v).map((x) => fmt(x) + 'px');
      return a === b && b === c && c === d ? a : a === c && b === d ? `${a} ${b}` : b === d ? `${a} ${b} ${c}` : `${a} ${b} ${c} ${d}`;
    };
    const L = [`width: ${fmt(i.w)}px;`, `height: ${fmt(i.h)}px;`];
    if (arr4(i.margin).some(Boolean)) L.push(`margin: ${short(i.margin)};`);
    if (arr4(i.padding).some(Boolean)) L.push(`padding: ${short(i.padding)};`);
    if (i.hasText) {
      L.push(`font-family: ${str(f.stack, 300)};`, `font-size: ${str(f.size)};`, `font-weight: ${str(f.weight)};`, `line-height: ${str(f.line)};`);
      if (f.spacing && f.spacing !== 'normal') L.push(`letter-spacing: ${str(f.spacing)};`);
      if (col(i.color)) L.push(`color: ${colorCss(col(i.color))};`);
    }
    if (col(i.bg)) L.push(`background-color: ${colorCss(col(i.bg))};`);
    if (i.line) {
      const lc = col(i.line.color);
      L.push(`border: ${fmt(i.line.width)}px ${str(i.line.style, 20)}${lc ? ' ' + colorCss(lc) : ''};`);
    }
    if (Array.isArray(i.radius)) {
      const r = i.radius.map((v) => str(v, 30));
      L.push(`border-radius: ${r.every((v) => v === r[0]) ? r[0] : r.join(' ')};`);
    }
    if (i.shadow) L.push(`box-shadow: ${str(i.shadow, 300)};`);
    if (i.opacity) L.push(`opacity: ${str(i.opacity)};`);
    if (i.flex || i.columns) L.push(`display: ${str(i.display)};`);
    if (i.flex) L.push(`flex-direction: ${str(i.flex.direction)};`, `justify-content: ${str(i.flex.justify)};`, `align-items: ${str(i.flex.items)};`);
    if (i.gap) L.push(`gap: ${str(i.gap)};`);
    return L.join('\n');
  }

  function inspSections(i) {
    const out = [];
    const f = i.font || {};

    out.push(section(t('sec_box'), [prop(t('p_size'), `${fmt(i.w)} × ${fmt(i.h)}`), boxDiagram(i)]));

    if (i.hasText) {
      const weight = str(f.weight) + (f.style && f.style !== 'normal' ? ' ' + str(f.style) : '');
      out.push(section(t('sec_type'), [
        prop(t('p_font'), str(f.family), { copy: str(f.stack, 300), title: str(f.stack, 300) }),
        prop(t('p_font_size'), str(f.size)),
        prop(t('p_weight'), weight),
        prop(t('p_line'), str(f.line)),
        f.spacing && parseFloat(f.spacing) ? prop(t('p_spacing'), str(f.spacing)) : null,
        prop(t('p_align'), str(f.align)),
        f.transform && f.transform !== 'none' ? prop(t('p_transform'), str(f.transform)) : null,
      ]));
    }

    const color = col(i.color);
    const bg = col(i.bg);
    const under = col(i.under);
    const colors = [];
    if (i.hasText && color) colors.push(colorProp(t('p_text_color'), color));
    if (bg) colors.push(colorProp(t('p_bg'), bg));
    else if (i.bgImage) colors.push(prop(t('p_bg'), t(i.bgImage === 'gradient' ? 'gradient' : 'image')));
    else if (i.underImage) colors.push(prop(t('p_bg'), t(i.underImage === 'gradient' ? 'gradient' : 'image'), { note: t('parent') }));
    else if (under) colors.push(colorProp(t('p_bg'), under, t('parent')));
    if (+i.contrast) {
      const c = +i.contrast;
      colors.push(prop(t('p_contrast'), fmt(c) + ':1', { note: c >= 7 ? 'AAA' : c >= 4.5 ? 'AA' : c >= 3 ? t('c_large') : t('c_fail') }));
    }
    if (colors.length) out.push(section(t('sec_colors'), colors));

    const borders = [];
    if (i.line) {
      const lc = col(i.line.color);
      borders.push(prop(t('p_border'), `${fmt(i.line.width)}px ${str(i.line.style, 20)}` + (lc ? ' ' + colorText(lc) : ''), { color: lc && colorCss(lc) }));
    }
    if (Array.isArray(i.radius)) {
      const r = i.radius.map((v) => str(v, 30));
      borders.push(prop(t('p_radius'), r.every((v) => v === r[0]) ? r[0] : r.join(' ')));
    }
    if (borders.length) out.push(section(t('sec_border'), borders));

    const fx = i.flex;
    out.push(section(t('sec_layout'), [
      prop(t('p_display'), str(i.display)),
      i.position && i.position !== 'static' ? prop(t('p_position'), str(i.position)) : null,
      fx ? prop(t('p_direction'), str(fx.direction) + (fx.wrap && fx.wrap !== 'nowrap' ? ' ' + str(fx.wrap) : '')) : null,
      fx ? prop(t('p_justify'), str(fx.justify)) : null,
      fx ? prop(t('p_items'), str(fx.items)) : null,
      +i.columns ? prop(t('p_columns'), fmt(i.columns)) : null,
      i.gap ? prop(t('p_gap'), str(i.gap)) : null,
      i.overflow ? prop(t('p_overflow'), str(i.overflow)) : null,
      i.z ? prop(t('p_z'), str(i.z)) : null,
    ]));

    const effects = [
      i.shadow ? prop(t('p_shadow'), str(i.shadow, 200)) : null,
      i.opacity ? prop(t('p_opacity'), str(i.opacity)) : null,
      Array.isArray(i.natural) ? prop(t('p_natural'), `${fmt(i.natural[0])} × ${fmt(i.natural[1])}`) : null,
    ].filter(Boolean);
    if (effects.length) out.push(section(t('sec_effects'), effects));

    const actions = el('div', 'insp-actions');
    const copy = el('button', 'btn', { type: 'button', innerHTML: ICON_COPY });
    copy.append(el('span', '', { textContent: t('copy_css') }));
    copy.onclick = () => copyText(cssOf(i));
    const clear = el('button', 'btn ghost', { type: 'button', textContent: t('clear_sel') });
    clear.onclick = () => clearSelection();
    actions.append(copy, clear);
    out.push(actions);
    return out;
  }

  function renderInspector() {
    if (!isOpen || !ui.inspBody || settings.tool !== 'inspect') return;
    const body = ui.inspBody;
    if (!inspect.path) {
      body.replaceChildren(el('p', 'insp-empty muted', { textContent: t('inspect_empty') }));
      return;
    }
    const on = settings.devices.filter((d) => d.on && panels.has(d.id));
    const usable = (d) => { const i = inspect.infos.get(d.id); return i && !i.missing && !i.hidden; };
    if (!on.some((d) => d.id === inspect.view)) inspect.view = (on.find(usable) || on[0] || {}).id;
    const info = inspect.infos.get(inspect.view);
    if (!info && !inspect.infos.size) return; // ainda à espera da resposta dos ecrãs

    const out = [];
    if (on.length > 1) out.push(inspTabs(on));
    try {
      if (info && info.missing) {
        out.push(el('p', 'insp-empty muted', { textContent: t('insp_missing') }));
      } else if (info) {
        out.push(inspHeader(info));
        if (info.hidden) out.push(el('p', 'insp-empty muted', { textContent: t('insp_hidden') }));
        else out.push(...inspSections(info));
      }
    } catch (e) {}
    const scroll = body.scrollTop;
    body.replaceChildren(...out);
    body.scrollTop = scroll;
  }

  // ---------- Janela "Ecrãs" ----------
  function renderRows() {
    ui.rows.replaceChildren(...settings.devices.map((d) => {
      const r = el('div', 'row');

      const on = el('input', '', { type: 'checkbox', checked: !!d.on, title: t('show') });
      on.onchange = () => { d.on = on.checked; save(); render(); };

      // Repor: só nos ecrãs predefinidos, e só quando foram alterados.
      const reset = el('button', 'icon-btn reset-one', { type: 'button', title: t('reset_one'), innerHTML: ICON_RESET });
      reset.setAttribute('aria-label', t('reset_one'));
      const refresh = () => { reset.hidden = !isModified(d); };
      reset.onclick = () => {
        const def = defaultOf(d);
        Object.assign(d, { name: def.name, type: def.type, width: def.width, height: def.height, custom: false });
        save(); render(); renderRows();
      };

      const name = el('input', '', { type: 'text', value: nameOf(d) });
      name.oninput = () => { d.name = name.value.trim() || t('screen'); d.custom = true; save(); render(); refresh(); };

      const type = el('select');
      for (const v of ['desktop', 'tablet', 'mobile']) type.append(new Option(t('type_' + v), v, false, d.type === v));
      type.onchange = () => { d.type = type.value; save(); render(); refresh(); };

      const w = el('input', '', { type: 'number', min: 200, max: 4000, value: d.width, title: t('width_px') });
      w.onchange = () => { d.width = clampW(w.value); w.value = d.width; save(); render(); refresh(); };

      const h = el('input', '', { type: 'number', min: 200, max: 6000, value: d.height ?? '', placeholder: 'auto', title: t('height_px') });
      h.onchange = () => { d.height = parseH(h.value); h.value = d.height ?? ''; save(); render(); refresh(); };
      refresh();

      const del = el('button', 'icon-btn', { type: 'button', title: t('delete_screen'), textContent: '×' });
      del.setAttribute('aria-label', t('delete_screen') + ' ' + nameOf(d));
      del.onclick = () => {
        settings.devices = settings.devices.filter((x) => x !== d);
        save(); render(); renderRows();
      };

      const resetCell = el('span', 'reset-cell');
      resetCell.append(reset);
      r.append(on, name, type, w, h, resetCell, del);
      return r;
    }));
  }

  const defaultOf = (d) => DEFAULT_DEVICES.find((x) => x.id === d.id);
  function isModified(d) {
    const def = defaultOf(d);
    if (!def) return false;
    return !!d.custom || d.type !== def.type || d.width !== def.width || (d.height ?? null) !== (def.height ?? null);
  }

  function fillPresets() {
    // "+ Add screen…" é só o texto do botão: não aparece como opção na lista.
    const placeholder = new Option(t('add_screen'), '', true, true);
    placeholder.disabled = true;
    placeholder.hidden = true;
    ui.addPreset.replaceChildren(placeholder);
    for (const type of ['mobile', 'tablet', 'desktop']) {
      const g = el('optgroup');
      g.label = t('type_' + type);
      PRESETS.forEach((p, i) => {
        if (p.type !== type) return;
        const label = p.key ? DEV_NAMES[p.key][lang()] : p.name;
        g.append(new Option(`${label} — ${p.width}${p.height ? ' × ' + p.height : ''}`, String(i)));
      });
      ui.addPreset.append(g);
    }
    ui.addPreset.append(new Option(t('custom'), 'custom'));
  }

  // Muda a língua de toda a interface.
  function applyLanguage() {
    applyI18n();
    applyTheme();
    fillPresets();
    render();
    if (ui.manage.open) renderRows();
  }

  function wireUi() {
    ui.tools.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tool]');
      if (b) setTool(b.dataset.tool);
    });
    ui.inspClose.onclick = () => setTool('browse');
    ui.settingsBtn.onclick = () => setMenu(ui.settingsMenu.hidden);
    root.addEventListener('pointerdown', (e) => {
      if (!ui.settingsMenu.hidden && !ui.settingsWrap.contains(e.target)) setMenu(false);
    });
    host.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || ui.manage.open || root.activeElement === ui.url) return;
      if (!ui.settingsMenu.hidden) setMenu(false); else escInspect();
    });

    ui.addPreset.onchange = () => {
      const v = ui.addPreset.value;
      ui.addPreset.value = '';
      if (!v) return;
      const base = v === 'custom'
        ? { key: 'new', name: DEV_NAMES.new[lang()], width: 1024, height: null, type: 'desktop' }
        : { ...PRESETS[+v] };
      if (!base.key) base.custom = true;
      settings.devices.push({ ...base, id: 'd' + Date.now().toString(36), on: true });
      save(); render(); renderRows();
      const last = ui.rows.lastElementChild;
      if (last) { last.scrollIntoView({ block: 'nearest' }); last.querySelector('input[type=text]')?.select(); }
    };
    ui.resetBtn.onclick = () => {
      if (!confirm(t('reset_confirm'))) return;
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
    ui.lang.onchange = (e) => { settings.lang = e.target.value; save(); applyLanguage(); };
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
    if (!STRINGS[settings.lang]) settings.lang = 'en';
    // Ecrãs predefinidos com o nome original (em qualquer língua) passam a seguir a língua escolhida.
    for (const d of settings.devices) {
      if (d.custom !== undefined) continue;
      const names = DEV_NAMES[d.key || d.id];
      d.custom = !(names && Object.values(names).includes(d.name));
    }

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
    ui.lang.value = settings.lang;
    applyI18n();
    applyTheme();
    fillPresets();
    wireUi();

    await msgBackground({ vsync: 'allow-framing' }); // antes de carregar qualquer ecrã

    currentUrl = normalize(startUrl);
    updateAddress();
    panels = new Map();
    inspect = { sel: 0, path: '', infos: new Map(), view: null };
    render();
    setTool(settings.tool);
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
