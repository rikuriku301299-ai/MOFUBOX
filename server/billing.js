// Monetization domain logic — the "earn while you sleep" engine.
// Three recurring revenue streams, all recorded in the orders ledger:
//   1. subscription — breeders pay a monthly plan fee (auto-renews)
//   2. boost        — one-time fee to pin a reel to the top of the feed
//   3. deal_fee     — platform commission on every reported adoption
// Works in two modes: real Stripe billing when STRIPE_SECRET_KEY is set
// (fulfilled via webhook), or demo mode where purchases activate instantly
// so the whole flow can be exercised without payment keys.
const { db } = require('./db');
const { notify, notifyAdmins } = require('./notifications');

const PLANS = {
  free: {
    id: 'free',
    name: 'フリー',
    priceYen: 0,
    reelLimit: 3,
    rank: 0,
    features: ['リール投稿 3本まで', '基本プロフィール掲載', 'お客様とのメッセージ'],
  },
  standard: {
    id: 'standard',
    name: 'スタンダード',
    priceYen: 4980,
    reelLimit: 20,
    rank: 1,
    features: ['リール投稿 20本まで', 'フィードで優先表示', '売上・統計レポート', 'お客様とのメッセージ'],
  },
  pro: {
    id: 'pro',
    name: 'プロ',
    priceYen: 9800,
    reelLimit: null,
    rank: 2,
    features: ['リール投稿 無制限', 'フィードで最優先表示', '売上・統計レポート', 'プロバッジ表示', 'お客様とのメッセージ'],
  },
};

const BOOST = { priceYen: 1980, days: 7 };
const DEAL_FEE_RATE = 0.08; // 8% platform commission (matches admin settings)

function getSubscription(breederId) {
  return db.prepare('SELECT * FROM subscriptions WHERE breeder_id = ?').get(breederId) || null;
}

function planOf(breederId) {
  const sub = getSubscription(breederId);
  if (!sub || sub.status !== 'active') return PLANS.free;
  return PLANS[sub.plan] || PLANS.free;
}

function recordPaidOrder(userId, kind, description, amountYen, meta) {
  db.prepare(`
    INSERT INTO orders (user_id, kind, description, amount, currency, status, meta)
    VALUES (?, ?, ?, ?, 'jpy', 'paid', ?)
  `).run(userId, kind, description, amountYen, meta ? JSON.stringify(meta) : null);
  if (amountYen > 0) {
    notifyAdmins('revenue', '新しい収益が発生しました', `${description}：¥${amountYen.toLocaleString('ja-JP')}`, '/admin.html#view-revenue');
  }
}

function periodEndFromNow() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

// Activate (or switch to) a plan. stripeIds is null in demo mode.
function activatePlan(breederId, planId, stripeIds, { recordOrder = true } = {}) {
  const plan = PLANS[planId];
  if (!plan) throw new Error('unknown_plan');

  const periodEnd = plan.priceYen > 0 ? periodEndFromNow() : null;
  db.prepare(`
    INSERT INTO subscriptions (breeder_id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, updated_at)
    VALUES (?, ?, 'active', ?, ?, ?, datetime('now'))
    ON CONFLICT(breeder_id) DO UPDATE SET
      plan = excluded.plan,
      status = 'active',
      stripe_customer_id = COALESCE(excluded.stripe_customer_id, stripe_customer_id),
      stripe_subscription_id = excluded.stripe_subscription_id,
      current_period_end = excluded.current_period_end,
      updated_at = datetime('now')
  `).run(
    breederId, planId,
    stripeIds ? stripeIds.customerId || null : null,
    stripeIds ? stripeIds.subscriptionId || null : null,
    periodEnd
  );

  if (recordOrder && plan.priceYen > 0) {
    recordPaidOrder(breederId, 'subscription', `${plan.name}プラン（月額）`, plan.priceYen, { plan: planId });
  }
  if (plan.priceYen > 0) {
    notify(breederId, 'billing', `${plan.name}プランが有効になりました`, '掲載枠と表示優先度がアップグレードされました。', '/breeder.html#view-plan');
  }
  return getSubscription(breederId);
}

function cancelPlan(breederId) {
  const sub = getSubscription(breederId);
  if (!sub || sub.plan === 'free') return sub;
  db.prepare(`
    UPDATE subscriptions
    SET plan = 'free', status = 'active', stripe_subscription_id = NULL, current_period_end = NULL, updated_at = datetime('now')
    WHERE breeder_id = ?
  `).run(breederId);
  notify(breederId, 'billing', 'プランを解約しました', 'フリープランに切り替わりました。いつでも再開できます。', '/breeder.html#view-plan');
  return getSubscription(breederId);
}

function createBoost(breederId, reelId, status) {
  const info = db.prepare(`
    INSERT INTO boosts (reel_id, breeder_id, amount, status)
    VALUES (?, ?, ?, ?)
  `).run(reelId, breederId, BOOST.priceYen, status || 'pending');
  return Number(info.lastInsertRowid);
}

function activateBoost(boostId, { recordOrder = true } = {}) {
  const boost = db.prepare('SELECT * FROM boosts WHERE id = ?').get(boostId);
  if (!boost || boost.status === 'active') return boost;
  db.prepare(`
    UPDATE boosts
    SET status = 'active', starts_at = datetime('now'), ends_at = datetime('now', ?)
    WHERE id = ?
  `).run(`+${BOOST.days} days`, boostId);
  if (recordOrder) {
    recordPaidOrder(boost.breeder_id, 'boost', `リールブースト（${BOOST.days}日間）`, boost.amount, { boostId });
  }
  notify(boost.breeder_id, 'billing', 'リールブーストが開始されました', `${BOOST.days}日間、リールがフィード上位に表示されます。`, '/breeder.html#view-plan');
  return db.prepare('SELECT * FROM boosts WHERE id = ?').get(boostId);
}

function createDeal(breederId, { catName, buyerName, price }) {
  const fee = Math.round(price * DEAL_FEE_RATE);
  const info = db.prepare(`
    INSERT INTO deals (breeder_id, cat_name, buyer_name, price, fee, fee_status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(breederId, catName || null, buyerName || null, price, fee);
  return db.prepare('SELECT * FROM deals WHERE id = ?').get(Number(info.lastInsertRowid));
}

function markDealFeePaid(dealId, { recordOrder = true } = {}) {
  const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(dealId);
  if (!deal || deal.fee_status === 'paid') return deal;
  db.prepare("UPDATE deals SET fee_status = 'paid' WHERE id = ?").run(dealId);
  if (recordOrder) {
    recordPaidOrder(deal.breeder_id, 'deal_fee', `成約手数料（${deal.cat_name || '子猫'}・成約額¥${deal.price.toLocaleString('ja-JP')}）`, deal.fee, { dealId });
  }
  return db.prepare('SELECT * FROM deals WHERE id = ?').get(dealId);
}

// Stripe webhook fulfillment: an order created as 'pending' at checkout time
// carries kind + meta describing what to activate once the payment clears.
function fulfillOrder(order) {
  let meta = {};
  try { meta = order.meta ? JSON.parse(order.meta) : {}; } catch { /* ignore */ }

  // The order row itself is the revenue record — don't double-record.
  if (order.kind === 'subscription' && meta.plan && order.user_id) {
    activatePlan(order.user_id, meta.plan, meta.stripe || null, { recordOrder: false });
  } else if (order.kind === 'boost' && meta.boostId) {
    activateBoost(meta.boostId, { recordOrder: false });
  } else if (order.kind === 'deal_fee' && meta.dealId) {
    markDealFeePaid(meta.dealId, { recordOrder: false });
  }
  if (order.amount > 0) {
    notifyAdmins('revenue', '新しい収益が発生しました', `${order.description}：¥${order.amount.toLocaleString('ja-JP')}`, '/admin.html#view-revenue');
  }
}

// Stripe renews subscriptions on its own (invoice.paid → handleInvoicePaid).
// In demo mode there is no Stripe, so this sweep plays the role of the billing
// engine: any demo subscription past its period end is renewed and the monthly
// fee is booked automatically — income keeps arriving with zero manual work.
function renewDueDemoSubscriptions() {
  const due = db.prepare(`
    SELECT * FROM subscriptions
    WHERE status = 'active' AND plan != 'free'
      AND stripe_subscription_id IS NULL
      AND current_period_end IS NOT NULL AND current_period_end <= datetime('now')
  `).all();

  for (const sub of due) {
    const plan = PLANS[sub.plan];
    if (!plan || !plan.priceYen) continue;
    db.prepare(`
      UPDATE subscriptions SET current_period_end = ?, updated_at = datetime('now') WHERE id = ?
    `).run(periodEndFromNow(), sub.id);
    recordPaidOrder(sub.breeder_id, 'subscription', `${plan.name}プラン（月額・自動更新）`, plan.priceYen, { plan: sub.plan, renewal: true });
  }
  return due.length;
}

// Stripe webhook: monthly renewal invoice was paid.
function handleInvoicePaid(invoice) {
  const stripeSubId = invoice.subscription;
  if (!stripeSubId) return;
  const sub = db.prepare('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?').get(stripeSubId);
  if (!sub) return;
  const plan = PLANS[sub.plan];
  db.prepare('UPDATE subscriptions SET current_period_end = ?, status = \'active\', updated_at = datetime(\'now\') WHERE id = ?')
    .run(periodEndFromNow(), sub.id);
  // billing_reason=subscription_create is already booked by the checkout order
  if (plan && plan.priceYen > 0 && invoice.billing_reason !== 'subscription_create') {
    recordPaidOrder(sub.breeder_id, 'subscription', `${plan.name}プラン（月額・自動更新）`, plan.priceYen, { plan: sub.plan, renewal: true });
  }
}

// Stripe webhook: subscription was cancelled at Stripe's side.
function handleSubscriptionDeleted(subscription) {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?').get(subscription.id);
  if (sub) cancelPlan(sub.breeder_id);
}

module.exports = {
  PLANS,
  BOOST,
  DEAL_FEE_RATE,
  getSubscription,
  planOf,
  activatePlan,
  cancelPlan,
  createBoost,
  activateBoost,
  createDeal,
  markDealFeePaid,
  fulfillOrder,
  renewDueDemoSubscriptions,
  handleInvoicePaid,
  handleSubscriptionDeleted,
};
