const { db } = require('../db');
const {
  hashPassword, verifyPassword, createSession, destroySession,
  setSessionCookie, clearSessionCookie, currentUser, publicUser, parseCookies, SESSION_COOKIE,
} = require('../auth');
const { notifyAdmins } = require('../notifications');
const { screenBreeder } = require('../screening');

const VALID_ROLES = new Set(['customer', 'breeder']); // admin accounts are seeded, not self-registered

function register(req, res, body) {
  const { role, email, password, name, kennel, phone, address, area, bio, breed_interest } = body;

  if (!VALID_ROLES.has(role)) return res.json(400, { error: 'invalid_role' });
  if (!email || !password || password.length < 8) return res.json(400, { error: 'invalid_credentials', message: 'パスワードは8文字以上で入力してください。' });
  if (role === 'customer' && !name) return res.json(400, { error: 'missing_fields' });
  if (role === 'breeder' && (!kennel || !name || !phone || !address)) return res.json(400, { error: 'missing_fields' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.json(409, { error: 'email_taken', message: 'このメールアドレスはすでに登録されています。' });

  // Breeders are auto-approved on sign-up so they can edit their profile and
  // post their cats immediately — no waiting for manual review. A lightweight
  // automatic screen still flags suspicious registrations for the admin to
  // review (and suspend if needed) after the fact.
  const status = role === 'breeder' ? 'approved' : 'active';
  const info = db.prepare(`
    INSERT INTO users (role, email, password_hash, name, kennel, phone, address, area, bio, breed_interest, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(role, email, hashPassword(password), name || null, kennel || null, phone || null, address || null, area || null, bio || null, breed_interest || null, status);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);

  if (role === 'breeder') {
    const { flagged, reasons } = screenBreeder({ kennel, name, bio, address });
    if (flagged) {
      notifyAdmins(
        'registration',
        '要確認：自動チェックで注意フラグ',
        `${kennel}（${name}様）が登録・自動承認されましたが、自動チェックで注意対象になりました（${reasons.join('・')}）。内容をご確認ください。`,
        '/admin.html#view-breeders'
      );
    } else {
      notifyAdmins('registration', '新規ブリーダーが登録', `${kennel}（${name}様）が登録し、自動承認されました`, '/admin.html#view-breeders');
    }
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

// POST /api/auth/profile — update the signed-in user's own editable fields.
const EDITABLE_FIELDS = ['name', 'kennel', 'phone', 'address', 'area', 'bio', 'breed_interest'];
function updateProfile(req, res, body) {
  const user = currentUser(req);
  if (!user) return res.json(401, { error: 'unauthorized' });

  const sets = [];
  const values = [];
  for (const key of EDITABLE_FIELDS) {
    if (body && Object.prototype.hasOwnProperty.call(body, key)) {
      sets.push(`${key} = ?`);
      const v = body[key];
      values.push(v === '' || v == null ? null : String(v).trim());
    }
  }
  if (!sets.length) return res.json(400, { error: 'no_fields' });

  values.push(user.id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  res.json(200, { user: publicUser(updated) });
}

module.exports = { register, login, logout, me, updateProfile };
