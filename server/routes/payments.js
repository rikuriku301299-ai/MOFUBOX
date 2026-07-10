// Stripe integration scaffold. Talks to Stripe's REST API directly via
// fetch (no SDK dependency needed). Fully wired and ready to use as soon as
// STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET are set in the environment —
// until then it responds 501 so the rest of the app can degrade gracefully.
const crypto = require('node:crypto');
const { db } = require('../db');
const { currentUser } = require('../auth');
const billing = require('../billing');

const STRIPE_API = 'https://api.stripe.com/v1';

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
    const session = event.data.object;
    const order = db.prepare('SELECT * FROM orders WHERE stripe_session_id = ?').get(session.id);
    if (order && order.status !== 'paid') {
      db.prepare("UPDATE orders SET status = 'paid' WHERE id = ?").run(order.id);
      // Attach the Stripe subscription/customer ids so renewals can be matched.
      if (order.kind === 'subscription' && session.subscription) {
        let meta = {};
        try { meta = order.meta ? JSON.parse(order.meta) : {}; } catch { /* ignore */ }
        meta.stripe = { subscriptionId: session.subscription, customerId: session.customer || null };
        db.prepare('UPDATE orders SET meta = ? WHERE id = ?').run(JSON.stringify(meta), order.id);
        order.meta = JSON.stringify(meta);
      }
      billing.fulfillOrder(order);
    }
  }

  if (event.type === 'invoice.paid') {
    billing.handleInvoicePaid(event.data.object);
  }

  if (event.type === 'customer.subscription.deleted') {
    billing.handleSubscriptionDeleted(event.data.object);
  }

  res.json(200, { received: true });
}

module.exports = { createCheckoutSession, webhook, stripeConfigured, stripeRequest };
