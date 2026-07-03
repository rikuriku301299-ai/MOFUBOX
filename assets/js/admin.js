import { api } from './api.js';
import { escapeHtml, formatRegisterDate, STATUS_DOT } from './utils.js';

export async function initRegistrationFeed() {
  const breedersTable = document.querySelector('#view-breeders tbody');
  const usersTable = document.querySelector('#view-users tbody');
  if (!breedersTable && !usersTable) return;

  const { data: meData } = await api('/api/auth/me');
  if (!meData.user || meData.user.role !== 'admin') return;

  if (breedersTable) {
    await loadBreeders(breedersTable, 'all');
    document.querySelectorAll('[data-seg-group="breeders-filter"] [data-seg-value]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-seg-group="breeders-filter"] button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadBreeders(breedersTable, btn.dataset.segValue);
      });
    });
  }

  if (usersTable) {
    await loadCustomers(usersTable, 'all');
    document.querySelectorAll('[data-seg-group="users-filter"] [data-seg-value]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-seg-group="users-filter"] button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadCustomers(usersTable, btn.dataset.segValue);
      });
    });
  }
}

async function loadBreeders(tbody, filter) {
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--ink-faint);padding:24px;">読み込み中…</td></tr>';
  const params = filter && filter !== 'all' ? `?status=${filter}` : '';
  const { ok, data } = await api(`/api/admin/breeders${params}`);
  if (!ok) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--coral-dark);padding:24px;">読み込みに失敗しました</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  const h3 = document.querySelector('#view-breeders .panel-head h3');
  if (h3) h3.textContent = `登録ブリーダー一覧（${data.breeders.length}軒）`;
  if (!data.breeders.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--ink-faint);padding:24px;">該当するブリーダーがいません</td></tr>';
    return;
  }
  data.breeders.forEach(b => tbody.appendChild(buildBreederRow(b)));
}

async function loadCustomers(tbody, filter) {
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--ink-faint);padding:24px;">読み込み中…</td></tr>';
  const { ok, data } = await api('/api/admin/customers');
  if (!ok) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--coral-dark);padding:24px;">読み込みに失敗しました</td></tr>';
    return;
  }
  let customers = data.customers;
  if (filter === 'active')    customers = customers.filter(c => c.status === 'active');
  if (filter === 'suspended') customers = customers.filter(c => c.status === 'suspended');
  tbody.innerHTML = '';
  const h3 = document.querySelector('#view-users .panel-head h3');
  if (h3) h3.textContent = `顧客ユーザー一覧（${customers.length}人）`;
  if (!customers.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--ink-faint);padding:24px;">該当するユーザーがいません</td></tr>';
    return;
  }
  customers.forEach(c => tbody.appendChild(buildCustomerRow(c)));
}

function buildBreederRow(b) {
  const tr = document.createElement('tr');
  const initial = escapeHtml((b.kennel || b.name || '?').charAt(0));
  tr.dataset.breederId = b.id;

  const isPending   = b.status === 'pending';
  const isApproved  = b.status === 'approved';
  const isSuspended = b.status === 'suspended';

  let actions = '';
  if (isPending) {
    actions = `
      <button data-action="approve" class="approve" aria-label="承認">
        <svg class="icon" viewBox="0 0 24 24" width="15" height="15"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <button data-action="reject" class="reject" aria-label="却下">
        <svg class="icon" viewBox="0 0 24 24" width="15" height="15"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>`;
  } else if (isApproved) {
    actions = `
      <button data-action="suspend-breeder" class="reject" aria-label="停止">
        <svg class="icon" viewBox="0 0 24 24" width="15" height="15"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>
      </button>`;
  } else if (isSuspended) {
    actions = `
      <button data-action="reinstate" class="approve" aria-label="復活">
        <svg class="icon" viewBox="0 0 24 24" width="15" height="15"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <button data-action="delete" class="reject" aria-label="削除">
        <svg class="icon" viewBox="0 0 24 24" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
      </button>`;
  }

  tr.innerHTML = `
    <td><div class="t-row-title">
      <div class="avatar avatar-sm mint" style="width:36px;height:36px;font-size:13px;">${initial}</div>
      <div>
        <strong>${escapeHtml(b.kennel || b.name || '')}</strong>
        <span>${escapeHtml(b.email || '')}</span>
      </div>
    </div></td>
    <td>${formatRegisterDate(b.created_at)}</td>
    <td class="t-num">—</td>
    <td class="t-num">—</td>
    <td data-status-cell>${STATUS_DOT[b.status] || STATUS_DOT.pending}</td>
    <td><div class="row-actions">${actions}</div></td>
  `;

  tr.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleBreederAction(tr, b, btn.dataset.action));
  });
  return tr;
}

async function handleBreederAction(tr, b, action) {
  if (action === 'approve' || action === 'reject') {
    const { ok, data } = await api(`/api/admin/breeders/${b.id}/${action}`, { method: 'POST' });
    if (!ok) return;
    b.status = data.status;
    tr.replaceWith(buildBreederRow(b));
    return;
  }
  if (action === 'suspend-breeder') {
    const { ok } = await api(`/api/admin/users/${b.id}/suspend`, { method: 'POST' });
    if (!ok) return;
    b.status = 'suspended';
    tr.replaceWith(buildBreederRow(b));
    return;
  }
  if (action === 'reinstate') {
    const { ok, data } = await api(`/api/admin/users/${b.id}/reinstate`, { method: 'POST' });
    if (!ok) return;
    b.status = data.status;
    tr.replaceWith(buildBreederRow(b));
    return;
  }
  if (action === 'delete') {
    if (!confirm(`${b.kennel || b.name} を完全に削除しますか？この操作は取り消せません。`)) return;
    const { ok } = await api(`/api/admin/users/${b.id}/delete`, { method: 'POST' });
    if (ok) tr.remove();
  }
}

function buildCustomerRow(c) {
  const tr = document.createElement('tr');
  const initial = escapeHtml((c.name || '?').charAt(0));
  const isSuspended = c.status === 'suspended';
  tr.dataset.userId = c.id;

  const actions = isSuspended
    ? `<button data-action="reinstate" class="approve" aria-label="復活">
        <svg class="icon" viewBox="0 0 24 24" width="15" height="15"><polyline points="20 6 9 17 4 12"/></svg>
       </button>
       <button data-action="delete" class="reject" aria-label="削除">
        <svg class="icon" viewBox="0 0 24 24" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
       </button>`
    : `<button data-action="suspend" class="reject" aria-label="利用停止">
        <svg class="icon" viewBox="0 0 24 24" width="15" height="15"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>
       </button>`;

  tr.innerHTML = `
    <td><div class="t-row-title">
      <div class="avatar avatar-sm mint" style="width:36px;height:36px;font-size:13px;">${initial}</div>
      <div>
        <strong>${escapeHtml(c.name || '')} 様</strong>
        <span>${escapeHtml(c.email || '')} · ID #${c.id}</span>
      </div>
    </div></td>
    <td>${formatRegisterDate(c.created_at)}</td>
    <td class="t-num">—</td>
    <td class="t-num">—</td>
    <td data-status-cell>${isSuspended ? STATUS_DOT.suspended : STATUS_DOT.active}</td>
    <td><div class="row-actions">${actions}</div></td>
  `;

  tr.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleCustomerAction(tr, c, btn.dataset.action));
  });
  return tr;
}

async function handleCustomerAction(tr, c, action) {
  if (action === 'suspend') {
    const { ok } = await api(`/api/admin/users/${c.id}/suspend`, { method: 'POST' });
    if (!ok) return;
    c.status = 'suspended';
    tr.replaceWith(buildCustomerRow(c));
    return;
  }
  if (action === 'reinstate') {
    const { ok } = await api(`/api/admin/users/${c.id}/reinstate`, { method: 'POST' });
    if (!ok) return;
    c.status = 'active';
    tr.replaceWith(buildCustomerRow(c));
    return;
  }
  if (action === 'delete') {
    if (!confirm(`${c.name || 'このユーザー'} を完全に削除しますか？この操作は取り消せません。`)) return;
    const { ok } = await api(`/api/admin/users/${c.id}/delete`, { method: 'POST' });
    if (ok) tr.remove();
  }
}
