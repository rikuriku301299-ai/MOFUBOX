// Monetization UI: breeder-side plan/boost/deal management (breeder.html
// #view-plan) and the admin revenue dashboard (admin.html #view-revenue).
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

  const cardsEl = root.querySelector('[data-plan-cards]');
  const planStatus = root.querySelector('[data-plan-status]');
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

  const setText = (attr, text) => {
    const el = root.querySelector(`[${attr}]`);
    if (el) el.textContent = text;
  };

  function renderCurrent(me) {
    const plan = me.plan;
    const pill = root.querySelector('[data-plan-current-pill]');
    if (pill) {
      pill.textContent = `${plan.name}プラン`;
      pill.className = `pill ${plan.id === 'free' ? 'pill-gray' : 'pill-mint'}`;
    }
    setText('data-plan-current-name', `${plan.name}プラン`);
    setText('data-plan-current-price', plan.priceYen ? `${yen(plan.priceYen)} / 月` : '無料');
    const quota = plan.reelLimit == null ? '無制限' : `${me.reelCount} / ${plan.reelLimit}本`;
    setText('data-plan-current-quota', quota);
    const renewal = me.subscription && me.subscription.current_period_end
      ? formatRegisterDate(me.subscription.current_period_end.replace('T', ' ').slice(0, 19))
      : '—';
    setText('data-plan-current-renewal', renewal);
  }

  function renderPlanCards(me) {
    if (!cardsEl || !catalog) return;
    const currentId = me.plan.id;
    cardsEl.innerHTML = catalog.plans.map((p) => {
      const isCurrent = p.id === currentId;
      const btn = isCurrent
        ? '<button type="button" class="btn btn-outline" disabled>ご利用中</button>'
        : `<button type="button" class="btn ${p.id === 'pro' ? 'btn-coral' : 'btn-mint'}" data-plan-subscribe="${p.id}">${p.priceYen ? 'このプランにする' : 'フリーに戻す'}</button>`;
      return `
        <div class="plan-card${isCurrent ? ' current' : ''}${p.id === 'pro' ? ' featured' : ''}">
          ${p.id === 'pro' ? '<span class="pill pill-coral plan-card__badge">人気No.1</span>' : ''}
          <div class="plan-card__name">${escapeHtml(p.name)}</div>
          <div class="plan-card__price">${p.priceYen ? `${yen(p.priceYen)}<small> / 月</small>` : '¥0'}</div>
          <ul class="plan-card__features">
            ${p.features.map((f) => `<li>✓ ${escapeHtml(f)}</li>`).join('')}
          </ul>
          ${btn}
        </div>`;
    }).join('');

    cardsEl.querySelectorAll('[data-plan-subscribe]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        showStatus(planStatus, '処理中…', null);
        const { ok, data } = await api('/api/billing/subscribe', { method: 'POST', body: { plan: btn.dataset.planSubscribe } });
        if (ok && data.url) { window.location.href = data.url; return; }
        if (ok) {
          showStatus(planStatus, data.message || 'プランを変更しました。', 'success');
          await refresh();
        } else {
          showStatus(planStatus, data.message || 'プラン変更に失敗しました。', 'error');
          btn.disabled = false;
        }
      });
    });
  }

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
    renderCurrent(data);
    renderPlanCards(data);
    renderBoosts(data);
    renderDeals(data);
  }

  (async () => {
    const [plansRes, meRes] = await Promise.all([api('/api/billing/plans'), api('/api/auth/me')]);
    if (plansRes.ok) catalog = plansRes.data;
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
  subscription: '<span class="pill pill-mint">サブスク</span>',
  boost: '<span class="pill pill-coral">ブースト</span>',
  deal_fee: '<span class="pill pill-gray">成約手数料</span>',
  one_time: '<span class="pill pill-gray">その他</span>',
};

export function initAdminRevenue() {
  const mrrEl = document.querySelector('[data-rev-mrr]');
  if (!mrrEl) return;

  api('/api/admin/revenue').then(({ ok, data }) => {
    if (!ok) return;

    const set = (attr, text) => {
      const el = document.querySelector(`[${attr}]`);
      if (el) el.textContent = text;
    };

    set('data-rev-mrr', yen(data.mrr));
    set('data-rev-month', yen(data.monthTotal));
    set('data-rev-24h', yen(data.last24h));
    const subCount = Object.values(data.subsByPlan || {}).reduce((a, b) => a + b, 0);
    set('data-rev-subs', `${subCount}件`);
    set('data-rev-kind-subscription', yen((data.byKind || {}).subscription || 0));
    set('data-rev-kind-boost', yen((data.byKind || {}).boost || 0));
    set('data-rev-kind-deal-fee', yen((data.byKind || {}).deal_fee || 0));
    set('data-rev-volume', yen(data.dealVolumeMonth || 0));

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
