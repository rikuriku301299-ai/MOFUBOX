// Monetization domain logic. Site usage is completely free — breeders pay
// nothing to register, post reels, or message customers. Revenue comes from
// two success/option-based streams, both recorded in the orders ledger:
//   1. boost    — optional one-time fee to pin a reel to the top of the feed
//   2. deal_fee — 7% platform commission on every reported adoption
// Works in two modes: real Stripe billing when STRIPE_SECRET_KEY is set
// (fulfilled via webhook), or demo mode where purchases activate instantly
// so the whole flow can be exercised without payment keys.
const { db } = require('./db');
const { notify, notifyAdmins } = require('./notifications');

const BOOST = { priceYen: 1980, days: 7 };
const DEAL_FEE_RATE = 0.07; // 7% — matches the business plan on about.html

function recordPaidOrder(userId, kind, description, amountYen, meta) {
  db.prepare(`
    INSERT INTO orders (user_id, kind, description, amount, currency, status, meta)
    VALUES (?, ?, ?, ?, 'jpy', 'paid', ?)
  `).run(userId, kind, description, amountYen, meta ? JSON.stringify(meta) : null);
  if (amountYen > 0) {
    notifyAdmins('revenue', '新しい収益が発生しました', `${description}：¥${amountYen.toLocaleString('ja-JP')}`, '/admin.html#view-revenue');
  }
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
  if (order.kind === 'boost' && meta.boostId) {
    activateBoost(meta.boostId, { recordOrder: false });
  } else if (order.kind === 'deal_fee' && meta.dealId) {
    markDealFeePaid(meta.dealId, { recordOrder: false });
  }
  if (order.amount > 0) {
    notifyAdmins('revenue', '新しい収益が発生しました', `${order.description}：¥${order.amount.toLocaleString('ja-JP')}`, '/admin.html#view-revenue');
  }
}

module.exports = {
  BOOST,
  DEAL_FEE_RATE,
  recordPaidOrder,
  createBoost,
  activateBoost,
  createDeal,
  markDealFeePaid,
  fulfillOrder,
};
