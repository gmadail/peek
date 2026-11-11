// Corre dentro de cada vista do visualizador. No modo "Inspecionar", um clique num elemento
// não abre links: marca o elemento (margem, borda, padding e conteúdo) e envia os estilos
// dele ao visualizador. Só atua em iframes com nome "vsync:...".
(() => {
  let name = '';
  try { name = window.name || ''; } catch (e) { return; }
  if (window === window.top || !name.startsWith('vsync:')) return;

  const parentWin = window.parent;
  const send = (msg) => {
    try { parentWin.postMessage(Object.assign({ __vsync: 1 }, msg), '*'); } catch (e) {}
  };

  let on = false;
  let scale = 1;       // zoom do ecrã no visualizador (para as linhas e a etiqueta não ficarem minúsculas)
  let selEl = null;    // elemento selecionado
  let selPath = '';
  let selId = 0;
  let hoverEl = null;
  let host = null;
  let parts = null;
  let cursorStyle = null;
  let raf = 0;
  let timer = 0;
  let observer = null;
  let lastSent = '';

  // ---------- Caminho do elemento (igual em todos os ecrãs, porque a página é a mesma) ----------
  function cssPath(el) {
    if (el === document.documentElement) return 'html';
    const out = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (n.id) {
        const sel = '#' + CSS.escape(n.id);
        try {
          if (document.querySelectorAll(sel).length === 1) { out.unshift(sel); return out.join('>'); }
        } catch (e) {}
      }
      let i = 1;
      for (let s = n.previousElementSibling; s; s = s.previousElementSibling) if (s.localName === n.localName) i++;
      out.unshift(CSS.escape(n.localName) + ':nth-of-type(' + i + ')');
    }
    return out.length ? 'body>' + out.join('>') : 'body';
  }
  function find(path) {
    if (!path) return null;
    try { return document.querySelector(path); } catch (e) { return null; }
  }

  // ---------- Cores ----------
  let ctx = null;
  function rgba(str) {
    if (!str) return null;
    const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(str);
    if (m) {
      const a = m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]);
      return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3]), a];
    }
    // Outros formatos (oklch, color(), …): pinta um píxel e lê a cor.
    try {
      if (!ctx) {
        const c = document.createElement('canvas');
        c.width = c.height = 1;
        ctx = c.getContext('2d', { willReadFrequently: true });
      }
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = str;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], Math.round(d[3] / 255 * 100) / 100];
    } catch (e) { return null; }
  }
  function colorOut(c) {
    if (!c) return null;
    const hex = '#' + c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    return { hex, a: c[3], css: `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3]})` };
  }
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  function contrast(fg, bg) {
    const a = fg[3];
    const mix = [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)); // texto com transparência
    const l1 = lum(mix);
    const l2 = lum(bg);
    return Math.round((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) * 100) / 100;
  }
  // Cor de fundo que está por trás do elemento (a dele ou a do primeiro pai com fundo).
  function backdrop(el) {
    let image = null; // 'gradient' ou 'image', se houver um por cima da cor
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const img = cs.backgroundImage;
      if (!image && img && img !== 'none') image = /gradient\(/.test(img) ? 'gradient' : 'image';
      const c = rgba(cs.backgroundColor);
      if (c && c[3] > 0) return { c, image, sure: !image && c[3] === 1 };
    }
    return { c: [255, 255, 255, 1], image, sure: !image };
  }

  // ---------- Estilos do elemento ----------
  const SIDES = ['Top', 'Right', 'Bottom', 'Left'];
  const num = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;
  const sides = (cs, pre, post = '') => SIDES.map((s) => num(cs[pre + s + post]));

  function label(n) {
    let s = n.localName;
    if (n.id) s += '#' + n.id;
    else if (n.classList && n.classList.length) s += '.' + n.classList[0];
    return s.slice(0, 40);
  }
  function crumbs(el) {
    const out = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.documentElement && out.length < 5; n = n.parentElement) {
      out.unshift({ label: label(n), path: cssPath(n) });
    }
    return out;
  }

  function describe(el) {
    const cs = getComputedStyle(el);
    const info = {
      tag: el.localName,
      id: el.id || '',
      cls: el.classList ? [...el.classList].slice(0, 6) : [],
      crumbs: crumbs(el),
    };
    if (cs.display === 'none' || !el.getClientRects().length) { info.hidden = true; return info; }

    const r = el.getBoundingClientRect();
    const margin = sides(cs, 'margin');
    const border = sides(cs, 'border', 'Width');
    const padding = sides(cs, 'padding');
    info.w = num(r.width);
    info.h = num(r.height);
    info.margin = margin;
    info.border = border;
    info.padding = padding;
    info.content = [
      Math.max(0, num(r.width - border[1] - border[3] - padding[1] - padding[3])),
      Math.max(0, num(r.height - border[0] - border[2] - padding[0] - padding[2])),
    ];

    // Texto
    const ownText = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join(' ').replace(/\s+/g, ' ').trim();
    info.hasText = !!ownText || /^(input|textarea|select|button)$/.test(el.localName);
    info.text = ownText.slice(0, 80);
    info.font = {
      family: cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, ''),
      stack: cs.fontFamily,
      size: cs.fontSize,
      weight: cs.fontWeight,
      style: cs.fontStyle,
      line: cs.lineHeight,
      spacing: cs.letterSpacing,
      align: cs.textAlign,
      transform: cs.textTransform,
    };

    // Cores
    const fg = rgba(cs.color);
    const own = rgba(cs.backgroundColor);
    const back = backdrop(el);
    const img = cs.backgroundImage;
    info.color = colorOut(fg);
    info.bg = colorOut(own && own[3] > 0 ? own : null);
    info.under = info.bg ? null : colorOut(back.c);
    info.bgImage = !img || img === 'none' ? null : (/gradient\(/.test(img) ? 'gradient' : 'image');
    info.underImage = info.bg || info.bgImage ? null : back.image;
    if (info.hasText && fg && back.sure) info.contrast = contrast(fg, back.c);

    // Borda
    const bi = border.findIndex((v) => v > 0);
    if (bi >= 0) {
      info.line = {
        width: border[bi],
        style: cs['border' + SIDES[bi] + 'Style'],
        color: colorOut(rgba(cs['border' + SIDES[bi] + 'Color'])),
      };
    }
    const rad = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map((c) => cs['border' + c + 'Radius']);
    info.radius = rad.every((v) => !parseFloat(v)) ? null : rad;

    // Layout
    info.display = cs.display;
    info.position = cs.position;
    const flex = /flex/.test(cs.display);
    const grid = /grid/.test(cs.display);
    if (flex) info.flex = { direction: cs.flexDirection, justify: cs.justifyContent, items: cs.alignItems, wrap: cs.flexWrap };
    if (grid) info.columns = (cs.gridTemplateColumns.match(/[\d.]+px/g) || []).length;
    if ((flex || grid) && !(cs.rowGap === 'normal' && cs.columnGap === 'normal')) {
      info.gap = cs.rowGap === cs.columnGap ? cs.rowGap : cs.rowGap + ' ' + cs.columnGap;
    }
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
      info.overflow = cs.overflowX === cs.overflowY ? cs.overflowX : cs.overflowX + ' ' + cs.overflowY;
    }
    if (cs.zIndex !== 'auto') info.z = cs.zIndex;

    // Efeitos
    if (cs.boxShadow && cs.boxShadow !== 'none') info.shadow = cs.boxShadow;
    if (+cs.opacity < 1) info.opacity = cs.opacity;
    if (el.localName === 'img' && el.naturalWidth) info.natural = [el.naturalWidth, el.naturalHeight];
    return info;
  }

  function reply(force) {
    if (!on || !selId) return;
    let info;
    try { info = selEl && selEl.isConnected ? describe(selEl) : { missing: true }; } catch (e) { info = { missing: true }; }
    const text = JSON.stringify(info);
    if (!force && text === lastSent) return;
    lastSent = text;
    send({ type: 'inspect-info', sel: selId, info });
  }

  // ---------- Marcação por cima da página ----------
  const CSS_TEXT = `
    .hover, .sel, .tag { position: absolute; left: 0; top: 0; box-sizing: border-box; }
    .hover { outline: calc(1.5px * var(--k)) solid #7c6cff; background: rgba(124, 108, 255, .10); }
    .sel { border-style: solid; border-color: rgba(246, 178, 107, .55); }
    .b, .p, .c { width: 100%; height: 100%; box-sizing: border-box; border-style: solid; }
    .b { border-color: rgba(255, 229, 153, .75); outline: calc(1.5px * var(--k)) solid #5b4bf0; }
    .p { border-color: rgba(147, 196, 125, .55); }
    .c { border: 0; background: rgba(111, 168, 220, .40); }
    .tag {
      padding: calc(2px * var(--k)) calc(6px * var(--k));
      border-radius: calc(4px * var(--k));
      background: #18181b;
      color: #fff;
      font: 600 calc(11px * var(--k))/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
      white-space: nowrap;
    }
    .tag b { font-weight: 400; opacity: .7; margin-left: calc(6px * var(--k)); }
    [hidden] { display: none !important; }
  `;
  function ensureHost() {
    if (host && host.isConnected) return true;
    if (!document.documentElement) return false;
    host = document.createElement('vsync-inspect');
    host.style.cssText = 'all:initial;position:fixed;inset:0;margin:0;padding:0;border:0;pointer-events:none;' +
      'z-index:2147483647;display:block;overflow:hidden;';
    const root = host.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS_TEXT);
    root.adoptedStyleSheets = [sheet];
    const div = (cls, parent) => {
      const n = document.createElement('div');
      n.className = cls;
      n.hidden = cls === 'hover' || cls === 'sel' || cls === 'tag';
      (parent || root).appendChild(n);
      return n;
    };
    parts = { hover: div('hover'), sel: div('sel'), tag: div('tag') };
    parts.b = div('b', parts.sel);
    parts.p = div('p', parts.b);
    parts.c = div('c', parts.p);
    parts.tagName = document.createElement('span');
    parts.tagSize = document.createElement('b');
    parts.tag.append(parts.tagName, parts.tagSize);
    document.documentElement.appendChild(host);
    return true;
  }
  const pxs = (v) => v.map((x) => Math.max(0, x) + 'px').join(' ');
  function setBox(n, x, y, w, h) {
    n.style.transform = `translate(${x}px, ${y}px)`;
    n.style.width = Math.max(0, w) + 'px';
    n.style.height = Math.max(0, h) + 'px';
  }

  function place() {
    raf = 0;
    if (!on || !ensureHost()) return;
    host.style.setProperty('--k', String(1 / scale));

    if (hoverEl && hoverEl.isConnected && hoverEl !== selEl) {
      const r = hoverEl.getBoundingClientRect();
      setBox(parts.hover, r.left, r.top, r.width, r.height);
      parts.hover.hidden = false;
    } else {
      parts.hover.hidden = true;
    }

    if (selEl && selEl.isConnected && selEl.getClientRects().length) {
      const cs = getComputedStyle(selEl);
      const r = selEl.getBoundingClientRect();
      const m = sides(cs, 'margin').map((v) => Math.max(0, v));
      setBox(parts.sel, r.left - m[3], r.top - m[0], r.width + m[1] + m[3], r.height + m[0] + m[2]);
      parts.sel.style.borderWidth = pxs(m);
      parts.b.style.borderWidth = pxs(sides(cs, 'border', 'Width'));
      parts.p.style.borderWidth = pxs(sides(cs, 'padding'));
      parts.sel.hidden = false;

      parts.tagName.textContent = label(selEl);
      parts.tagSize.textContent = `${num(r.width)} × ${num(r.height)}`;
      parts.tag.hidden = false;
      const gap = 4 / scale;
      const th = parts.tag.offsetHeight;
      const tw = parts.tag.offsetWidth;
      let ty = r.top - m[0] - th - gap;
      if (ty < 0) ty = r.bottom + m[2] + gap;
      if (ty + th > innerHeight) ty = Math.max(0, r.top + gap);
      const tx = Math.max(0, Math.min(r.left, innerWidth - tw));
      parts.tag.style.transform = `translate(${tx}px, ${ty}px)`;
    } else {
      parts.sel.hidden = true;
      parts.tag.hidden = true;
    }
  }
  const schedule = () => { if (on && !raf) raf = requestAnimationFrame(place); };
  const changed = () => { schedule(); reply(false); };

  // ---------- Ligar / desligar ----------
  function setMode(next, nextScale) {
    scale = nextScale > 0 ? nextScale : 1;
    if (next === on) { schedule(); return; }
    on = next;
    if (on) {
      if (document.documentElement) {
        cursorStyle = document.createElement('style');
        cursorStyle.textContent = '*, *::before, *::after { cursor: crosshair !important; }';
        document.documentElement.appendChild(cursorStyle);
      }
      // A página pode mudar (imagens a carregar, menus a abrir): mantém a marcação certa.
      timer = setInterval(() => {
        if (selPath && !(selEl && selEl.isConnected)) watch(find(selPath));
        changed();
      }, 500);
      schedule();
    } else {
      clearInterval(timer);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (cursorStyle) cursorStyle.remove();
      if (host) host.remove();
      if (observer) observer.disconnect();
      cursorStyle = host = parts = observer = null;
      selEl = hoverEl = null;
      selPath = '';
      selId = 0;
      lastSent = '';
    }
  }

  function watch(el) {
    selEl = el;
    if (observer) observer.disconnect();
    observer = null;
    if (el && typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(changed);
      observer.observe(el);
    }
  }

  function show(path, id, reveal) {
    selPath = path || '';
    selId = id;
    lastSent = '';
    watch(find(selPath));
    if (reveal && selEl && selEl.getClientRects().length) {
      const r = selEl.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) selEl.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
    reply(true);
    schedule();
  }

  function clearSel() {
    selPath = '';
    selId = 0;
    lastSent = '';
    watch(null);
    schedule();
  }

  // ---------- Rato e teclado (só no modo Inspecionar) ----------
  addEventListener('mousemove', (e) => {
    if (!on) return;
    const target = e.target && e.target.nodeType === 1 ? e.target : null;
    if (target !== hoverEl) { hoverEl = target; schedule(); }
  }, true);
  addEventListener('mouseout', (e) => {
    if (on && !e.relatedTarget) { hoverEl = null; schedule(); }
  }, true);

  // O site não chega a receber os cliques: não abre links nem menus.
  const block = (e) => {
    if (!on) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick', 'auxclick', 'submit']) {
    addEventListener(ev, block, true);
  }
  addEventListener('click', (e) => {
    if (!on) return;
    block(e);
    const target = e.target;
    if (target && target.nodeType === 1) send({ type: 'inspect-pick', path: cssPath(target) });
  }, true);
  addEventListener('keydown', (e) => {
    if (!on || e.key !== 'Escape') return;
    block(e);
    send({ type: 'inspect-esc' });
  }, true);

  addEventListener('scroll', schedule, { capture: true, passive: true });
  addEventListener('resize', changed, { passive: true });

  addEventListener('message', (e) => {
    if (e.source !== parentWin) return;
    const d = e.data;
    if (!d || d.__vsync !== 1) return;
    if (d.type === 'inspect') { setMode(!!d.on, +d.scale); send({ type: 'inspect-ready', on }); }
    else if (d.type === 'inspect-show') { if (on) show(d.path, d.sel, !!d.reveal); }
    else if (d.type === 'inspect-clear') clearSel();
  });
})();
