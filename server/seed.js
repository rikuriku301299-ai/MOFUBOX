// Seeds only the admin account on first run (no-op if users already exist).
const { db } = require('./db');
const { hashPassword } = require('./auth');

const ADMIN_EMAIL = process.env.MOFUBOX_ADMIN_EMAIL || 'admin@mofubox.jp';
const ADMIN_PASSWORD = process.env.MOFUBOX_ADMIN_PASSWORD || 'rikuto1289';

const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (count === 0) {
  db.prepare(`
    INSERT INTO users (role, email, password_hash, name, kennel, phone, address, area, bio, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('admin', ADMIN_EMAIL, hashPassword(ADMIN_PASSWORD), '運営管理者', null, null, null, null, null, 'active');

  console.log('Seeded admin account.');
}
