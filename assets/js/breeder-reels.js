import { api } from './api.js';
import { escapeHtml } from './utils.js';

const STATUS_OPTIONS = [
  { value: 'available', label: '受付中' },
  { value: 'reserved', label: '商談中' },
  { value: 'adopted', label: 'お迎え決定' },
];

// Breeder dashboard: list the breeder's own reels with a status selector so they
// can mark each cat 受付中 / 商談中 / お迎え決定. The status shows to customers.
export function initBreederReels() {
  const wrap = document.querySelector('[data-breeder-reels]');
  if (!wrap) return;
  let loaded = false;

  async function load() {
    if (loaded) return;
    const { data: meData } = await api('/api/auth/me');
    if (!meData.user || meData.user.role !== 'breeder') return;
    loaded = true;
    render();
  }

  async function render() {
    const { ok, data } = await api('/api/reels/mine');
    if (!ok) { wrap.innerHTML = '<p style="font-size:13px;color:var(--coral-dark);margin:0;">読み込めませんでした。</p>'; return; }
    if (!data.reels.length) {
      wrap.innerHTML = '<p style="font-size:13px;color:var(--ink-faint);margin:0;">まだ投稿がありません。上のフォームから最初の子を投稿しましょう。</p>';
      return;
    }
    wrap.innerHTML = data.reels.map(r => {
      const opts = STATUS_OPTIONS.map(o => `<option value="${o.value}"${o.value === r.availStatus ? ' selected' : ''}>${o.label}</option>`).join('');
      return `
        <div class="brl-row" style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);">
          <div class="t-thumb illus-coral" style="flex-shrink:0;">${r.posterEmoji || '🐱'}</div>
          <div style="min-width:0;flex:1;">
            <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(r.caption || '（無題）')}</div>
            <div style="font-size:12px;color:var(--ink-soft);">❤ ${r.likeCount}</div>
          </div>
          <select data-brl-status="${r.id}" class="brl-select" style="flex-shrink:0;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;background:#fff;">${opts}</select>
          <span data-brl-saved="${r.id}" style="font-size:12px;color:var(--mint-darker,#1f8a6d);min-width:44px;"></span>
        </div>`;
    }).join('');

    wrap.querySelectorAll('[data-brl-status]').forEach(sel => {
      sel.addEventListener('change', async () => {
        const id = sel.getAttribute('data-brl-status');
        const saved = wrap.querySelector(`[data-brl-saved="${id}"]`);
        sel.disabled = true;
        const { ok } = await api(`/api/reels/${id}/status`, { method: 'POST', body: { status: sel.value } });
        sel.disabled = false;
        if (saved) { saved.textContent = ok ? '保存 ✓' : '失敗'; setTimeout(() => { saved.textContent = ''; }, 2000); }
      });
    });
  }

  load();
  document.addEventListener('gate:unlocked', load);
}
