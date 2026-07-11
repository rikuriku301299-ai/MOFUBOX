// Stripe integration scaffold. Talks to Stripe's REST API directly via
// fetch (no SDK dependency needed). Fully wired and ready to use as soon as
// STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET are set in the environment —
// until then it responds 501 so the rest of the app can degrade gracefully.
const crypto = require('node:crypto');
const { db } = require('../db');
const { currentUser } = require('../auth');
const { notifyAdmins } = require('../notifications');

const STRIPE_API = 'https://api.stripe.com/v1';
const COMMISSION_RATE = 0.07;

function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

async function stripeRequest(endpoint, params) {
  const body = new URLSearchParams(params);
  const res = await fetch(`${STRIPE_API}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json.error ? json.error.message : 'stripe_error');
    err.stripe = json.error;
    throw err;
  }
  return json;
}

async function stripeGet(endpoint) {
  const res = await fetch(`${STRIPE_API}/${endpoint}`, {
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ? json.error.message : 'stripe_error');
  return json;
}

// --- Stripe Connect (marketplace split) -------------------------------------
// Onboard a breeder as an Express connected account so the customer's payment
// can be split at charge time: the platform fee (7%) is taken automatically and
// the rest is transferred to the breeder — "その場で天引き".
async function connectStart(req, res) {
  const user = currentUser(req);
  if (!user || user.role !== 'breeder') return res.json(403, { error: 'breeder_only' });
  if (!stripeConfigured()) {
    return res.json(501, { error: 'stripe_not_configured', message: 'Stripeキーの設定後に、入金の受け取り連携ができるようになります。' });
  }
  try {
    let acct = db.prepare('SELECT stripe_account_id FROM users WHERE id = ?').get(user.id).stripe_account_id;
    if (!acct) {
      const account = await stripeRequest('accounts', {
        type: 'express',
        country: 'JP',
        email: user.email,
        business_type: 'individual',
        'capabilities[transfers][requested]': 'true',
        'capabilities[card_payments][requested]': 'true',
      });
      acct = account.id;
      db.prepare('UPDATE users SET stripe_account_id = ? WHERE id = ?').run(acct, user.id);
    }
    const origin = req.headers.origin || `http://${req.headers.host}`;
    const link = await stripeRequest('account_links', {
      account: acct,
      refresh_url: `${origin}/breeder.html`,
      return_url: `${origin}/breeder.html`,
      type: 'account_onboarding',
    });
    res.json(200, { url: link.url });
  } catch (e) {
    res.json(502, { error: 'stripe_request_failed', message: e.message });
  }
}

async function connectStatus(req, res) {
  const user = currentUser(req);
  if (!user || user.role !== 'breeder') return res.json(403, { error: 'breeder_only' });
  const acct = db.prepare('SELECT stripe_account_id FROM users WHERE id = ?').get(user.id).stripe_account_id;
  if (!stripeConfigured()) return res.json(200, { configured: false, connected: false, ready: false });
  if (!acct) return res.json(200, { configured: true, connected: false, ready: false });
  try {
    const account = await stripeGet(`accounts/${acct}`);
    res.json(200, { configured: true, connected: true, ready: Boolean(account.charges_enabled && account.payouts_enabled) });
  } catch (e) {
    res.json(200, { configured: true, connected: true, ready: false });
  }
}

async function createCheckoutSession(req, res, body) {
  if (!stripeConfigured()) {
    return res.json(501, {
      error: 'stripe_not_configured',
      message: 'STRIPE_SECRET_KEY が設定されていません。本番キーを環境変数に設定すると決済が有効になります。',
    });
  }

  const user = currentUser(req);
  const { description, amountYen } = body;
  const amount = Math.max(50, Math.round(Number(amountYen) || 0));
  if (!description || !amount) return res.json(400, { error: 'missing_fields' });

  try {
    const origin = req.headers.origin || `http://${req.headers.host}`;
    const session = await stripeRequest('checkout/sessions', {
      mode: 'payment',
      'payment_method_types[0]': 'card',
      'line_items[0][price_data][currency]': 'jpy',
      'line_items[0][price_data][unit_amount]': String(amount),
      'line_items[0][price_data][product_data][name]': description,
      'line_items[0][quantity]': '1',
      success_url: `${origin}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/payment-cancelled.html`,
    });

    db.prepare(`
      INSERT INTO orders (user_id, stripe_session_id, description, amount, currency, status)
      VALUES (?, ?, ?, ?, 'jpy', 'pending')
    `).run(user ? user.id : null, session.id, description, amount);

    res.json(200, { url: session.url, sessionId: session.id });
  } catch (e) {
    res.json(502, { error: 'stripe_request_failed', message: e.message });
  }
}

// Webhook stub: verifies the Stripe-Signature header using STRIPE_WEBHOOK_SECRET
// (HMAC-SHA256 over timestamp.payload, per Stripe's documented scheme) and marks
// the matching order paid on checkout.session.completed. Wire your real webhook
// endpoint URL in the Stripe dashboard once a public deployment exists.
function verifyStripeSignature(payload, header, secret) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const signedPayload = `${parts.t}.${payload}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return parts.v1 && crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
}

function webhook(req, res, rawBody) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.json(501, { error: 'webhook_not_configured' });

  if (!verifyStripeSignature(rawBody, req.headers['stripe-signature'], secret)) {
    return res.json(400, { error: 'invalid_signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.json(400, { error: 'invalid_payload' });
  }

  if (event.type === 'checkout.session.completed') {
    const sessionId = event.data.object.id;
    db.prepare("UPDATE orders SET status = 'paid' WHERE stripe_session_id = ?").run(sessionId);
  }

  res.json(200, { received: true });
}

// POST /api/deals — a breeder records a completed adoption/sale. The platform
// commission (COMMISSION_RATE) is computed automatically and, once Stripe is
// live, a Checkout link is generated to collect it without any manual work.
// Until Stripe keys exist, the commission is still recorded so revenue tallies.
async function recordDeal(req, res, body) {
  const user = currentUser(req);
  if (!user || user.role !== 'breeder') return res.json(403, { error: 'breeder_only' });

  const price = Math.round(Number(body && body.priceYen) || 0);
  if (price < 1000) return res.json(400, { error: 'invalid_price', message: '成約金額を正しく入力してください（1,000円以上）。' });
  const commission = Math.round(price * COMMISSION_RATE);
  const catName = String((body && body.catName) || '').trim();
  const label = catName ? `${catName}・` : '';
  const description = `成約手数料（${label}成約額 ¥${price.toLocaleString()} の${Math.round(COMMISSION_RATE * 100)}%）`;

  if (stripeConfigured()) {
    const acct = db.prepare('SELECT stripe_account_id FROM users WHERE id = ?').get(user.id).stripe_account_id;
    if (!acct) {
      return res.json(409, { error: 'not_connected', needsConnect: true, price, commission,
        message: '先に「入金設定（Stripe連携）」を済ませると、お客様のお支払いから手数料が自動で天引きされます。' });
    }
    try {
      const origin = req.headers.origin || `http://${req.headers.host}`;
      // Customer pays the full price; the 7% application fee is taken by the
      // platform automatically and the remainder is transferred to the breeder.
      const session = await stripeRequest('checkout/sessions', {
        mode: 'payment',
        'payment_method_types[0]': 'card',
        'line_items[0][price_data][currency]': 'jpy',
        'line_items[0][price_data][unit_amount]': String(price),
        'line_items[0][price_data][product_data][name]': catName ? `${catName}のお迎え` : 'お迎え費用',
        'line_items[0][quantity]': '1',
        'payment_intent_data[application_fee_amount]': String(commission),
        'payment_intent_data[transfer_data][destination]': acct,
        success_url: `${origin}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/reel.html`,
      });
      db.prepare(`INSERT INTO orders (user_id, stripe_session_id, description, amount, currency, status)
        VALUES (?, ?, ?, ?, 'jpy', 'pending')`).run(user.id, session.id, description, commission);
      notifyAdmins('revenue', '成約の決済リンクを発行',
        `${user.kennel || user.name} ／ 成約額 ¥${price.toLocaleString()}（手数料 ¥${commission.toLocaleString()} を自動天引き）`, '/admin.html#view-revenue');
      return res.json(200, { price, commission, live: true, split: true, url: session.url });
    } catch (e) {
      return res.json(502, { error: 'stripe_request_failed', message: e.message });
    }
  }

  // Lowest-cost path: no card fees — the breeder pays the commission by bank
  // transfer. We record what is owed and show the transfer details.
  db.prepare(`INSERT INTO orders (user_id, description, amount, currency, status)
    VALUES (?, ?, ?, 'jpy', 'recorded')`).run(user.id, description, commission);
  notifyAdmins('revenue', '成約が記録されました（振込待ち）',
    `${user.kennel || user.name} ／ 手数料 ¥${commission.toLocaleString()}`, '/admin.html#view-revenue');
  res.json(200, {
    price, commission, live: false, method: 'bank_transfer',
    bankInfo: process.env.MOFUBOX_BANK_INFO || null,
  });
}

// POST /api/revenue/:orderId/paid — admin confirms a bank-transfer commission.
function markOrderPaid(req, res, orderId) {
  const user = currentUser(req);
  if (!user || user.role !== 'admin') return res.json(403, { error: 'admin_only' });
  const order = db.prepare("SELECT id FROM orders WHERE id = ? AND status = 'recorded'").get(orderId);
  if (!order) return res.json(404, { error: 'not_found' });
  db.prepare("UPDATE orders SET status = 'paid' WHERE id = ?").run(orderId);
  res.json(200, { id: orderId, status: 'paid' });
}

// GET /api/revenue — admin summary: total commission collected + recorded.
function revenueSummary(req, res) {
  const user = currentUser(req);
  if (!user || user.role !== 'admin') return res.json(403, { error: 'admin_only' });
  const paid = db.prepare("SELECT COALESCE(SUM(amount),0) AS s, COUNT(*) AS c FROM orders WHERE status = 'paid'").get();
  const pending = db.prepare("SELECT COALESCE(SUM(amount),0) AS s, COUNT(*) AS c FROM orders WHERE status IN ('pending','recorded')").get();
  const recent = db.prepare(`
    SELECT o.description, o.amount, o.status, o.created_at, u.kennel, u.name
    FROM orders o LEFT JOIN users u ON u.id = o.user_id
    ORDER BY o.created_at DESC LIMIT 20`).all();
  // Commissions awaiting a bank transfer — admin marks these paid once received.
  const unpaid = db.prepare(`
    SELECT o.id, o.description, o.amount, o.created_at, u.kennel, u.name
    FROM orders o LEFT JOIN users u ON u.id = o.user_id
    WHERE o.status = 'recorded'
    ORDER BY o.created_at DESC`).all();
  res.json(200, {
    paidTotal: paid.s, paidCount: paid.c,
    pendingTotal: pending.s, pendingCount: pending.c,
    commissionRate: COMMISSION_RATE,
    stripeLive: stripeConfigured(),
    unpaid: unpaid.map(r => ({
      id: r.id, breeder: r.kennel || r.name || '—',
      description: r.description, amount: r.amount, at: r.created_at,
    })),
    recent: recent.map(r => ({
      breeder: r.kennel || r.name || '—',
      description: r.description, amount: r.amount, status: r.status, at: r.created_at,
    })),
  });
}

module.exports = { createCheckoutSession, webhook, stripeConfigured, recordDeal, markOrderPaid, revenueSummary, connectStart, connectStatus };
