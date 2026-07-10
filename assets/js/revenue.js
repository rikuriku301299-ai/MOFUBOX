import { api } from './api.js';

function yen(n) { return '¥' + Number(n || 0).toLocaleString('ja-JP'); }

// Breeder: record a completed adoption → auto-computes the 7% commission and
// (once Stripe is live) returns a payment link.
export function initBreederDeals() {
  const form = document.querySelector('[data-deal-form]');
  if (!form) return;
  const result = document.querySelector('[data-deal-result]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const priceYen = Number(fd.get('priceYen'));
    const catName = fd.get('catName');
    result.style.display = 'block';
    result.textContent = '記録しています…';
    const { ok, data } = await api('/api/deals', { method: 'POST', body: { priceYen, catName } });
    if (!ok) { result.textContent = data.message || '記録に失敗しました。'; return; }
    if (data.live && data.url) {
      result.innerHTML = `成約を記録しました。手数料 <strong>${yen(data.commission)}</strong>（成約額 ${yen(data.price)} の7%）。
        <a href="${data.url}" class="btn btn-mint btn-sm" style="margin-top:10px;">手数料を支払う →</a>`;
    } else {
      result.innerHTML = `成約を記録しました。手数料 <strong>${yen(data.commission)}</strong>（成約額 ${yen(data.price)} の7%）。<br>
        <span style="font-size:12.5px;color:var(--ink-soft);">Stripe接続後は、ここに自動で決済リンクが表示されます。</span>`;
    }
    form.reset();
  });
}

// Admin: replace the placeholder commission figure with the live tally.
export function initAdminRevenue() {
  const el = document.querySelector('[data-rev-commission]');
  if (!el) return;

  async function load() {
    const { ok, data } = await api('/api/revenue');
    if (!ok) return;
    const total = data.paidTotal + data.pendingTotal;
    el.textContent = yen(total);
    const stripe = document.querySelector('[data-rev-stripe]');
    if (stripe) {
      stripe.textContent = data.stripeLive ? '（自動入金 稼働中）' : '（Stripe未接続）';
      stripe.style.color = data.stripeLive ? 'var(--mint-darker)' : 'var(--ink-faint)';
    }
  }

  load();
  document.addEventListener('gate:unlocked', load);
}
