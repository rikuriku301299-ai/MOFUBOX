const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, UPLOADS_DIR } = require('../db');
const { currentUser, publicUser } = require('../auth');
const { notify } = require('../notifications');

const VIDEO_EXT_BY_MIME = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};
const IMAGE_EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
};

const AVAIL_STATUSES = ['available', 'reserved', 'adopted'];

// Shared row→JSON mapper so list / search / favorites / mine all return the same
// shape (including the availability status: 受付中 / 商談中 / お迎え決定).
function makeReelMapper(user) {
  const likeCount = db.prepare('SELECT COUNT(*) AS c FROM likes WHERE reel_id = ?');
  const likedByMe = user ? db.prepare('SELECT 1 FROM likes WHERE reel_id = ? AND user_id = ?') : null;
  const followedByMe = user ? db.prepare('SELECT 1 FROM follows WHERE breeder_id = ? AND follower_id = ?') : null;
  return (r) => ({
    id: r.id,
    breederId: r.breeder_user_id,
    breederName: r.breeder_name,
    breederKennel: r.breeder_kennel,
    breederArea: r.breeder_area,
    caption: r.caption,
    tags: r.tags ? r.tags.split(',') : [],
    videoUrl: r.video_path ? `/uploads/${r.video_path}` : null,
    imageUrl: r.image_path ? `/uploads/${r.image_path}` : null,
    posterEmoji: r.poster_emoji,
    posterTheme: r.poster_theme,
    availStatus: r.avail_status || 'available',
    likeCount: r.seed_likes + likeCount.get(r.id).c,
    likedByMe: user ? !!likedByMe.get(r.id, user.id) : false,
    followedByMe: user ? !!followedByMe.get(r.breeder_user_id, user.id) : false,
    createdAt: r.created_at,
  });
}

function list(req, res) {
  const user = currentUser(req);
  const rows = db.prepare(`
    SELECT reels.*, users.name AS breeder_name, users.kennel AS breeder_kennel, users.area AS breeder_area, users.id AS breeder_user_id
    FROM reels
    JOIN users ON users.id = reels.breeder_id
    ORDER BY reels.created_at DESC
  `).all();
  res.json(200, { reels: rows.map(makeReelMapper(user)) });
}

// GET /api/reels/mine — the signed-in breeder's own reels (for status manage).
function mine(req, res) {
  const user = currentUser(req);
  if (!user || user.role !== 'breeder') return res.json(403, { error: 'breeder_only' });
  const rows = db.prepare(`
    SELECT reels.*, users.name AS breeder_name, users.kennel AS breeder_kennel, users.area AS breeder_area, users.id AS breeder_user_id
    FROM reels
    JOIN users ON users.id = reels.breeder_id
    WHERE reels.breeder_id = ?
    ORDER BY reels.created_at DESC
  `).all(user.id);
  res.json(200, { reels: rows.map(makeReelMapper(user)) });
}

// GET /api/favorites — the signed-in user's きになるリスト (liked reels).
function favorites(req, res) {
  const user = currentUser(req);
  if (!user) return res.json(401, { error: 'login_required' });
  const rows = db.prepare(`
    SELECT reels.*, users.name AS breeder_name, users.kennel AS breeder_kennel, users.area AS breeder_area, users.id AS breeder_user_id
    FROM likes
    JOIN reels ON reels.id = likes.reel_id
    JOIN users ON users.id = reels.breeder_id
    WHERE likes.user_id = ?
    ORDER BY likes.created_at DESC
  `).all(user.id);
  res.json(200, { reels: rows.map(makeReelMapper(user)) });
}

// POST /api/reels/:id/status — breeder updates a reel's availability.
function setStatus(req, res, reelId, body) {
  const user = currentUser(req);
  if (!user || user.role !== 'breeder') return res.json(403, { error: 'breeder_only' });
  const status = body && body.status;
  if (!AVAIL_STATUSES.includes(status)) return res.json(400, { error: 'invalid_status' });
  const reel = db.prepare('SELECT breeder_id FROM reels WHERE id = ?').get(reelId);
  if (!reel) return res.json(404, { error: 'not_found' });
  if (reel.breeder_id !== user.id) return res.json(403, { error: 'not_owner' });
  db.prepare('UPDATE reels SET avail_status = ? WHERE id = ?').run(status, reelId);
  res.json(200, { id: reelId, availStatus: status });
}

function search(req, res, query) {
  const user = currentUser(req);
  const q = (query.q || '').trim();
  if (!q) return res.json(200, { reels: [] });

  const like = `%${q}%`;
  const rows = db.prepare(`
    SELECT reels.*, users.name AS breeder_name, users.kennel AS breeder_kennel, users.area AS breeder_area, users.id AS breeder_user_id
    FROM reels
    JOIN users ON users.id = reels.breeder_id
    WHERE reels.caption LIKE ? OR reels.tags LIKE ? OR users.kennel LIKE ? OR users.name LIKE ? OR users.area LIKE ?
    ORDER BY reels.created_at DESC
  `).all(like, like, like, like, like);
  res.json(200, { reels: rows.map(makeReelMapper(user)) });
}

function create(req, res, body) {
  const user = currentUser(req);
  if (!user || user.role !== 'breeder') return res.json(403, { error: 'breeder_only' });

  const { caption, tags, poster_emoji, poster_theme, cat_id } = body;
  const info = db.prepare(`
    INSERT INTO reels (breeder_id, cat_id, caption, tags, poster_emoji, poster_theme)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(user.id, cat_id || null, caption || '', (tags || []).join(','), poster_emoji || '🐱', poster_theme || 'coral');

  res.json(201, { id: info.lastInsertRowid });
}

function uploadVideo(req, res, reelId) {
  const user = currentUser(req);
  if (!user || user.role !== 'breeder') return res.json(403, { error: 'breeder_only' });

  const reel = db.prepare('SELECT * FROM reels WHERE id = ?').get(reelId);
  if (!reel) return res.json(404, { error: 'not_found' });
  if (reel.breeder_id !== user.id) return res.json(403, { error: 'not_owner' });

  const contentType = (req.headers['content-type'] || '').split(';')[0].trim();
  const ext = VIDEO_EXT_BY_MIME[contentType];
  if (!ext) return res.json(400, { error: 'unsupported_media_type', message: 'mp4 / webm / mov のみ対応しています。' });

  const filename = `${reelId}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const dest = path.join(UPLOADS_DIR, filename);
  const writeStream = fs.createWriteStream(dest);

  let bytes = 0;
  const MAX_BYTES = 200 * 1024 * 1024; // 200MB cap for this prototype's local disk storage
  let aborted = false;

  req.on('data', (chunk) => {
    bytes += chunk.length;
    if (bytes > MAX_BYTES) {
      aborted = true;
      writeStream.destroy();
      fs.unlink(dest, () => {});
      res.json(413, { error: 'file_too_large' });
      req.destroy();
    }
  });

  writeStream.on('close', () => {
    if (aborted) return;
    db.prepare('UPDATE reels SET video_path = ? WHERE id = ?').run(filename, reelId);
    res.json(200, { videoUrl: `/uploads/${filename}` });
  });

  writeStream.on('error', () => {
    if (!aborted) res.json(500, { error: 'upload_failed' });
  });

  req.pipe(writeStream);
}

// PUT /api/reels/:id/image — attach a photo to a reel (so breeders can post
// with just a picture, no video needed). Raw image body, same as video upload.
function uploadImage(req, res, reelId) {
  const user = currentUser(req);
  if (!user || user.role !== 'breeder') return res.json(403, { error: 'breeder_only' });

  const reel = db.prepare('SELECT * FROM reels WHERE id = ?').get(reelId);
  if (!reel) return res.json(404, { error: 'not_found' });
  if (reel.breeder_id !== user.id) return res.json(403, { error: 'not_owner' });

  const contentType = (req.headers['content-type'] || '').split(';')[0].trim();
  const ext = IMAGE_EXT_BY_MIME[contentType];
  if (!ext) return res.json(400, { error: 'unsupported_media_type', message: 'JPEG / PNG / WebP の画像に対応しています。' });

  const filename = `${reelId}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const dest = path.join(UPLOADS_DIR, filename);
  const writeStream = fs.createWriteStream(dest);

  let bytes = 0;
  const MAX_BYTES = 15 * 1024 * 1024; // 15MB is plenty for a phone photo
  let aborted = false;

  req.on('data', (chunk) => {
    bytes += chunk.length;
    if (bytes > MAX_BYTES) {
      aborted = true;
      writeStream.destroy();
      fs.unlink(dest, () => {});
      res.json(413, { error: 'file_too_large' });
      req.destroy();
    }
  });

  writeStream.on('close', () => {
    if (aborted) return;
    db.prepare('UPDATE reels SET image_path = ? WHERE id = ?').run(filename, reelId);
    res.json(200, { imageUrl: `/uploads/${filename}` });
  });

  writeStream.on('error', () => {
    if (!aborted) res.json(500, { error: 'upload_failed' });
  });

  req.pipe(writeStream);
}

function toggleLike(req, res, reelId) {
  const user = currentUser(req);
  if (!user) return res.json(401, { error: 'login_required' });

  const reel = db.prepare('SELECT id, breeder_id, caption FROM reels WHERE id = ?').get(reelId);
  if (!reel) return res.json(404, { error: 'not_found' });

  const existing = db.prepare('SELECT id FROM likes WHERE user_id = ? AND reel_id = ?').get(user.id, reelId);
  if (existing) {
    db.prepare('DELETE FROM likes WHERE id = ?').run(existing.id);
  } else {
    db.prepare('INSERT INTO likes (user_id, reel_id) VALUES (?, ?)').run(user.id, reelId);
    if (reel.breeder_id !== user.id) {
      notify(reel.breeder_id, 'like', 'リールにいいねがつきました', `${user.name || 'ユーザー'}さんが「${reel.caption || '投稿'}」にいいねしました`, `/breeder.html#view-reels`);
    }
  }

  const seed = db.prepare('SELECT seed_likes FROM reels WHERE id = ?').get(reelId).seed_likes;
  const count = db.prepare('SELECT COUNT(*) AS c FROM likes WHERE reel_id = ?').get(reelId).c;
  res.json(200, { liked: !existing, count: seed + count });
}

function toggleFollow(req, res, breederId) {
  const user = currentUser(req);
  if (!user) return res.json(401, { error: 'login_required' });

  const breeder = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'breeder'").get(breederId);
  if (!breeder) return res.json(404, { error: 'not_found' });
  if (breeder.id === user.id) return res.json(400, { error: 'cannot_follow_self' });

  const existing = db.prepare('SELECT id FROM follows WHERE follower_id = ? AND breeder_id = ?').get(user.id, breederId);
  if (existing) {
    db.prepare('DELETE FROM follows WHERE id = ?').run(existing.id);
  } else {
    db.prepare('INSERT INTO follows (follower_id, breeder_id) VALUES (?, ?)').run(user.id, breederId);
    notify(breederId, 'follow', '新しいフォロワー', `${user.name || 'ユーザー'}さんにフォローされました`, `/breeder.html#view-profile`);
  }
  res.json(200, { following: !existing });
}

module.exports = { list, search, create, uploadVideo, uploadImage, toggleLike, toggleFollow, mine, favorites, setStatus };
