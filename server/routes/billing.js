// Monetization API routes: plan subscriptions, reel boosts, deal reporting.
// With Stripe configured, purchases go through Checkout and are fulfilled by
// the webhook; without it, everything activates instantly in demo mode so the
// full revenue loop can be exercised locally.
const { db } = require('../db');
const { currentUser } = require('../auth');
const billing = require('../billing');
const { stripeConfigured, stripeRequest } = require('./payments');

function requireBreeder(req, res) {
  const user = currentUser(req);
  if (!user || user.role !== 'breeder') {
    res.json(403, { error: 'breeder_only' });
    return null;
  }
  return user;
}

function plans(req, res) {
  res.json(200, {
    plans: Object.values(billing.PLANS),
    boost: billing.BOOST,
    dealFeeRate: billing.DEAL_FEE_RATE,
    stripeConfigured: stripeConfigured(),
  });
}

function me(req, res) {
  const user = requireBreeder(req, res);
  if (!user) return;

  const sub = billing.getSubscription(user.id);
  const plan = billing.planOf(user.id);
  const reelCount = db.prepare('SELECT COUNT(*) AS c FROM reels WHERE breeder_id = ?').get(user.id).c;
  const boosts = db.prepare(`
    SELECT boosts.*, reels.caption AS reel_caption
    FROM boosts JOIN reels ON reels.id = boosts.reel_id
    WHERE boosts.breeder_id = ? AND boosts.status = 'active' AND boosts.ends_at > datetime('now')
    ORDER BY boosts.ends_at DESC
  `).all(user.id);
  const deals = db.prepare('SELECT * FROM deals WHERE breeder_id = ? ORDER BY created_at DESC LIMIT 20').all(user.id);

  res.json(200, {
    plan,
    subscription: sub,
    reelCount,
    activeBoosts: boosts,
    deals,
  });
}

async function checkoutFor(req, user, { kind, description, amountYen, meta, mode }) {
  const origin = req.headers.origin || `http://${req.headers.host}`;
  const params = {
    mode: mode || 'payment',
    'payment_method_types[0]': 'card',
    'line_items[0][price_data][currency]': 'jpy',
    'line_items[0][price_data][unit_amount]': String(amountYen),
    'line_items[0][price_data][product_data][name]': description,
    'line_items[0][quantity]': '1',
    success_url: `${origin}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/payment-cancelled.html`,
  };
  if (mode === 'subscription') {
    params['line_items[0][price_data][recurring][interval]'] = 'month';
  }
  const session = await stripeRequest('checkout/sessions', params);

  db.prepare(`
    INSERT INTO orders (user_id, stripe_session_id, kind, description, amount, currency, status, meta)
    VALUES (?, ?, ?, ?, ?, 'jpy', 'pending', ?)
  `).run(user.id, session.id, kind, description, amountYen, meta ? JSON.stringify(meta) : null);

  return session;
}

async function subscribe(req, res, body) {
  const user = requireBreeder(req, res);
  if (!user) return;

  const planId = String(body.plan || '');
  const plan = billing.PLANS[planId];
  if (!plan) return res.json(400, { error: 'unknown_plan' });

  const current = billing.planOf(user.id);
  if (current.id === planId) return res.json(400, { error: 'already_on_plan', message: 'すでにこのプランをご利用中です。' });

  // Downgrading to free is a cancellation (including at Stripe's side).
  if (plan.priceYen === 0) return cancel(req, res);

  if (!stripeConfigured()) {
    const sub = billing.activatePlan(user.id, planId, null);
    return res.json(200, {
      mode: 'demo',
      subscription: sub,
      plan: billing.planOf(user.id),
      message: 'デモモード：Stripe未設定のため即時有効化しました。月額は自動更新で計上されます。',
    });
  }

  try {
    const session = await checkoutFor(req, user, {
      kind: 'subscription',
      description: `MOFUBOX ${plan.name}プラン（月額）`,
      amountYen: plan.priceYen,
      meta: { plan: planId },
      mode: 'subscription',
    });
    res.json(200, { mode: 'stripe', url: session.url, sessionId: session.id });
  } catch (e) {
    res.json(502, { error: 'stripe_request_failed', message: e.message });
  }
}

async function cancel(req, res) {
  const user = requireBreeder(req, res);
  if (!user) return;

  const sub = billing.getSubscription(user.id);
  if (sub && sub.stripe_subscription_id && stripeConfigured()) {
    try {
      await stripeRequest(`subscriptions/${sub.stripe_subscription_id}`, { cancel_at_period_end: 'true' });
    } catch (e) {
      return res.json(502, { error: 'stripe_request_failed', message: e.message });
    }
  }
  const updated = billing.cancelPlan(user.id);
  res.json(200, { subscription: updated, plan: billing.planOf(user.id) });
}

async function boost(req, res, body) {
  const user = requireBreeder(req, res);
  if (!user) return;

  const reelId = Number(body.reelId);
  const reel = db.prepare('SELECT * FROM reels WHERE id = ?').get(reelId);
  if (!reel) return res.json(404, { error: 'not_found' });
  if (reel.breeder_id !== user.id) return res.json(403, { error: 'not_owner' });

  const already = db.prepare(`
    SELECT 1 FROM boosts WHERE reel_id = ? AND status = 'active' AND ends_at > datetime('now')
  `).get(reelId);
  if (already) return res.json(400, { error: 'already_boosted', message: 'このリールはすでにブースト中です。' });

  if (!stripeConfigured()) {
    const boostId = billing.createBoost(user.id, reelId, 'pending');
    const activated = billing.activateBoost(boostId);
    return res.json(200, { mode: 'demo', boost: activated, message: 'デモモード：ブーストを即時開始しました。' });
  }

  try {
    const boostId = billing.createBoost(user.id, reelId, 'pending');
    const session = await checkoutFor(req, user, {
      kind: 'boost',
      description: `リールブースト（${billing.BOOST.days}日間）`,
      amountYen: billing.BOOST.priceYen,
      meta: { boostId },
    });
    res.json(200, { mode: 'stripe', url: session.url, sessionId: session.id });
  } catch (e) {
    res.json(502, { error: 'stripe_request_failed', message: e.message });
  }
}

async function reportDeal(req, res, body) {
  const user = requireBreeder(req, res);
  if (!user) return;

  const price = Math.round(Number(body.price) || 0);
  if (price < 1000) return res.json(400, { error: 'invalid_price', message: '成約金額は1,000円以上で入力してください。' });

  const deal = billing.createDeal(user.id, {
    catName: String(body.catName || '').slice(0, 100),
    buyerName: String(body.buyerName || '').slice(0, 100),
    price,
  });

  if (!stripeConfigured()) {
    const paid = billing.markDealFeePaid(deal.id);
    return res.json(200, { mode: 'demo', deal: paid, message: 'デモモード：手数料を即時計上しました。' });
  }

  try {
    const session = await checkoutFor(req, user, {
      kind: 'deal_fee',
      description: `成約手数料（${deal.cat_name || '子猫'}）`,
      amountYen: deal.fee,
      meta: { dealId: deal.id },
    });
    res.json(200, { mode: 'stripe', deal, url: session.url, sessionId: session.id });
  } catch (e) {
    res.json(502, { error: 'stripe_request_failed', message: e.message });
  }
}

module.exports = { plans, me, subscribe, cancel, boost, reportDeal };
