const VIEWER = chrome.runtime.getURL('viewer.html');
const isViewer = (url) => !!url && url.startsWith(VIEWER);

// ---------- Separadores com o visualizador ligado ----------
// Fica ligado no separador até carregares em Sair (ou no ícone) ou fechares o separador.
// Se mudares de página pela barra de endereço do Chrome, volta a abrir sozinho.
async function getActive() {
  const { active = [] } = await chrome.storage.session.get('active');
  return new Set(active);
}
async function setActive(tabId, on) {
  const set = await getActive();
  if (on) set.add(tabId); else set.delete(tabId);
  await chrome.storage.session.set({ active: [...set] });
  chrome.action.setBadgeText({ tabId, text: on ? 'ON' : '' }).catch(() => {});
  if (on) chrome.action.setBadgeBackgroundColor({ tabId, color: '#5B4BF0' }).catch(() => {});
}
async function isActive(tabId) {
  return (await getActive()).has(tabId);
}

function inject(tabId) {
  return chrome.scripting.executeScript({ target: { tabId }, files: ['overlay.js'] });
}

// Clique no ícone da extensão: liga ou desliga o visualizador no separador atual.
chrome.action.onClicked.addListener(async (tab) => {
  const url = tab.url || '';

  // Visualizador em página própria (usado em páginas especiais) → volta ao site.
  if (isViewer(url)) {
    const back = new URL(url).searchParams.get('url');
    await setActive(tab.id, false);
    await removeRule(tab.id);
    if (back) chrome.tabs.update(tab.id, { url: back });
    return;
  }

  // Já está aberto nesta página → fecha.
  try {
    await chrome.tabs.sendMessage(tab.id, { vsync: 'toggle' }, { frameId: 0 });
    return;
  } catch (e) { /* ainda não foi aberto nesta página */ }

  // Abre por cima da própria página do site.
  try {
    await inject(tab.id);
    return;
  } catch (e) { /* página onde a extensão não pode entrar */ }

  // Páginas especiais (chrome://, Chrome Web Store…): usa a página própria do visualizador.
  const site = /^(https?|file):/i.test(url) ? url : '';
  chrome.tabs.update(tab.id, { url: VIEWER + (site ? '?url=' + encodeURIComponent(site) : '') });
});

// Página nova no separador (ex: endereço escrito na barra do Chrome) → se o visualizador
// estava ligado, volta a abri-lo assim que a página tem conteúdo.
chrome.webNavigation.onDOMContentLoaded.addListener(async (details) => {
  if (details.frameId !== 0 || !/^https?:|^file:/i.test(details.url)) return;
  if (!(await isActive(details.tabId))) return;
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: details.tabId },
      func: () => !!(window.__vsyncOverlay && window.__vsyncOverlay.isOpen()),
    });
    if (!res || !res.result) await inject(details.tabId);
  } catch (e) { /* página onde a extensão não pode entrar */ }
});

// Regra que deixa os sites abrir dentro dos ecrãs (remove os cabeçalhos que o proíbem),
// só para este separador e só enquanto o visualizador está ligado.
function addRule(tabId) {
  return chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [tabId],
    addRules: [{
      id: tabId,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        responseHeaders: [
          { header: 'x-frame-options', operation: 'remove' },
          { header: 'content-security-policy', operation: 'remove' },
          { header: 'content-security-policy-report-only', operation: 'remove' },
        ],
      },
      condition: { tabIds: [tabId], resourceTypes: ['sub_frame'] },
    }],
  }).catch(() => {});
}
function removeRule(tabId) {
  return chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId] }).catch(() => {});
}

// O visualizador avisa quando abre e quando sai.
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const tabId = sender.tab && sender.tab.id;
  if (!msg || tabId == null) return;
  if (msg.vsync === 'allow-framing') {
    Promise.all([addRule(tabId), setActive(tabId, true)]).then(() => reply(true));
    return true;
  }
  if (msg.vsync === 'stop-framing') {
    Promise.all([removeRule(tabId), setActive(tabId, false)]).then(() => reply(true));
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  removeRule(tabId);
  setActive(tabId, false);
});
