// Seeds initial accounts/reels matching the prototype's existing static
// content, so likes/follows/admin-review have real rows to act on. Runs once
// (no-op if users already exist).
const { db } = require('./db');
const { hashPassword } = require('./auth');

const ADMIN_EMAIL = process.env.MOFUBOX_ADMIN_EMAIL || 'admin@mofubox.jp';
const ADMIN_PASSWORD = process.env.MOFUBOX_ADMIN_PASSWORD || 'rikuto1289';

const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (count === 0) {
  const insertUser = db.prepare(`
    INSERT INTO users (role, email, password_hash, name, kennel, phone, address, area, bio, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertReel = db.prepare(`
    INSERT INTO reels (breeder_id, caption, tags, poster_emoji, poster_theme, seed_likes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertUser.run('admin', ADMIN_EMAIL, hashPassword(ADMIN_PASSWORD), '運営管理者', null, null, null, null, null, 'active');

  const breeders = [
    { email: 'mofu@cattery.jp', kennel: 'もふもふ・キャッテリー', name: '佐藤 もふ', emoji: '🐱', theme: 'coral',
      caption: 'スコティッシュフォールド「ふく」・生後10週／東京都・ワクチン2回済み', tags: 'スコティッシュフォールド,子猫,東京', likes: 2481 },
    { email: 'sakura@breeder.jp', kennel: 'さくらブリーダーズ', name: '高橋 さくら', emoji: '🐈', theme: 'mint',
      caption: 'マンチカン「もも」・生後8週／神奈川県・両親猫の写真あり', tags: 'マンチカン,短足,神奈川', likes: 958 },
    { email: 'hokkaido@norwegian.jp', kennel: '北海道ノルウェージャン舎', name: '鈴木 北斗', emoji: '🐈‍⬛', theme: 'gold',
      caption: 'ノルウェージャンフォレストキャット「レオ」・生後12週／北海道', tags: 'ノルウェージャン,長毛,北海道', likes: 5230 },
    { email: 'hinata@cattery.jp', kennel: 'ひなたキャッテリー', name: '田中 陽', emoji: '🐾', theme: 'rose',
      caption: 'アメリカンショートヘア「トラ」・生後9週／愛知県・兄弟猫2匹同時募集', tags: 'アメショ,兄弟猫,愛知', likes: 1340 },
    { email: 'ragdoll@reona.jp', kennel: 'レオナ・ラグドール', name: '伊藤 れおな', emoji: '🐱', theme: 'coral',
      caption: 'ラグドール「ルナ」・生後11週／福岡県・抱っこ抜群の甘えん坊', tags: 'ラグドール,甘えん坊,福岡', likes: 673 },
  ];

  for (const b of breeders) {
    const info = insertUser.run('breeder', b.email, hashPassword('breeder1234'), b.name, b.kennel, '090-0000-0000', '日本', null, '', 'approved');
    insertReel.run(info.lastInsertRowid, b.caption, b.tags, b.emoji, b.theme, b.likes);
  }

  console.log('Seeded initial admin + breeder + reel data.');
}
