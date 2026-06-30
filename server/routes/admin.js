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

module.exports = { listBreeders, listCustomers, reviewBreeder, requireAdmin };
