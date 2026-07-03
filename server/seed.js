// Seeds only the admin account on first run (no-op if users already exist).
// Also removes any leftover demo breeder data from earlier prototype builds.
const { db } = require('./db');
const { hashPassword } = require('./auth');

const ADMIN_EMAIL = process.env.MOFUBOX_ADMIN_EMAIL || 'admin@mofubox.jp';
const ADMIN_PASSWORD = process.env.MOFUBOX_ADMIN_PASSWORD || 'rikuto1289';

// One-time cleanup: delete prototype demo breeders if still present
const DEMO_EMAILS = [
  'mofu@cattery.jp',
  'sakura@breeder.jp',
  'hokkaido@norwegian.jp',
  'hinata@cattery.jp',
  'ragdoll@reona.jp',
];
for (const email of DEMO_EMAILS) {
  const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (u) {
    db.prepare('DELETE FROM reels WHERE breeder_id = ?').run(u.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
    console.log(`Removed demo breeder: ${email}`);
  }
}

const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (count === 0) {
  db.prepare(`
    INSERT INTO users (role, email, password_hash, name, kennel, phone, address, area, bio, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('admin', ADMIN_EMAIL, hashPassword(ADMIN_PASSWORD), '運営管理者', null, null, null, null, null, 'active');

  console.log('Seeded admin account.');
}
