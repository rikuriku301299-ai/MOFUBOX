import { api } from './api.js';

function yen(n) { return '¥' + Number(n || 0).toLocaleString('ja-JP'); }

// Breeder: Stripe Connect onboarding + recording a deal that splits the payment
// at charge time (7% auto-deducted to the platform, rest to the breeder).
export function initBreederDeals() {
  const form = document.querySelector('[data-deal-form]');
  if (!form) return;
  const result = document.querySelector('[data-deal-result]');
  const connectCard = document.querySelector('[data-connect-card]');
  const connectMsg = document.querySelector('[data-connect-msg]');
  const connectBtn = document.querySelector('[data-connect-btn]');

  async function refreshConnect() {
    if (!connectCard) return;
    const { ok, data } = await api('/api/connect/status');
    if (!ok) return;
    if (!data.configured) { connectCard.style.display = 'none'; return; } // Stripe not live yet
    connectCard.style.display = 'block';
    if (data.ready) {
      connectMsg.textContent = '入金設定は完了しています。成約時、お客様のお支払いから手数料（7%）が自動で差し引かれ、残りがあなたの口座に振り込まれます。';
      connectBtn.textContent = '入金設定を確認・変更する';
    } else if (data.connected) {
      connectMsg.textContent = '入金設定の手続きが途中です。続きを完了してください。';
      connectBtn.textContent = '入金設定を続ける';
    } else {
      connectMsg.textContent = 'お客様のお支払いを受け取るには、Stripeとの連携が必要です。連携すると、成約時にお客様が支払った金額から手数料（7%）が自動で差し引かれ、残りがあなたの口座に振り込まれます。';
      connectBtn.textContent = 'Stripeと連携して入金を受け取る';
    }
  }

  if (connectBtn) {
    connectBtn.addEventListener('click', async () => {
      connectBtn.disabled = true;
      const { ok, data } = await api('/api/connect/start', { method: 'POST' });
      connectBtn.disabled = false;
      if (ok && data.url) location.href = data.url;
      else alert(data.message || '連携を開始できませんでした。');
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const priceYen = Number(fd.get('priceYen'));
    const catName = fd.get('catName');
    result.style.display = 'block';
    result.textContent = '処理しています…';
    const { ok, status, data } = await api('/api/deals', { method: 'POST', body: { priceYen, catName } });
    if (!ok) {
      if (status === 409 && data.needsConnect) {
        result.innerHTML = `<strong>入金設定が未完了です。</strong><br><span style="font-size:12.5px;color:var(--ink-soft);">${data.message}</span>`;
        refreshConnect();
      } else {
        result.textContent = data.message || '記録に失敗しました。';
      }
      return;
    }
    if (data.split && data.url) {
      result.innerHTML = `成約を登録しました（成約額 ${yen(data.price)}）。<br>
        下のリンクをお客様にチャットで送ってください。お支払いいただくと、手数料 <strong>${yen(data.commission)}</strong> が自動で差し引かれ、残りがあなたに振り込まれます。<br>
        <input type="text" readonly value="${data.url}" style="width:100%;margin-top:10px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;font-size:12.5px;" onclick="this.select()">
        <a href="${data.url}" target="_blank" class="btn btn-mint btn-sm" style="margin-top:10px;">決済ページを開く →</a>`;
    } else if (data.method === 'bank_transfer') {
      const bank = data.bankInfo
        ? `<div style="margin-top:10px;padding:12px 14px;background:var(--rose-wash,#fbf1f3);border-radius:10px;font-size:12.5px;line-height:1.7;white-space:pre-wrap;">${data.bankInfo}</div>`
        : `<span style="font-size:12.5px;color:var(--ink-soft);">お振込先はMOFUBOX運営よりチャットでご案内します。</span>`;
      result.innerHTML = `成約を記録しました（成約額 ${yen(data.price)}）。<br>
        手数料 <strong>${yen(data.commission)}</strong>（7%）を、下記の口座にお振込みください。<br>${bank}`;
    } else {
      result.innerHTML = `成約を記録しました。手数料 <strong>${yen(data.commission)}</strong>（成約額 ${yen(data.price)} の7%）。<br>
        <span style="font-size:12.5px;color:var(--ink-soft);">Stripe接続後は、お客様のお支払いから自動で天引きされます。</span>`;
    }
    form.reset();
  });

  refreshConnect();
  document.addEventListener('gate:unlocked', refreshConnect);
}

// Admin: replace the placeholder commission figure with the live tally, and
// list the commissions awaiting a bank transfer with a "入金済みにする" button.
export function initAdminRevenue() {
  const el = document.querySelector('[data-rev-commission]');
  if (!el) return;
  const list = document.querySelector('[data-rev-unpaid]');

  function fmtDate(at) {
    if (!at) return '';
    const d = new Date(/[TZ]/.test(at) ? at : at.replace(' ', 'T') + 'Z');
    return isNaN(d) ? '' : d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
  }

  async function load() {
    const { ok, data } = await api('/api/revenue');
    if (!ok) return;
    const total = data.paidTotal + data.pendingTotal;
    el.textContent = yen(total);
    const stripe = document.querySelector('[data-rev-stripe]');
    if (stripe) {
      stripe.textContent = data.stripeLive ? '（自動入金 稼働中）' : '（振込で受け取り）';
      stripe.style.color = data.stripeLive ? 'var(--mint-darker)' : 'var(--ink-faint)';
    }
    if (list) renderUnpaid(data.unpaid || []);
  }

  function renderUnpaid(unpaid) {
    if (!unpaid.length) {
      list.innerHTML = '<p style="font-size:13px;color:var(--ink-faint);margin:0;">入金待ちの手数料はありません。</p>';
      return;
    }
    list.innerHTML = unpaid.map(o => `
      <div class="rev-row" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);">
        <div style="min-width:0;">
          <div style="font-weight:600;font-size:14px;">${o.breeder}</div>
          <div style="font-size:12px;color:var(--ink-soft);">${o.description || ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
          <span style="font-weight:700;">${yen(o.amount)}</span>
          <button class="btn btn-mint btn-sm" data-mark-paid="${o.id}">入金済みにする</button>
        </div>
      </div>`).join('');
    list.querySelectorAll('[data-mark-paid]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const id = btn.getAttribute('data-mark-paid');
        const { ok } = await api(`/api/revenue/${id}/paid`, { method: 'POST' });
        if (ok) load();
        else btn.disabled = false;
      });
    });
  }

  load();
  document.addEventListener('gate:unlocked', load);
}
