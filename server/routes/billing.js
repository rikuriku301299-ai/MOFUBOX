// Monetization API routes. Site usage is free — these endpoints only cover
// the optional reel boost and the success-based deal fee. With Stripe
// configured, purchases go through Checkout and are fulfilled by the webhook;
// without it, everything activates instantly in demo mode so the full revenue
// loop can be exercised locally.
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

function pricing(req, res) {
  res.json(200, {
    boost: billing.BOOST,
    dealFeeRate: billing.DEAL_FEE_RATE,
    stripeConfigured: stripeConfigured(),
  });
}

function me(req, res) {
  const user = requireBreeder(req, res);
  if (!user) return;

  const boosts = db.prepare(`
    SELECT boosts.*, reels.caption AS reel_caption
    FROM boosts JOIN reels ON reels.id = boosts.reel_id
    WHERE boosts.breeder_id = ? AND boosts.status = 'active' AND boosts.ends_at > datetime('now')
    ORDER BY boosts.ends_at DESC
  `).all(user.id);
  const deals = db.prepare('SELECT * FROM deals WHERE breeder_id = ? ORDER BY created_at DESC LIMIT 20').all(user.id);

  res.json(200, { activeBoosts: boosts, deals });
}

async function checkoutFor(req, user, { kind, description, amountYen, meta }) {
  const origin = req.headers.origin || `http://${req.headers.host}`;
  const session = await stripeRequest('checkout/sessions', {
    mode: 'payment',
    'payment_method_types[0]': 'card',
    'line_items[0][price_data][currency]': 'jpy',
    'line_items[0][price_data][unit_amount]': String(amountYen),
    'line_items[0][price_data][product_data][name]': description,
    'line_items[0][quantity]': '1',
    success_url: `${origin}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/payment-cancelled.html`,
  });

  db.prepare(`
    INSERT INTO orders (user_id, stripe_session_id, kind, description, amount, currency, status, meta)
    VALUES (?, ?, ?, ?, ?, 'jpy', 'pending', ?)
  `).run(user.id, session.id, kind, description, amountYen, meta ? JSON.stringify(meta) : null);

  return session;
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

module.exports = { pricing, me, boost, reportDeal };
