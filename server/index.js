const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');
const { serveFile } = require('./static');
const { UPLOADS_DIR } = require('./db');
require('./seed');

const authRoutes = require('./routes/auth');
const reelRoutes = require('./routes/reels');
const adminRoutes = require('./routes/admin');
const paymentRoutes = require('./routes/payments');
const notificationRoutes = require('./routes/notifications');
const messageRoutes = require('./routes/messages');

const ROOT_DIR = path.join(__dirname, '..');
const PORT = process.env.PORT || 8910;
const JSON_BODY_LIMIT = 5 * 1024 * 1024; // 5MB — plenty for form/JSON payloads (video uses a separate raw-stream route)

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > JSON_BODY_LIMIT) {
        reject(Object.assign(new Error('payload_too_large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(Object.assign(new Error('invalid_json'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function withJson(res) {
  res.json = (statusCode, payload) => {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
  };
  return res;
}

async function handleApi(req, res, pathname, query) {
  withJson(res);
  const method = req.method;

  try {
    if (pathname === '/api/auth/register' && method === 'POST') return authRoutes.register(req, res, await readJsonBody(req));
    if (pathname === '/api/auth/login' && method === 'POST') return authRoutes.login(req, res, await readJsonBody(req));
    if (pathname === '/api/auth/logout' && method === 'POST') return authRoutes.logout(req, res);
    if (pathname === '/api/auth/me' && method === 'GET') return authRoutes.me(req, res);
    if (pathname === '/api/auth/profile' && method === 'POST') return authRoutes.updateProfile(req, res, await readJsonBody(req));

    if (pathname === '/api/messages' && method === 'GET') return messageRoutes.listConversations(req, res);
    let m = pathname.match(/^\/api\/messages\/(\d+)$/);
    if (m && method === 'GET') return messageRoutes.getThread(req, res, Number(m[1]));
    if (m && method === 'POST') return messageRoutes.sendMessage(req, res, Number(m[1]), await readJsonBody(req));

    if (pathname === '/api/reels' && method === 'GET') return reelRoutes.list(req, res);
    if (pathname === '/api/reels' && method === 'POST') return reelRoutes.create(req, res, await readJsonBody(req));
    if (pathname === '/api/search' && method === 'GET') return reelRoutes.search(req, res, query);

    if (pathname === '/api/notifications' && method === 'GET') return notificationRoutes.list(req, res);
    if (pathname === '/api/notifications/read-all' && method === 'POST') return notificationRoutes.markAllRead(req, res);

    m = pathname.match(/^\/api\/reels\/(\d+)\/video$/);
    if (m && method === 'PUT') return reelRoutes.uploadVideo(req, res, Number(m[1]));

    m = pathname.match(/^\/api\/reels\/(\d+)\/like$/);
    if (m && method === 'POST') return reelRoutes.toggleLike(req, res, Number(m[1]));

    m = pathname.match(/^\/api\/users\/(\d+)\/follow$/);
    if (m && method === 'POST') return reelRoutes.toggleFollow(req, res, Number(m[1]));

    m = pathname.match(/^\/api\/notifications\/(\d+)\/read$/);
    if (m && method === 'POST') return notificationRoutes.markRead(req, res, Number(m[1]));

    if (pathname === '/api/admin/breeders' && method === 'GET') return adminRoutes.listBreeders(req, res, query);
    if (pathname === '/api/admin/customers' && method === 'GET') return adminRoutes.listCustomers(req, res);

    m = pathname.match(/^\/api\/admin\/breeders\/(\d+)\/(approve|reject)$/);
    if (m && method === 'POST') return adminRoutes.reviewBreeder(req, res, Number(m[1]), m[2]);

    m = pathname.match(/^\/api\/admin\/users\/(\d+)\/(suspend|reinstate|delete)$/);
    if (m && method === 'POST') return adminRoutes.manageUser(req, res, Number(m[1]), m[2]);

    if (pathname === '/api/deals' && method === 'POST') return paymentRoutes.recordDeal(req, res, await readJsonBody(req));
    if (pathname === '/api/revenue' && method === 'GET') return paymentRoutes.revenueSummary(req, res);
    m = pathname.match(/^\/api\/revenue\/(\d+)\/paid$/);
    if (m && method === 'POST') return paymentRoutes.markOrderPaid(req, res, Number(m[1]));
    if (pathname === '/api/connect/start' && method === 'POST') return paymentRoutes.connectStart(req, res);
    if (pathname === '/api/connect/status' && method === 'GET') return paymentRoutes.connectStatus(req, res);

    if (pathname === '/api/payments/checkout-session' && method === 'POST') {
      return paymentRoutes.createCheckoutSession(req, res, await readJsonBody(req));
    }
    if (pathname === '/api/payments/webhook' && method === 'POST') {
      return paymentRoutes.webhook(req, res, await readRawBody(req));
    }

    res.json(404, { error: 'not_found' });
  } catch (e) {
    res.json(e.statusCode || 500, { error: e.message || 'server_error' });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);
  const query = Object.fromEntries(url.searchParams.entries());

  if (pathname.startsWith('/api/')) {
    return handleApi(req, res, pathname, query);
  }

  if (pathname.startsWith('/uploads/')) {
    return serveFile(req, res, UPLOADS_DIR, pathname.slice('/uploads'.length));
  }

  const staticPath = pathname === '/' ? '/index.html' : pathname;
  return serveFile(req, res, ROOT_DIR, staticPath);
});

server.listen(PORT, () => {
  console.log(`MOFUBOX server listening on http://localhost:${PORT}`);
});
