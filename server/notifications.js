const { db } = require('./db');

function notify(userId, type, title, body, link) {
  db.prepare(`
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, type, title, body || null, link || null);
}

function notifyAdmins(type, title, body, link) {
  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
  admins.forEach((a) => notify(a.id, type, title, body, link));
}

module.exports = { notify, notifyAdmins };
