const { db } = require('../db');
const { currentUser } = require('../auth');
const { notify } = require('../notifications');

function displayName(u) {
  if (!u) return '削除されたユーザー';
  return u.kennel || u.name || 'ユーザー';
}

// GET /api/messages — one entry per conversation partner, newest first,
// with the latest message preview and unread count.
function listConversations(req, res) {
  const user = currentUser(req);
  if (!user) return res.json(401, { error: 'unauthorized' });

  const partners = db.prepare(`
    SELECT CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END AS other_id,
           MAX(created_at) AS last_at
    FROM messages
    WHERE sender_id = ? OR recipient_id = ?
    GROUP BY other_id
    ORDER BY last_at DESC
  `).all(user.id, user.id, user.id);

  const conversations = partners.map(p => {
    const other = db.prepare('SELECT id, name, kennel, role FROM users WHERE id = ?').get(p.other_id);
    const last = db.prepare(`
      SELECT body, created_at, sender_id FROM messages
      WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
      ORDER BY created_at DESC, id DESC LIMIT 1
    `).get(user.id, p.other_id, p.other_id, user.id);
    const unread = db.prepare(
      'SELECT COUNT(*) AS c FROM messages WHERE sender_id = ? AND recipient_id = ? AND read = 0'
    ).get(p.other_id, user.id).c;
    return {
      userId: p.other_id,
      name: displayName(other),
      role: other ? other.role : null,
      lastBody: last ? last.body : '',
      lastAt: last ? last.created_at : p.last_at,
      lastFromMe: last ? last.sender_id === user.id : false,
      unread,
    };
  });

  const totalUnread = db.prepare(
    'SELECT COUNT(*) AS c FROM messages WHERE recipient_id = ? AND read = 0'
  ).get(user.id).c;

  res.json(200, { conversations, totalUnread });
}

// GET /api/messages/:otherId — full thread with a user (marks incoming read).
function getThread(req, res, otherId) {
  const user = currentUser(req);
  if (!user) return res.json(401, { error: 'unauthorized' });
  const other = db.prepare('SELECT id, name, kennel, role FROM users WHERE id = ?').get(otherId);
  if (!other) return res.json(404, { error: 'not_found' });

  const rows = db.prepare(`
    SELECT id, sender_id, body, created_at FROM messages
    WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
    ORDER BY created_at ASC, id ASC
  `).all(user.id, otherId, otherId, user.id);

  db.prepare('UPDATE messages SET read = 1 WHERE sender_id = ? AND recipient_id = ? AND read = 0')
    .run(otherId, user.id);

  res.json(200, {
    other: { userId: other.id, name: displayName(other), role: other.role },
    messages: rows.map(m => ({ id: m.id, fromMe: m.sender_id === user.id, body: m.body, at: m.created_at })),
  });
}

// POST /api/messages/:otherId — send a message.
function sendMessage(req, res, otherId, body) {
  const user = currentUser(req);
  if (!user) return res.json(401, { error: 'unauthorized' });
  const text = ((body && body.body) || '').trim();
  if (!text) return res.json(400, { error: 'empty_message' });
  if (text.length > 2000) return res.json(400, { error: 'too_long' });
  const other = db.prepare('SELECT id, name, kennel FROM users WHERE id = ?').get(otherId);
  if (!other) return res.json(404, { error: 'not_found' });
  if (other.id === user.id) return res.json(400, { error: 'cannot_message_self' });

  const info = db.prepare('INSERT INTO messages (sender_id, recipient_id, body) VALUES (?, ?, ?)')
    .run(user.id, otherId, text);
  const row = db.prepare('SELECT created_at FROM messages WHERE id = ?').get(info.lastInsertRowid);

  notify(otherId, 'message', '新しいメッセージ',
    `${displayName(user)}さんからメッセージが届きました`, '/reel.html');

  res.json(201, { id: info.lastInsertRowid, at: row.created_at });
}

module.exports = { listConversations, getThread, sendMessage };
