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

// POST /api/admin/message-breeders — the operator contacts breeders directly.
// target: 'approved' (default) | 'all' | a breeder id. The message lands in each
// breeder's inbox (breeder.html → メッセージ) and as a notification. Breeders can
// reply, and replies appear in the admin's own conversation list (/api/messages).
function messageBreeders(req, res, body) {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const text = String((body && body.body) || '').trim();
  if (!text) return res.json(400, { error: 'empty_message', message: 'メッセージを入力してください。' });
  if (text.length > 2000) return res.json(400, { error: 'too_long', message: '2000文字以内で入力してください。' });

  const target = body && body.target != null ? body.target : 'approved';
  let recipients;
  if (target === 'all' || target === 'approved') {
    const where = target === 'approved' ? "AND status = 'approved'" : '';
    recipients = db.prepare(`SELECT id FROM users WHERE role = 'breeder' ${where}`).all().map(r => r.id);
  } else {
    const breeder = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'breeder'").get(Number(target));
    if (!breeder) return res.json(404, { error: 'not_found' });
    recipients = [breeder.id];
  }
  if (!recipients.length) return res.json(200, { sent: 0 });

  const insert = db.prepare('INSERT INTO messages (sender_id, recipient_id, body) VALUES (?, ?, ?)');
  for (const rid of recipients) {
    insert.run(admin.id, rid, text);
    notify(rid, 'message', 'MOFUBOX運営からのお知らせ', text.slice(0, 60), '/breeder.html');
  }
  res.json(200, { sent: recipients.length });
}

module.exports = { listBreeders, listCustomers, reviewBreeder, manageUser, messageBreeders, requireAdmin };
