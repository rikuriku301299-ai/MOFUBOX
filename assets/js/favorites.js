import { api } from './api.js';
import { escapeHtml } from './utils.js';
import { availBadge } from './reel.js';

// きになるリスト: the reels a customer has liked (❤), shown in one place so they
// can come back to the cats they were interested in.
export function initFavorites() {
  const overlay = document.querySelector('[data-fav-overlay]');
  if (!overlay) return;
  const trigger = document.querySelector('[data-fav-trigger]');
  const closeBtn = overlay.querySelector('[data-fav-close]');
  const listEl = overlay.querySelector('[data-fav-list]');

  async function load() {
    listEl.className = 'notif-empty';
    listEl.textContent = '読み込み中…';
    const { ok, status, data } = await api('/api/favorites');
    if (status === 401) { location.href = 'register.html'; return; }
    if (!ok) { listEl.textContent = '読み込めませんでした。'; return; }
    if (!data.reels.length) {
      listEl.className = 'notif-empty';
      listEl.textContent = 'まだありません。気になる子猫の ❤ を押すと、ここにまとめて表示されます。';
      return;
    }
    listEl.className = 'fav-list';
    listEl.innerHTML = data.reels.map(r => {
      const kennel = r.breederKennel || r.breederName || 'ブリーダー';
      const initial = escapeHtml(kennel.charAt(0));
      return `
        <a class="fav-row" href="profile.html?id=${r.breederId}">
          <span class="fav-row__thumb">${r.videoUrl ? '<span class="fav-row__play">▶</span>' : (r.posterEmoji || '🐱')}</span>
          <span class="fav-row__body">
            <span class="fav-row__top"><strong>${escapeHtml(kennel)}</strong> ${availBadge(r.availStatus)}</span>
            <span class="fav-row__cap">${escapeHtml(r.caption || '')}</span>
            <span class="fav-row__tags">${(r.tags || []).filter(Boolean).map(t => `#${escapeHtml(t)}`).join(' ')}</span>
          </span>
        </a>`;
    }).join('');
  }

  function open() { overlay.classList.add('open'); load(); }
  function close() { overlay.classList.remove('open'); }

  if (trigger) trigger.addEventListener('click', (e) => { e.preventDefault(); open(); });
  closeBtn.addEventListener('click', close);
}
