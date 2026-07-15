// Lightweight sharing used across the app to power organic, zero-budget growth.
// On mobile it uses the native share sheet (LINE/Instagram/X/… all appear).
// On desktop it falls back to copying the link and showing a toast.

function toast(message) {
  let el = document.querySelector('.share-toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'share-toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}

export async function share(url, text) {
  const shareData = { title: 'MOFUBOX', text: text || 'MOFUBOXで気になる子猫に出会えます🐱', url };
  if (navigator.share) {
    try { await navigator.share(shareData); return; }
    catch { /* user cancelled or unsupported — fall through to copy */ }
  }
  try {
    await navigator.clipboard.writeText(`${text ? text + ' ' : ''}${url}`);
    toast('リンクをコピーしました。SNSやLINEに貼って共有できます');
  } catch {
    toast('共有リンク: ' + url);
  }
}

export function lineShareUrl(url) {
  return `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`;
}
export function xShareUrl(url, text) {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text || '')}&url=${encodeURIComponent(url)}`;
}

// Delegate clicks so any [data-share] element — including ones rendered later
// (reel slides, my-page) — triggers a share without needing to be re-wired.
export function initShareButtons() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-share]');
    if (!btn) return;
    e.preventDefault();
    const base = location.origin;
    let url = btn.dataset.shareUrl || location.href;
    if (url.startsWith('/')) url = base + url;
    share(url, btn.dataset.shareText || '');
  });
}
