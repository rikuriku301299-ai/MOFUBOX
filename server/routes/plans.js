// Monetisation suite: breeder subscription plans (recurring revenue) and
// paid reel boosts (one-off featured placement). Both follow the same
// graceful-degradation pattern as payments.js — fully wired to Stripe when
// keys exist, recorded locally (and activated immediately) when they don't,
// so the revenue model can be demoed and tallied before Stripe goes live.
const { db } = require('../db');
const { currentUser } = require('../auth');
const { notifyAdmins } = require('../notifications');
const { stripeConfigured, stripeRequest, RATE_BY_PLAN } = require('./payments');

// Plan catalog. priceYen is the monthly subscription fee; rate is the
// commission taken on each deal (lower commission is the upgrade incentive,
// alongside feed priority). Order matters: index = feed priority rank.
const pct = (rate) => +(rate * 100).toFixed(1);
const PLANS = {
  free: {
    id: 'free', name: 'フリー', priceYen: 0, rate: RATE_BY_PLAN.free,
    perks: ['リール投稿・メッセージ無制限', `成約手数料 ${pct(RATE_BY_PLAN.free)}%`],
  },
  standard: {
    id: 'standard', name: 'スタンダード', priceYen: 3980, rate: RATE_BY_PLAN.standard,
    perks: [`成約手数料 ${pct(RATE_BY_PLAN.standard)}% に割引`, 'フィードで優先表示', 'スタンダードバッジ'],
  },
  pro: {
    id: 'pro', name: 'プロ', priceYen: 9800, rate: RATE_BY_PLAN.pro,
    perks: [`成約手数料 ${pct(RATE_BY_PLAN.pro)}% に割引`, 'フィード最優先表示', 'プロバッジ', '毎週の掲載パフォーマンスレポート'],
  },
};

const BOOST_PRICE_YEN = 1480;
const BOOST_DAYS = 7;

// Stored in SQLite's datetime('now') format ("YYYY-MM-DD HH:MM:SS", UTC) so
// boost_until compares correctly against datetime('now') in SQL.
function sqliteDatetime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function boostUntilFromNow() {
  return sqliteDatetime(new Date(Date.now() + BOOST_DAYS * 24 * 60 * 60 * 1000));
}

// GET /api/plans — catalog + the caller's current plan.
function list(req, res) {
  const user = currentUser(req);
  res.json(200, {
    plans: Object.values(PLANS),
    boost: { priceYen: BOOST_PRICE_YEN, days: BOOST_DAYS },
    currentPlan: user ? (user.plan || 'free') : null,
    stripeLive: stripeConfigured(),
  });
}

// POST /api/plans/subscribe { plan } — start (or cancel, plan='free') a
// monthly subscription. With Stripe live this creates a subscription-mode
// Checkout session; the webhook activates the plan on payment. Without
// Stripe the plan activates immediately and the fee is recorded so the
// revenue dashboard still tallies MRR.
async function subscribe(req, res, body) {
  const user = currentUser(req);
  if (!user || user.role !== 'breeder') return res.json(403, { error: 'breeder_only' });

  const planId = String((body && body.plan) || '');
  const plan = PLANS[planId];
  if (!plan) return res.json(400, { error: 'unknown_plan' });
  if ((user.plan || 'free') === planId) return res.json(400, { error: 'already_on_plan', message: 'すでにこのプランをご利用中です。' });

  // Downgrade to free: cancel the Stripe subscription if one exists.
  if (planId === 'free') {
    if (stripeConfigured() && user.stripe_subscription_id) {
      try {
        await stripeRequest(`subscriptions/${user.stripe_subscription_id}`, { 'cancel_at_period_end': 'true' });
      } catch { /* subscription may already be gone — downgrade locally regardless */ }
    }
    db.prepare("UPDATE users SET plan = 'free', stripe_subscription_id = NULL WHERE id = ?").run(user.id);
    notifyAdmins('revenue', 'プラン解約', `${user.kennel || user.name} がフリープランに変更しました`, '/admin.html#view-revenue');
    return res.json(200, { plan: 'free' });
  }

  const description = `${plan.name}プラン（月額 ¥${plan.priceYen.toLocaleString()}）`;

  if (stripeConfigured()) {
    try {
      const origin = req.headers.origin || `http://${req.headers.host}`;
      const session = await stripeRequest('checkout/sessions', {
        mode: 'subscription',
        'payment_method_types[0]': 'card',
        'line_items[0][price_data][currency]': 'jpy',
        'line_items[0][price_data][unit_amount]': String(plan.priceYen),
        'line_items[0][price_data][recurring][interval]': 'month',
        'line_items[0][price_data][product_data][name]': `MOFUBOX ${plan.name}プラン`,
        'line_items[0][quantity]': '1',
        'metadata[kind]': 'subscription',
        'metadata[plan]': planId,
        'metadata[user_id]': String(user.id),
        success_url: `${origin}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/breeder.html`,
      });
      db.prepare(`INSERT INTO orders (user_id, stripe_session_id, description, amount, currency, status, kind)
        VALUES (?, ?, ?, ?, 'jpy', 'pending', 'subscription')`).run(user.id, session.id, description, plan.priceYen);
      return res.json(200, { plan: planId, live: true, url: session.url });
    } catch (e) {
      return res.json(502, { error: 'stripe_request_failed', message: e.message });
    }
  }

  db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(planId, user.id);
  db.prepare(`INSERT INTO orders (user_id, description, amount, currency, status, kind)
    VALUES (?, ?, ?, 'jpy', 'recorded', 'subscription')`).run(user.id, description, plan.priceYen);
  notifyAdmins('revenue', 'プラン加入',
    `${user.kennel || user.name} ／ ${description}（Stripe未接続のため記録のみ）`, '/admin.html#view-revenue');
  res.json(200, { plan: planId, live: false, message: 'プランを有効化しました。Stripe接続後は月額料金が自動で請求されます。' });
}

// POST /api/reels/:id/boost — feature one of your reels at the top of the
// feed for BOOST_DAYS days (one-off payment).
async function boostReel(req, res, reelId) {
  const user = currentUser(req);
  if (!user || user.role !== 'breeder') return res.json(403, { error: 'breeder_only' });

  const reel = db.prepare('SELECT id, breeder_id, caption, boost_until FROM reels WHERE id = ?').get(reelId);
  if (!reel) return res.json(404, { error: 'not_found' });
  if (reel.breeder_id !== user.id) return res.json(403, { error: 'not_owner' });
  if (reel.boost_until && reel.boost_until > sqliteDatetime(new Date())) {
    return res.json(400, { error: 'already_boosted', message: 'このリールはすでにブースト中です。', boostUntil: reel.boost_until });
  }

  const description = `リールブースト（「${reel.caption || '投稿'}」を${BOOST_DAYS}日間 優先表示）`;

  if (stripeConfigured()) {
    try {
      const origin = req.headers.origin || `http://${req.headers.host}`;
      const session = await stripeRequest('checkout/sessions', {
        mode: 'payment',
        'payment_method_types[0]': 'card',
        'line_items[0][price_data][currency]': 'jpy',
        'line_items[0][price_data][unit_amount]': String(BOOST_PRICE_YEN),
        'line_items[0][price_data][product_data][name]': `リールブースト（${BOOST_DAYS}日間）`,
        'line_items[0][quantity]': '1',
        'metadata[kind]': 'boost',
        'metadata[reel_id]': String(reel.id),
        success_url: `${origin}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/breeder.html`,
      });
      db.prepare(`INSERT INTO orders (user_id, stripe_session_id, description, amount, currency, status, kind)
        VALUES (?, ?, ?, ?, 'jpy', 'pending', 'boost')`).run(user.id, session.id, description, BOOST_PRICE_YEN);
      return res.json(200, { live: true, url: session.url, priceYen: BOOST_PRICE_YEN });
    } catch (e) {
      return res.json(502, { error: 'stripe_request_failed', message: e.message });
    }
  }

  const until = boostUntilFromNow();
  db.prepare('UPDATE reels SET boost_until = ? WHERE id = ?').run(until, reel.id);
  db.prepare(`INSERT INTO orders (user_id, description, amount, currency, status, kind)
    VALUES (?, ?, ?, 'jpy', 'recorded', 'boost')`).run(user.id, description, BOOST_PRICE_YEN);
  notifyAdmins('revenue', 'リールブースト購入',
    `${user.kennel || user.name} ／ ¥${BOOST_PRICE_YEN.toLocaleString()}（Stripe未接続のため記録のみ）`, '/admin.html#view-revenue');
  res.json(200, { live: false, boostUntil: until, priceYen: BOOST_PRICE_YEN,
    message: `ブーストを有効化しました（${BOOST_DAYS}日間）。Stripe接続後は決済完了時に有効化されます。` });
}

module.exports = { list, subscribe, boostReel, PLANS, BOOST_DAYS, boostUntilFromNow };
