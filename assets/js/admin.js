import { api } from './api.js';
import { escapeHtml, formatRegisterDate, bumpHeadingCount, STATUS_DOT } from './utils.js';

export async function initRegistrationFeed() {
  const breedersTable = document.querySelector('#view-breeders tbody');
  const usersTable = document.querySelector('#view-users tbody');
  if (!breedersTable && !usersTable) return;

  const { data: meData } = await api('/api/auth/me');
  if (!meData.user || meData.user.role !== 'admin') return;

  if (breedersTable) {
    const { ok, data } = await api('/api/admin/breeders');
    if (ok) {
      data.breeders.slice().reverse().forEach(b => breedersTable.prepend(buildBreederRow(b)));
      if (data.breeders.length) bumpHeadingCount('#view-breeders .panel-head h3', data.breeders.length);
    }
  }

  if (usersTable) {
    const { ok, data } = await api('/api/admin/customers');
    if (ok) {
      data.customers.slice().reverse().forEach(c => usersTable.prepend(buildCustomerRow(c)));
      if (data.customers.length) bumpHeadingCount('#view-users .panel-head h3', data.customers.length);
    }
  }
}

function buildBreederRow(b) {
  const tr = document.createElement('tr');
  const initial = escapeHtml((b.kennel || b.name || '?').charAt(0));
  tr.dataset.breederId = b.id;
  tr.innerHTML = `
    <td><div class="t-row-title"><div class="avatar avatar-sm mint" style="width:36px;height:36px;font-size:13px;">${initial}</div><div><strong>${escapeHtml(b.kennel || '')}</strong><span>${escapeHtml(b.address || '')}</span></div></div></td>
    <td>${formatRegisterDate(b.created_at)}</td><td class="t-num">0</td><td class="t-num">—</td>
    <td data-status-cell>${STATUS_DOT[b.status] || STATUS_DOT.pending}</td>
    <td><div class="row-actions">${b.status === 'pending'
      ? '<button class="approve" data-admin-action="approve" aria-label="承認"><svg class="icon" viewBox="0 0 24 24" width="15" height="15"><polyline points="20 6 9 17 4 12"/></svg></button><button class="reject" data-admin-action="reject" aria-label="却下"><svg class="icon" viewBox="0 0 24 24" width="15" height="15"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>'
      : '<button aria-label="詳細"><svg class="icon" viewBox="0 0 24 24" width="15" height="15"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>'}</div></td>
  `;
  tr.querySelectorAll('[data-admin-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { ok, data } = await api(`/api/admin/breeders/${b.id}/${btn.dataset.adminAction}`, { method: 'POST' });
      if (!ok) return;
      tr.querySelector('[data-status-cell]').innerHTML = STATUS_DOT[data.status] || '';
      tr.querySelector('.row-actions').innerHTML = '<button aria-label="詳細"><svg class="icon" viewBox="0 0 24 24" width="15" height="15"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>';
    });
  });
  return tr;
}

function buildCustomerRow(c) {
  const tr = document.createElement('tr');
  const initial = escapeHtml((c.name || '?').charAt(0));
  tr.innerHTML = `
    <td><div class="t-row-title"><div class="avatar avatar-sm mint" style="width:36px;height:36px;font-size:13px;">${initial}</div><div><strong>${escapeHtml(c.name || '')} 様</strong><span>${escapeHtml(c.area || '新規登録')}</span></div></div></td>
    <td>${formatRegisterDate(c.created_at)}</td><td class="t-num">0</td><td class="t-num">0</td>
    <td>${STATUS_DOT.active}</td>
    <td><div class="row-actions"><button aria-label="詳細"><svg class="icon" viewBox="0 0 24 24" width="15" height="15"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button></div></td>
  `;
  return tr;
}
