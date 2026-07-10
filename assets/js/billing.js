// Monetization UI: breeder-side boost purchase & deal reporting (breeder.html
// #view-plan) and the admin revenue dashboard (admin.html #view-revenue).
// Site usage itself is free — there are no paid plans.
import { api } from './api.js';
import { escapeHtml, formatRegisterDate } from './utils.js';

const yen = (n) => '¥' + Math.round(Number(n) || 0).toLocaleString('ja-JP');

function showStatus(el, text, tone) {
  if (!el) return;
  el.textContent = text || '';
  el.style.display = text ? 'block' : 'none';
  el.style.color = tone === 'error' ? 'var(--coral-dark)' : tone === 'success' ? 'var(--mint-darker)' : 'var(--ink-soft)';
}

/* ============================== ブリーダー側 ============================== */

export function initBreederBilling() {
  const root = document.getElementById('view-plan');
  if (!root) return;

  const boostSelect = root.querySelector('[data-boost-select]');
  const boostSubmit = root.querySelector('[data-boost-submit]');
  const boostStatus = root.querySelector('[data-boost-status]');
  const boostActive = root.querySelector('[data-boost-active]');
  const boostPrice = root.querySelector('[data-boost-price]');
  const dealSubmit = root.querySelector('[data-deal-submit]');
  const dealStatus = root.querySelector('[data-deal-status]');
  const dealRows = root.querySelector('[data-deal-rows]');
  const dealFeeLabel = root.querySelector('[data-deal-fee-label]');

  let catalog = null;
  let myId = null;

  function renderBoosts(me) {
    if (boostPrice && catalog) boostPrice.textContent = `${yen(catalog.boost.priceYen)} / ${catalog.boost.days}日間`;
    if (!boostActive) return;
    if (!me.activeBoosts.length) {
      boostActive.innerHTML = '';
      return;
    }
    boostActive.innerHTML = me.activeBoosts.map((b) => `
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:8px 0;border-top:1px solid var(--line);">
        <span>🚀 ${escapeHtml(b.reel_caption || 'リール')}</span>
        <span class="status-dot ok">${formatRegisterDate(b.ends_at)}まで</span>
      </div>`).join('');
  }

  async function renderBoostSelect() {
    if (!boostSelect) return;
    const { ok, data } = await api('/api/reels');
    if (!ok) return;
    const mine = (data.reels || []).filter((r) => r.breederId === myId);
    if (!mine.length) {
      boostSelect.innerHTML = '<option value="">投稿済みのリールがありません</option>';
      return;
    }
    boostSelect.innerHTML = mine
      .map((r) => `<option value="${r.id}">${escapeHtml(r.caption || `リール #${r.id}`)}${r.boosted ? '（ブースト中）' : ''}</option>`)
      .join('');
  }

  function renderDeals(me) {
    if (dealFeeLabel && catalog) dealFeeLabel.textContent = `手数料 ${Math.round(catalog.dealFeeRate * 100)}%`;
    if (!dealRows) return;
    if (!me.deals.length) {
      dealRows.innerHTML = '<tr><td colspan="6" style="color:var(--ink-faint);">まだ成約報告はありません</td></tr>';
      return;
    }
    dealRows.innerHTML = me.deals.map((d) => `
      <tr>
        <td>${formatRegisterDate(d.created_at)}</td>
        <td>${escapeHtml(d.cat_name || '—')}</td>
        <td>${escapeHtml(d.buyer_name || '—')}</td>
        <td class="t-num">${yen(d.price)}</td>
        <td class="t-num">${yen(d.fee)}</td>
        <td>${d.fee_status === 'paid' ? '<span class="status-dot ok">手数料計上済み</span>' : '<span class="status-dot pending">手数料未払い</span>'}</td>
      </tr>`).join('');
  }

  async function refresh() {
    const { ok, data } = await api('/api/billing/me');
    if (!ok) return;
    renderBoosts(data);
    renderDeals(data);
  }

  (async () => {
    const [pricingRes, meRes] = await Promise.all([api('/api/billing/pricing'), api('/api/auth/me')]);
    if (pricingRes.ok) catalog = pricingRes.data;
    if (meRes.ok && meRes.data.user) myId = meRes.data.user.id;
    await refresh();
    await renderBoostSelect();
  })();

  if (boostSubmit) {
    boostSubmit.addEventListener('click', async () => {
      const reelId = boostSelect ? Number(boostSelect.value) : 0;
      if (!reelId) { showStatus(boostStatus, 'ブーストするリールを選択してください。', 'error'); return; }
      boostSubmit.disabled = true;
      showStatus(boostStatus, '処理中…', null);
      const { ok, data } = await api('/api/billing/boost', { method: 'POST', body: { reelId } });
      if (ok && data.url) { window.location.href = data.url; return; }
      showStatus(boostStatus, data.message || (ok ? 'ブーストを開始しました。' : 'ブーストに失敗しました。'), ok ? 'success' : 'error');
      boostSubmit.disabled = false;
      if (ok) { await refresh(); await renderBoostSelect(); }
    });
  }

  if (dealSubmit) {
    dealSubmit.addEventListener('click', async () => {
      const catName = (root.querySelector('[data-deal-cat]') || {}).value || '';
      const buyerName = (root.querySelector('[data-deal-buyer]') || {}).value || '';
      const priceInput = root.querySelector('[data-deal-price]');
      const price = priceInput ? Number(priceInput.value) : 0;
      if (!price || price < 1000) { showStatus(dealStatus, '成約金額は1,000円以上で入力してください。', 'error'); return; }
      dealSubmit.disabled = true;
      showStatus(dealStatus, '処理中…', null);
      const { ok, data } = await api('/api/billing/deals', { method: 'POST', body: { catName, buyerName, price } });
      if (ok && data.url) { window.location.href = data.url; return; }
      showStatus(dealStatus, data.message || (ok ? '成約を報告しました。' : '報告に失敗しました。'), ok ? 'success' : 'error');
      dealSubmit.disabled = false;
      if (ok) {
        if (priceInput) priceInput.value = '';
        await refresh();
      }
    });
  }
}

/* ============================== 管理者側 ============================== */

const KIND_LABEL = {
  boost: '<span class="pill pill-coral">ブースト</span>',
  deal_fee: '<span class="pill pill-mint">成約手数料</span>',
  one_time: '<span class="pill pill-gray">その他</span>',
};

export function initAdminRevenue() {
  const monthEl = document.querySelector('[data-rev-month]');
  if (!monthEl) return;

  api('/api/admin/revenue').then(({ ok, data }) => {
    if (!ok) return;

    const set = (attr, text) => {
      const el = document.querySelector(`[${attr}]`);
      if (el) el.textContent = text;
    };

    set('data-rev-month', yen(data.monthTotal));
    set('data-rev-24h', yen(data.last24h));
    set('data-rev-kind-boost', yen((data.byKind || {}).boost || 0));
    set('data-rev-kind-deal-fee', yen((data.byKind || {}).deal_fee || 0));
    set('data-rev-volume', yen(data.dealVolumeMonth || 0));
    set('data-rev-deal-count', `${data.dealCountMonth || 0}件`);

    const chart = document.querySelector('[data-rev-chart]');
    if (chart && data.series) {
      const max = Math.max(1, ...data.series.map((s) => s.total));
      chart.innerHTML = data.series.map((s, i) => `
        <div class="bar-chart__col">
          <div class="bar-chart__bar${i === data.series.length - 1 ? ' coral' : ''}" style="height:${Math.max(3, Math.round((s.total / max) * 100))}%;" title="${yen(s.total)}"></div>
          <span>${escapeHtml(s.label)}</span>
        </div>`).join('');
    }

    const ranking = document.querySelector('[data-rev-ranking]');
    if (ranking) {
      ranking.innerHTML = data.ranking && data.ranking.length
        ? data.ranking.map((r, i) => `
            <tr>
              <td class="t-num">${i + 1}</td>
              <td><strong>${escapeHtml(r.kennel || r.name || '—')}</strong></td>
              <td class="t-num">${r.deal_count}</td>
              <td class="t-num">${yen(r.volume)}</td>
              <td class="t-num">${yen(r.fees)}</td>
            </tr>`).join('')
        : '<tr><td colspan="5" style="color:var(--ink-faint);">まだ成約報告がありません</td></tr>';
    }

    const orders = document.querySelector('[data-rev-orders]');
    if (orders) {
      orders.innerHTML = data.recentOrders && data.recentOrders.length
        ? data.recentOrders.map((o) => `
            <tr>
              <td>${formatRegisterDate(o.created_at)}</td>
              <td>${KIND_LABEL[o.kind] || KIND_LABEL.one_time}</td>
              <td>${escapeHtml(o.description || '—')}</td>
              <td>${escapeHtml(o.user_kennel || o.user_name || '—')}</td>
              <td class="t-num">${yen(o.amount)}</td>
            </tr>`).join('')
        : '<tr><td colspan="5" style="color:var(--ink-faint);">まだ入金がありません</td></tr>';
    }
  });
}
