// Corre dentro das vistas do visualizador (antes do site). Nas vistas tablet/mobile,
// faz o JavaScript do site achar que está num iPhone/iPad (user agent + toque).
(() => {
  let name = '';
  try { name = window.name || ''; } catch (e) { return; }
  if (window === window.top || !name.startsWith('vsync:')) return;
  const kind = name.split(':')[1];
  const UAS = {
    mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    tablet: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  };
  const ua = UAS[kind];
  if (!ua) return;
  const def = (obj, prop, value) => {
    try { Object.defineProperty(obj, prop, { get: () => value, configurable: true }); } catch (e) {}
  };
  def(Navigator.prototype, 'userAgent', ua);
  def(Navigator.prototype, 'appVersion', ua.replace(/^Mozilla\//, ''));
  def(Navigator.prototype, 'platform', kind === 'mobile' ? 'iPhone' : 'iPad');
  def(Navigator.prototype, 'vendor', 'Apple Computer, Inc.');
  def(Navigator.prototype, 'maxTouchPoints', 5);
  if ('userAgentData' in Navigator.prototype) def(Navigator.prototype, 'userAgentData', undefined);
  if (!('ontouchstart' in window)) window.ontouchstart = null;
})();
