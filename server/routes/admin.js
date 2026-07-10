const { db } = require('../db');
const { currentUser, publicUser } = require('../auth');
const { notify } = require('../notifications');

function requireAdmin(req, res) {
  const user = currentUser(req);
  if (!user || user.role !== 'admin') {
    res.json(403, { error: 'admin_only' });
    return null;
  }
  return user;
}

function listBreeders(req, res, query) {
  if (!requireAdmin(req, res)) return;
  const status = query.status;
  const rows = status
    ? db.prepare("SELECT * FROM users WHERE role = 'breeder' AND status = ? ORDER BY created_at DESC").all(status)
    : db.prepare("SELECT * FROM users WHERE role = 'breeder' ORDER BY created_at DESC").all();
  res.json(200, { breeders: rows.map(publicUser) });
}

function listCustomers(req, res) {
  if (!requireAdmin(req, res)) return;
  const rows = db.prepare("SELECT * FROM users WHERE role = 'customer' ORDER BY created_at DESC").all();
  res.json(200, { customers: rows.map(publicUser) });
}

function reviewBreeder(req, res, id, decision) {
  if (!requireAdmin(req, res)) return;
  const breeder = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'breeder'").get(id);
  if (!breeder) return res.json(404, { error: 'not_found' });
  const status = decision === 'approve' ? 'approved' : 'rejected';
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);
  notify(
    id,
    'review',
    status === 'approved' ? 'ブリーダー審査が承認されました' : 'ブリーダー審査が却下されました',
    status === 'approved' ? 'ご登録ありがとうございます。管理画面にログインできるようになりました。' : '審査の結果、今回は承認に至りませんでした。',
    '/breeder.html'
  );
  res.json(200, { status });
}

function manageUser(req, res, id, action) {
  if (!requireAdmin(req, res)) return;
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
  if (!user) return res.json(404, { error: 'not_found' });
  if (action === 'suspend') {
    db.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(id);
    return res.json(200, { status: 'suspended' });
  }
  if (action === 'reinstate') {
    const newStatus = user.role === 'breeder' ? 'approved' : 'active';
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(newStatus, id);
    return res.json(200, { status: newStatus });
  }
  if (action === 'delete') {
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return res.json(200, { deleted: true });
  }
  return res.json(400, { error: 'unknown_action' });
}

// Live revenue summary for the admin dashboard — everything is computed from
// the orders ledger so the numbers grow on their own as boosts are bought and
// deal fees come in.
function revenue(req, res) {
  if (!requireAdmin(req, res)) return;

  const sumWhere = (where, ...args) =>
    db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM orders WHERE status = 'paid' AND ${where}`).get(...args).s;

  const monthTotal = sumWhere("created_at >= datetime('now', 'start of month')");
  const last24h = sumWhere("created_at >= datetime('now', '-1 day')");
  const byKind = {};
  for (const kind of ['boost', 'deal_fee']) {
    byKind[kind] = sumWhere("kind = ? AND created_at >= datetime('now', 'start of month')", kind);
  }

  // Last 6 calendar months of paid revenue, oldest first.
  const rows = db.prepare(`
    SELECT strftime('%Y-%m', created_at) AS ym, SUM(amount) AS total
    FROM orders
    WHERE status = 'paid' AND created_at >= datetime('now', 'start of month', '-5 months')
    GROUP BY ym
  `).all();
  const totalsByMonth = Object.fromEntries(rows.map((r) => [r.ym, r.total]));
  const series = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    series.push({ month: ym, label: `${d.getMonth() + 1}月`, total: totalsByMonth[ym] || 0 });
  }

  const recentOrders = db.prepare(`
    SELECT orders.id, orders.kind, orders.description, orders.amount, orders.created_at,
           users.name AS user_name, users.kennel AS user_kennel
    FROM orders LEFT JOIN users ON users.id = orders.user_id
    WHERE orders.status = 'paid'
    ORDER BY orders.created_at DESC, orders.id DESC
    LIMIT 12
  `).all();

  const dealsMonth = db.prepare(`
    SELECT COALESCE(SUM(price), 0) AS volume, COUNT(*) AS count
    FROM deals WHERE created_at >= datetime('now', 'start of month')
  `).get();

  const ranking = db.prepare(`
    SELECT users.name, users.kennel, COUNT(*) AS deal_count, SUM(deals.price) AS volume, SUM(deals.fee) AS fees
    FROM deals JOIN users ON users.id = deals.breeder_id
    GROUP BY deals.breeder_id
    ORDER BY volume DESC
    LIMIT 8
  `).all();

  res.json(200, {
    monthTotal,
    last24h,
    byKind,
    series,
    recentOrders,
    dealVolumeMonth: dealsMonth.volume,
    dealCountMonth: dealsMonth.count,
    ranking,
  });
}

module.exports = { listBreeders, listCustomers, reviewBreeder, manageUser, requireAdmin, revenue };
