// Corre dentro de cada vista do visualizador. Envia a posição do scroll ao visualizador
// e aplica a posição que vem das outras vistas. Só atua em iframes com nome "vsync:...".
(() => {
  let name = '';
  try { name = window.name || ''; } catch (e) { return; }
  if (window === window.top || !name.startsWith('vsync:')) return;

  const parentWin = window.parent;
  const send = (msg) => {
    try { parentWin.postMessage(Object.assign({ __vsync: 1 }, msg), '*'); } catch (e) {}
  };

  // Só quem está a ser mexido pelo utilizador envia scroll (evita ecos entre vistas).
  let userUntil = 0;
  let ignoreUntil = 0;
  let pending = false;
  const markUser = () => { userUntil = Date.now() + 1200; stopFollow(); };
  for (const ev of ['wheel', 'touchstart', 'touchmove', 'keydown', 'pointerdown']) {
    addEventListener(ev, markUser, { capture: true, passive: true });
  }
  addEventListener('pointermove', (e) => { if (e.buttons) markUser(); }, { capture: true, passive: true });

  // Aviso de cookies: depois de um clique, se mudou um cookie (ou valor guardado) com nome
  // de consentimento, avisa o visualizador, que recarrega os outros ecrãs.
  const CONSENT_RE = /consent|cookie|gdpr|cmp|optanon|didomi|cookielaw|cky|complianz|borlabs|tarteaucitron|iubenda|usercentrics|klaro/i;
  function consentSnapshot() {
    let out = '';
    try {
      for (const part of document.cookie.split(';')) {
        const name = part.split('=')[0].trim();
        if (CONSENT_RE.test(name)) out += part.trim() + ';';
      }
    } catch (e) {}
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (CONSENT_RE.test(k)) out += k + '=' + localStorage.getItem(k) + ';';
      }
    } catch (e) {}
    return out;
  }
  let consentBase = null;
  let consentTimers = [];
  function watchConsent() {
    if (consentBase === null) consentBase = consentSnapshot();
    consentTimers.forEach(clearTimeout);
    consentTimers = [400, 1200, 3000].map((ms) => setTimeout(() => {
      const now = consentSnapshot();
      if (now !== consentBase) {
        consentBase = now;
        consentTimers.forEach(clearTimeout);
        send({ type: 'consent' });
      }
    }, ms));
  }
  addEventListener('DOMContentLoaded', () => { consentBase = consentSnapshot(); }, { once: true });

  // Cliques/Enter avisam o visualizador, para saber que uma navegação foi do utilizador.
  const interact = () => { send({ type: 'interact' }); watchConsent(); };
  addEventListener('click', interact, true);
  addEventListener('submit', interact, true);
  addEventListener('keydown', (e) => { if (e.key === 'Enter') interact(); }, true);

  const root = () => document.scrollingElement || document.documentElement;
  const maxScroll = () => Math.max(0, root().scrollHeight - innerHeight);
  const PROBE = 0.3; // linha de referência: 30% da altura do ecrã

  // Está dentro de algo fixo/sticky? (com memória por frame, para não pesar em sites grandes)
  let fixedMemo = new Map();
  function isFixed(el) {
    if (!el || el.nodeType !== 1) return false;
    if (fixedMemo.has(el)) return fixedMemo.get(el);
    const p = getComputedStyle(el).position;
    const v = p === 'fixed' || p === 'sticky' || isFixed(el.parentElement);
    fixedMemo.set(el, v);
    return v;
  }

  function cssPath(el) {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (n.id && /^[A-Za-z][\w-]*$/.test(n.id)) {
        try {
          if (document.querySelectorAll('#' + n.id).length === 1) {
            parts.unshift('#' + n.id);
            return parts.join('>');
          }
        } catch (e) {}
      }
      let i = 1;
      for (let s = n.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === n.tagName) i++;
      parts.unshift(n.tagName.toLowerCase() + ':nth-of-type(' + i + ')');
    }
    return parts.length ? 'body>' + parts.join('>') : 'body';
  }

  // Bloco que está na linha de referência (ignora cabeçalhos fixos). Sobe até um bloco
  // largo (secção/linha), que existe pela mesma ordem em todos os tamanhos: assim a
  // correspondência entre ecrãs é contínua e não salta de cartão em cartão.
  function findAnchor() {
    fixedMemo = new Map();
    const stack = document.elementsFromPoint(innerWidth / 2, innerHeight * PROBE);
    for (let el of stack) {
      if (el === document.documentElement || el === document.body) break;
      if (isFixed(el)) continue;
      const minW = innerWidth * 0.6;
      while (el.parentElement && el.parentElement !== document.body && el.getBoundingClientRect().width < minW) {
        el = el.parentElement;
      }
      return el;
    }
    return null;
  }

  // O ecrã que segue desliza até à posição (em vez de saltar).
  let followTarget = null;
  let followRaf = 0;
  function stopFollow() {
    if (followRaf) cancelAnimationFrame(followRaf);
    followRaf = 0;
    followTarget = null;
  }
  function followStep() {
    const cur = root().scrollTop;
    const diff = followTarget - cur;
    if (Math.abs(diff) < 1) {
      window.scrollTo({ top: followTarget, behavior: 'instant' });
      followRaf = 0;
      return;
    }
    window.scrollTo({ top: cur + diff * 0.35, behavior: 'instant' });
    followRaf = requestAnimationFrame(followStep);
  }

  function report() {
    pending = false;
    const top = root().scrollTop;
    const max = maxScroll();
    const msg = {
      type: 'scroll',
      frac: max ? top / max : 0,
      edge: top <= 2 ? 'top' : top >= max - 2 ? 'bottom' : null,
      probe: PROBE,
    };
    if (!msg.edge) {
      const el = findAnchor();
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.height > 0) {
          msg.path = cssPath(el);
          msg.ratio = (innerHeight * PROBE - r.top) / r.height;
        }
      }
    }
    send(msg);
  }

  addEventListener('scroll', () => {
    const now = Date.now();
    if (now < ignoreUntil || now > userUntil) return;
    if (!pending) { pending = true; requestAnimationFrame(report); }
  }, { passive: true });

  function apply(d) {
    const max = maxScroll();
    let target;
    if (d.edge === 'top') target = 0;
    else if (d.edge === 'bottom') target = max;
    else {
      let el = null;
      if (d.path) { try { el = document.querySelector(d.path); } catch (e) {} }
      // Se o elemento está escondido neste tamanho, sobe até um pai visível.
      while (el && el !== document.body && !(el.getClientRects().length && el.getBoundingClientRect().height > 0)) {
        el = el.parentElement;
      }
      if (el && el !== document.body && el !== document.documentElement) {
        const r = el.getBoundingClientRect();
        target = root().scrollTop + r.top + r.height * d.ratio - innerHeight * d.probe;
      } else {
        target = d.frac * max;
      }
    }
    target = Math.max(0, Math.min(max, target));
    ignoreUntil = Date.now() + 250;
    userUntil = 0;
    followTarget = target;
    if (!followRaf) followRaf = requestAnimationFrame(followStep);
  }

  addEventListener('message', (e) => {
    if (e.source !== parentWin) return;
    const d = e.data;
    if (!d || d.__vsync !== 1) return;
    if (d.type === 'scroll') apply(d);
  });

  // Avisa o visualizador do endereço atual (também em sites que mudam de página sem recarregar).
  let lastUrl = '';
  const announce = () => { lastUrl = location.href; send({ type: 'nav', url: location.href }); };
  announce();
  setInterval(() => { if (location.href !== lastUrl) announce(); }, 500);
})();
