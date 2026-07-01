import { api } from './api.js';
import { escapeHtml, formatRegisterDate } from './utils.js';

export async function initNotifications() {
  const wrap = document.querySelector('[data-notif-wrap]');
  if (!wrap) return;

  const toggle = wrap.querySelector('[data-notif-toggle]');
  const panel = wrap.querySelector('[data-notif-panel]');
  const dot = wrap.querySelector('[data-notif-dot]');
  const list = wrap.querySelector('[data-notif-list]');
  const readAllBtn = wrap.querySelector('[data-notif-read-all]');

  async function refresh() {
    const { ok, data } = await api('/api/notifications');
    if (!ok) return;

    dot.classList.toggle('show', data.unreadCount > 0);

    if (!data.notifications.length) {
      list.innerHTML = '<div class="notif-empty">通知はまだありません</div>';
      return;
    }

    list.innerHTML = data.notifications.map((n) => `
      <button type="button" class="notif-item${n.read ? '' : ' unread'}" data-notif-id="${n.id}">
        <div class="notif-item__title">${escapeHtml(n.title)}</div>
        ${n.body ? `<div class="notif-item__body">${escapeHtml(n.body)}</div>` : ''}
        <div class="notif-item__time">${formatRegisterDate(n.createdAt)}</div>
      </button>
    `).join('');

    list.querySelectorAll('[data-notif-id]').forEach((item) => {
      item.addEventListener('click', async () => {
        if (!item.classList.contains('unread')) return;
        item.classList.remove('unread');
        await api(`/api/notifications/${item.dataset.notifId}/read`, { method: 'POST' });
        const { data: updated } = await api('/api/notifications');
        dot.classList.toggle('show', updated.unreadCount > 0);
      });
    });
  }

  toggle.addEventListener('click', () => {
    const opening = !panel.classList.contains('open');
    panel.classList.toggle('open', opening);
    if (opening) refresh();
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) panel.classList.remove('open');
  });

  if (readAllBtn) {
    readAllBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await api('/api/notifications/read-all', { method: 'POST' });
      refresh();
    });
  }

  refresh();
}
