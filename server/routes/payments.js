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
    try {
      const origin = req.headers.origin || `http://${req.headers.host}`;
      const session = await stripeRequest('checkout/sessions', {
        mode: 'payment',
        'payment_method_types[0]': 'card',
        'line_items[0][price_data][currency]': 'jpy',
        'line_items[0][price_data][unit_amount]': String(commission),
        'line_items[0][price_data][product_data][name]': description,
        'line_items[0][quantity]': '1',
        success_url: `${origin}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/breeder.html`,
      });
      db.prepare(`INSERT INTO orders (user_id, stripe_session_id, description, amount, currency, status)
        VALUES (?, ?, ?, ?, 'jpy', 'pending')`).run(user.id, session.id, description, commission);
      notifyAdmins('revenue', '成約が記録されました',
        `${user.kennel || user.name} ／ 手数料 ¥${commission.toLocaleString()}（決済リンク発行済み）`, '/admin.html#view-revenue');
      return res.json(200, { price, commission, live: true, url: session.url });
    } catch (e) {
      return res.json(502, { error: 'stripe_request_failed', message: e.message });
    }
  }

  db.prepare(`INSERT INTO orders (user_id, description, amount, currency, status)
    VALUES (?, ?, ?, 'jpy', 'recorded')`).run(user.id, description, commission);
  notifyAdmins('revenue', '成約が記録されました',
    `${user.kennel || user.name} ／ 手数料 ¥${commission.toLocaleString()}（Stripe未接続のため記録のみ）`, '/admin.html#view-revenue');
  res.json(200, { price, commission, live: false, message: 'Stripe接続後は自動で決済リンクが発行され、寝ている間も手数料が入金されます。' });
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
  res.json(200, {
    paidTotal: paid.s, paidCount: paid.c,
    pendingTotal: pending.s, pendingCount: pending.c,
    commissionRate: COMMISSION_RATE,
    stripeLive: stripeConfigured(),
    recent: recent.map(r => ({
      breeder: r.kennel || r.name || '—',
      description: r.description, amount: r.amount, status: r.status, at: r.created_at,
    })),
  });
}

module.exports = { createCheckoutSession, webhook, stripeConfigured, recordDeal, revenueSummary };
