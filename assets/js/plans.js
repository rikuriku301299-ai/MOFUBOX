import { api } from './api.js';
import { escapeHtml } from './utils.js';

function yen(n) { return '¥' + Number(n || 0).toLocaleString('ja-JP'); }

// Breeder: subscription plan cards + per-reel boost purchases (view-plan).
export function initBreederPlans() {
  const cards = document.querySelector('[data-plan-cards]');
  if (!cards) return;
  const planResult = document.querySelector('[data-plan-result]');
  const currentLabel = document.querySelector('[data-plan-current]');
  const boostList = document.querySelector('[data-boost-list]');
  const boostDesc = document.querySelector('[data-boost-desc]');
  const boostResult = document.querySelector('[data-boost-result]');
  let catalog = null;

  async function loadPlans() {
    const { ok, data } = await api('/api/plans');
    if (!ok) return;
    catalog = data;
    const current = data.currentPlan || 'free';
    const names = { free: 'フリー', standard: 'スタンダード', pro: 'プロ' };
    if (currentLabel) currentLabel.textContent = `現在のプラン：${names[current] || current}`;

    cards.innerHTML = data.plans.map((p) => {
      const active = p.id === current;
      const ratePct = +(p.rate * 100).toFixed(1);
      return `
        <div style="border:1.5px solid ${active ? 'var(--mint)' : 'var(--line)'};border-radius:var(--radius-m);padding:20px;display:flex;flex-direction:column;gap:10px;${p.id === 'pro' ? 'background:var(--cream);' : ''}">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <strong style="font-size:15px;">${escapeHtml(p.name)}</strong>
            ${active ? '<span class="status-dot ok">利用中</span>' : ''}
          </div>
          <div style="font-size:22px;font-weight:900;">${p.priceYen ? `${yen(p.priceYen)}<span style="font-size:12px;font-weight:700;color:var(--ink-soft);"> /月</span>` : '¥0'}</div>
          <div style="font-size:12.5px;color:var(--ink-soft);">成約手数料 ${ratePct}%</div>
          <ul style="margin:0;padding-left:18px;font-size:12.5px;color:var(--ink-soft);display:flex;flex-direction:column;gap:4px;">
            ${p.perks.map((perk) => `<li>${escapeHtml(perk)}</li>`).join('')}
          </ul>
          ${active
            ? '<button type="button" class="btn btn-outline btn-sm" disabled style="margin-top:auto;">現在のプラン</button>'
            : `<button type="button" class="btn ${p.id === 'free' ? 'btn-outline' : 'btn-mint'} btn-sm" data-plan-subscribe="${p.id}" style="margin-top:auto;">${p.id === 'free' ? 'フリーに戻す' : 'このプランにする'}</button>`}
        </div>`;
    }).join('');

    cards.querySelectorAll('[data-plan-subscribe]').forEach((btn) => {
      btn.addEventListener('click', () => subscribe(btn.dataset.planSubscribe, btn));
    });
  }

  async function subscribe(planId, btn) {
    btn.disabled = true;
    planResult.style.display = 'block';
    planResult.textContent = '処理しています…';
    const { ok, data } = await api('/api/plans/subscribe', { method: 'POST', body: { plan: planId } });
    btn.disabled = false;
    if (!ok) { planResult.textContent = data.message || 'プランを変更できませんでした。'; return; }
    if (data.url) { location.href = data.url; return; } // Stripe Checkout
    planResult.textContent = data.message || 'プランを変更しました。';
    loadPlans();
  }

  async function loadBoosts() {
    if (!boostList) return;
    const [{ data: meData }, { ok, data }] = await Promise.all([api('/api/auth/me'), api('/api/reels')]);
    const me = meData && meData.user;
    if (!ok || !me) { boostList.innerHTML = '<div style="color:var(--ink-faint);font-size:13px;">ログインすると、投稿済みリールをブーストできます。</div>'; return; }
    if (catalog && boostDesc) {
      boostDesc.textContent = `気になるリールを${catalog.boost.days}日間、フィードの最上位に表示します（1回 ${yen(catalog.boost.priceYen)}）。`;
    }
    const mine = data.reels.filter((r) => r.breederId === me.id);
    if (!mine.length) {
      boostList.innerHTML = '<div style="color:var(--ink-faint);font-size:13px;">まだリールがありません。「リール管理」から投稿すると、ここでブーストできます。</div>';
      return;
    }
    boostList.innerHTML = mine.map((r) => `
      <div style="display:flex;align-items:center;gap:12px;border:1px solid var(--line);border-radius:var(--radius-m);padding:12px 16px;">
        <span style="font-size:22px;">${r.posterEmoji || '🐱'}</span>
        <div style="flex:1;min-width:0;">
          <strong style="font-size:13.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(r.caption || '（無題）')}</strong>
          <span style="font-size:12px;color:var(--ink-faint);">いいね ${r.likeCount}</span>
        </div>
        ${r.boosted
          ? '<span class="status-dot ok">ブースト中</span>'
          : `<button type="button" class="btn btn-coral btn-sm" data-boost-reel="${r.id}">ブーストする${catalog ? ' ' + yen(catalog.boost.priceYen) : ''}</button>`}
      </div>`).join('');

    boostList.querySelectorAll('[data-boost-reel]').forEach((btn) => {
      btn.addEventListener('click', () => boost(Number(btn.dataset.boostReel), btn));
    });
  }

  async function boost(reelId, btn) {
    btn.disabled = true;
    boostResult.style.display = 'block';
    boostResult.textContent = '処理しています…';
    const { ok, data } = await api(`/api/reels/${reelId}/boost`, { method: 'POST' });
    btn.disabled = false;
    if (!ok) { boostResult.textContent = data.message || 'ブーストできませんでした。'; return; }
    if (data.url) { location.href = data.url; return; } // Stripe Checkout
    boostResult.textContent = data.message || 'ブーストを開始しました。';
    loadBoosts();
  }

  async function refresh() { await loadPlans(); await loadBoosts(); }
  refresh();
  document.addEventListener('gate:unlocked', refresh);
}
