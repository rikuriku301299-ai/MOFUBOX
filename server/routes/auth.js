const { db } = require('../db');
const {
  hashPassword, verifyPassword, createSession, destroySession,
  setSessionCookie, clearSessionCookie, currentUser, publicUser, parseCookies, SESSION_COOKIE,
} = require('../auth');
const { notifyAdmins } = require('../notifications');

const VALID_ROLES = new Set(['customer', 'breeder']); // admin accounts are seeded, not self-registered

function register(req, res, body) {
  const { role, email, password, name, kennel, phone, address, area, bio, breed_interest } = body;

  if (!VALID_ROLES.has(role)) return res.json(400, { error: 'invalid_role' });
  if (!email || !password || password.length < 8) return res.json(400, { error: 'invalid_credentials', message: 'パスワードは8文字以上で入力してください。' });
  if (role === 'customer' && !name) return res.json(400, { error: 'missing_fields' });
  if (role === 'breeder' && (!kennel || !name || !phone || !address)) return res.json(400, { error: 'missing_fields' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.json(409, { error: 'email_taken', message: 'このメールアドレスはすでに登録されています。' });

  const status = role === 'breeder' ? 'pending' : 'active';
  const info = db.prepare(`
    INSERT INTO users (role, email, password_hash, name, kennel, phone, address, area, bio, breed_interest, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(role, email, hashPassword(password), name || null, kennel || null, phone || null, address || null, area || null, bio || null, breed_interest || null, status);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);

  if (role === 'breeder') {
    notifyAdmins('registration', '新規ブリーダー申請', `${kennel}（${name}様）から審査待ちの申請が届きました`, '/admin.html#view-breeders');
  } else {
    notifyAdmins('registration', '新規お客様登録', `${name}様が新規登録しました`, '/admin.html#view-users');
  }

  const session = createSession(user.id);
  setSessionCookie(res, session.token);
  res.json(201, { user: publicUser(user) });
}

function login(req, res, body) {
  const { email, password } = body;
  if (!email || !password) return res.json(400, { error: 'missing_fields' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.json(401, { error: 'invalid_login', message: 'メールアドレスまたはパスワードが正しくありません。' });
  }

  const session = createSession(user.id);
  setSessionCookie(res, session.token);
  res.json(200, { user: publicUser(user) });
}

function logout(req, res) {
  const cookies = parseCookies(req);
  destroySession(cookies[SESSION_COOKIE]);
  clearSessionCookie(res);
  res.json(200, { ok: true });
}

function me(req, res) {
  const user = currentUser(req);
  res.json(200, { user: publicUser(user) });
}

module.exports = { register, login, logout, me };
