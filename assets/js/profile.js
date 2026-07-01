import { api } from './api.js';

export async function initProfileFollow() {
  const btn = document.querySelector('[data-toggle-follow-profile]');
  if (!btn) return;
  const defaultLabel = btn.textContent;
  const breederId = btn.dataset.breederId;

  function render(following) {
    btn.classList.toggle('is-following', following);
    btn.textContent = following ? 'フォロー中' : defaultLabel;
  }

  if (breederId) {
    const { ok, data } = await api('/api/reels');
    if (ok) {
      const mine = data.reels.find(r => String(r.breederId) === breederId);
      if (mine) render(mine.followedByMe);
    }
  }

  btn.addEventListener('click', async () => {
    if (!breederId) {
      render(!btn.classList.contains('is-following'));
      return;
    }
    const { ok, status, data } = await api(`/api/users/${breederId}/follow`, { method: 'POST' });
    if (status === 401) { location.href = 'register.html'; return; }
    if (ok) render(data.following);
  });
}
