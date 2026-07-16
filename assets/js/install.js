// Gentle "add to home screen" hint on the landing page. Android/desktop Chrome
// get a one-tap install button (native prompt); iOS Safari gets the manual
// "共有 →ホーム画面に追加" instructions (iOS has no install event). Dismissible,
// and never nags again once closed or once the app is installed.
const DISMISS_KEY = 'mofubox_install_dismissed';
const SHARE_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1"/></svg>';

export function initInstallPrompt() {
  const p = location.pathname;
  if (!(p === '/' || p.endsWith('/index.html'))) return; // homepage only
  const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  if (standalone) return; // already installed
  if (localStorage.getItem(DISMISS_KEY)) return; // user closed it before

  let deferred = null;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    show('button');
  });

  if (isIOS) setTimeout(() => show('ios'), 1800);

  function show(mode) {
    if (document.querySelector('.install-banner')) return;
    const banner = document.createElement('div');
    banner.className = 'install-banner';
    banner.innerHTML = `
      <img src="/assets/icons/icon-192.png" alt="" class="install-banner__icon">
      <div class="install-banner__text">
        <strong>アプリみたいに使えます</strong>
        <span>${mode === 'ios'
          ? `共有 ${SHARE_SVG} →「ホーム画面に追加」でアイコンを追加`
          : 'ホーム画面に追加すると、すぐ子猫を見られます'}</span>
      </div>
      ${mode === 'button' ? '<button type="button" class="install-banner__add">追加</button>' : ''}
      <button type="button" class="install-banner__close" aria-label="閉じる">×</button>`;
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('show'));

    const close = (remember) => {
      banner.classList.remove('show');
      if (remember) localStorage.setItem(DISMISS_KEY, '1');
      setTimeout(() => banner.remove(), 300);
    };
    banner.querySelector('.install-banner__close').addEventListener('click', () => close(true));
    const addBtn = banner.querySelector('.install-banner__add');
    if (addBtn) addBtn.addEventListener('click', async () => {
      if (!deferred) { close(true); return; }
      deferred.prompt();
      try { await deferred.userChoice; } catch { /* ignore */ }
      deferred = null;
      close(true);
    });
  }
}
