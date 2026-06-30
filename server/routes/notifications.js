const { db } = require('../db');
const { currentUser } = require('../auth');

function list(req, res) {
  const user = currentUser(req);
  if (!user) return res.json(401, { error: 'login_required' });

  const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(user.id);
  const unreadCount = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0').get(user.id).c;

  res.json(200, {
    notifications: rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      read: !!n.read,
      createdAt: n.created_at,
    })),
    unreadCount,
  });
}

function markRead(req, res, id) {
  const user = currentUser(req);
  if (!user) return res.json(401, { error: 'login_required' });

  const notification = db.prepare('SELECT id FROM notifications WHERE id = ? AND user_id = ?').get(id, user.id);
  if (!notification) return res.json(404, { error: 'not_found' });

  db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
  res.json(200, { ok: true });
}

function markAllRead(req, res) {
  const user = currentUser(req);
  if (!user) return res.json(401, { error: 'login_required' });

  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').run(user.id);
  res.json(200, { ok: true });
}

module.exports = { list, markRead, markAllRead };
