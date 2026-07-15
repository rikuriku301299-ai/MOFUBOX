const { db } = require('./db');

// Optional email delivery. When RESEND_API_KEY (+ MOFUBOX_MAIL_FROM) is set, each
// in-app notification is also emailed to the user so they hear about messages /
// inquiries without keeping the site open. Until then this is a no-op — the app
// works exactly as before. Fire-and-forget: email problems never break a request.
async function sendEmail(to, subject, text) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MOFUBOX_MAIL_FROM;
  if (!key || !from || !to) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, text }),
    });
  } catch {
    /* email is best-effort; ignore delivery failures */
  }
}

function emailEnabled() {
  return Boolean(process.env.RESEND_API_KEY && process.env.MOFUBOX_MAIL_FROM);
}

function notify(userId, type, title, body, link) {
  db.prepare(`
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, type, title, body || null, link || null);

  if (emailEnabled()) {
    const u = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
    if (u && u.email) {
      const origin = process.env.MOFUBOX_PUBLIC_URL || '';
      const lines = [body || '', link ? `${origin}${link}` : '', '', '― MOFUBOX'].filter(Boolean);
      sendEmail(u.email, `【MOFUBOX】${title}`, lines.join('\n'));
    }
  }
}

function notifyAdmins(type, title, body, link) {
  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
  admins.forEach((a) => notify(a.id, type, title, body, link));
}

module.exports = { notify, notifyAdmins, sendEmail, emailEnabled };
