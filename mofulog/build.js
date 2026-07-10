#!/usr/bin/env node
'use strict';

/*
 * モフログ — 依存ゼロの静的サイトジェネレーター
 *
 * articles/*.md と products.json から dist/ に完全な静的サイトを生成する。
 * MOFUBOX 本体と同じく Node 標準ライブラリのみ(npm install 不要)。
 *
 *   node mofulog/build.js
 *
 * 生成物: index.html / articles/<slug>/index.html / style.css /
 *         sitemap.xml / feed.xml / robots.txt / .nojekyll
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

const warnings = [];
const warn = (msg) => warnings.push(msg);

const readJson = (name) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, name), 'utf8'));

const config = readJson('config.json');
const products = readJson('products.json');
const productBySlug = new Map(products.map((p) => [p.slug, p]));
const affiliates = config.affiliates || {};

/* ---------- 小さなユーティリティ ---------- */

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// インライン記法: **太字** と [テキスト](URL) のみ対応。
// 入力は先に esc() 済みなので、URL はそのまま埋め込んで良い。
function inline(raw) {
  let s = esc(raw);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) => {
    const ext = /^https?:/.test(url) ? ' target="_blank" rel="noopener"' : '';
    return `<a href="${url}"${ext}>${text}</a>`;
  });
  return s;
}

/* ---------- アフィリエイトリンク ---------- */

function amazonUrl(p) {
  const tag = affiliates.amazonTag || '';
  if (p.asin) {
    if (!tag) warn(`config.json の affiliates.amazonTag が空: 「${p.name}」のAmazonリンクは成果報酬が発生しません`);
    return `https://www.amazon.co.jp/dp/${p.asin}/${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`;
  }
  // ASIN 未設定の間も読者にはリンク切れを見せない(検索リンクで代替)
  warn(`products.json の「${p.name}」(${p.slug}) に asin が未設定: Amazon検索リンクで代替しています`);
  return `https://www.amazon.co.jp/s?k=${encodeURIComponent(p.name)}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`;
}

function productCard(slug) {
  const p = productBySlug.get(slug);
  if (!p) {
    warn(`記事中の {{product:${slug}}} に対応する商品が products.json にありません`);
    return '';
  }
  const buttons = [
    `<a class="btn btn-amazon" href="${esc(amazonUrl(p))}" target="_blank" rel="noopener sponsored">Amazonで見る</a>`,
  ];
  if (p.rakutenUrl) {
    buttons.push(
      `<a class="btn btn-rakuten" href="${esc(p.rakutenUrl)}" target="_blank" rel="noopener sponsored">楽天で見る</a>`
    );
  } else {
    warn(`products.json の「${p.name}」(${p.slug}) に rakutenUrl が未設定: 楽天ボタンは非表示です`);
  }
  return [
    '<div class="product-card">',
    '  <div class="product-info">',
    `    <p class="product-name">${esc(p.name)}</p>`,
    p.note ? `    <p class="product-note">${esc(p.note)}</p>` : '',
    p.priceNote ? `    <p class="product-price">${esc(p.priceNote)}</p>` : '',
    '  </div>',
    `  <div class="product-links">${buttons.join('')}</div>`,
    '</div>',
  ]
    .filter(Boolean)
    .join('\n');
}

/* ---------- Markdown サブセット → HTML ---------- */

function mdToHtml(md) {
  const out = [];
  let para = [];
  let list = null;
  let quote = null;

  const flush = () => {
    if (para.length) {
      out.push(`<p>${para.map(inline).join('<br>')}</p>`);
      para = [];
    }
    if (list) {
      out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join('')}</ul>`);
      list = null;
    }
    if (quote) {
      out.push(`<blockquote><p>${quote.map(inline).join('<br>')}</p></blockquote>`);
      quote = null;
    }
  };

  for (const line of md.split(/\r?\n/)) {
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flush();
      const level = heading[1].length + 1; // 記事タイトルが h1 なので本文は h2 から
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const product = line.match(/^\{\{product:([a-z0-9-]+)\}\}$/);
    if (product) {
      flush();
      out.push(productCard(product[1]));
      continue;
    }
    const li = line.match(/^-\s+(.*)$/);
    if (li) {
      if (para.length || quote) flush();
      (list ||= []).push(li[1]);
      continue;
    }
    const q = line.match(/^>\s?(.*)$/);
    if (q) {
      if (para.length || list) flush();
      (quote ||= []).push(q[1]);
      continue;
    }
    if (list || quote) flush();
    para.push(line);
  }
  flush();
  return out.join('\n');
}

/* ---------- 記事の読み込み ---------- */

function parseArticle(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`${path.basename(file)}: 先頭に --- で囲んだフロントマターが必要です`);
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  const slug =
    meta.slug || path.basename(file, '.md').replace(/^\d+-/, '');
  for (const key of ['title', 'description', 'date']) {
    if (!meta[key]) throw new Error(`${path.basename(file)}: フロントマターに ${key} がありません`);
  }
  return { ...meta, slug, bodyHtml: mdToHtml(m[2]) };
}

const articles = fs
  .readdirSync(path.join(ROOT, 'articles'))
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map((f) => parseArticle(path.join(ROOT, 'articles', f)))
  .sort((a, b) => (a.date < b.date ? 1 : -1));

/* ---------- ページレイアウト ---------- */

const siteUrl = (config.siteUrl || '').replace(/\/$/, '');

function layout({ title, description, body, rel, pagePath }) {
  const fullTitle = pagePath === '' ? `${config.siteTitle} — ${config.tagline}` : `${title} | ${config.siteTitle}`;
  const canonical = siteUrl ? `${siteUrl}/${pagePath}` : '';
  const adsense = affiliates.adsenseClientId
    ? `\n  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(affiliates.adsenseClientId)}" crossorigin="anonymous"></script>`
    : '';
  const mofubox = config.mofuboxUrl
    ? `<a href="${esc(config.mofuboxUrl)}" target="_blank" rel="noopener">猫との出会いは MOFUBOX</a> ・ `
    : '';
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(fullTitle)}</title>
  <meta name="description" content="${esc(description)}">
  ${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
  <meta property="og:title" content="${esc(fullTitle)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:type" content="${pagePath === '' ? 'website' : 'article'}">
  <link rel="alternate" type="application/rss+xml" title="${esc(config.siteTitle)}" href="${rel}feed.xml">
  <link rel="stylesheet" href="${rel}style.css">${adsense}
</head>
<body>
  <p class="disclosure">当サイトはアフィリエイト広告(Amazonアソシエイトを含む)を利用しています。</p>
  <header class="site-header">
    <a class="site-title" href="${rel || './'}">${esc(config.siteTitle)}</a>
    <p class="site-tagline">${esc(config.tagline)}</p>
  </header>
  <main>
${body}
  </main>
  <footer class="site-footer">
    <p>${mofubox}<a href="${rel}feed.xml">RSS</a></p>
    <p>© ${new Date().getFullYear()} ${esc(config.operator)}</p>
  </footer>
</body>
</html>
`;
}

/* ---------- 生成 ---------- */

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'articles'), { recursive: true });

// トップページ
const indexBody = [
  '    <section class="article-list">',
  ...articles.map((a) =>
    [
      `      <a class="article-card" href="articles/${a.slug}/">`,
      `        <time datetime="${esc(a.date)}">${esc(a.date)}</time>`,
      `        <h2>${esc(a.title)}</h2>`,
      `        <p>${esc(a.description)}</p>`,
      '      </a>',
    ].join('\n')
  ),
  '    </section>',
].join('\n');

fs.writeFileSync(
  path.join(DIST, 'index.html'),
  layout({
    title: config.siteTitle,
    description: config.tagline,
    body: indexBody,
    rel: '',
    pagePath: '',
  })
);

// 記事ページ
for (const a of articles) {
  const dir = path.join(DIST, 'articles', a.slug);
  fs.mkdirSync(dir, { recursive: true });
  const body = [
    '    <article>',
    `      <time datetime="${esc(a.date)}">${esc(a.date)}</time>`,
    `      <h1>${esc(a.title)}</h1>`,
    a.bodyHtml,
    '    </article>',
    '    <p class="back-link"><a href="../../">← 記事一覧へ</a></p>',
  ].join('\n');
  fs.writeFileSync(
    path.join(dir, 'index.html'),
    layout({
      title: a.title,
      description: a.description,
      body,
      rel: '../../',
      pagePath: `articles/${a.slug}/`,
    })
  );
}

// スタイルシート(ソースをそのままコピー)
fs.copyFileSync(path.join(ROOT, 'style.css'), path.join(DIST, 'style.css'));

// sitemap.xml / feed.xml / robots.txt(siteUrl 設定時のみ絶対URLが正しくなる)
if (!siteUrl) warn('config.json の siteUrl が空: sitemap.xml と feed.xml のURLが不完全です');

const urls = ['', ...articles.map((a) => `articles/${a.slug}/`)];
fs.writeFileSync(
  path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${esc(`${siteUrl}/${u}`)}</loc></url>`)
    .join('\n')}\n</urlset>\n`
);

fs.writeFileSync(
  path.join(DIST, 'feed.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>\n<title>${esc(config.siteTitle)}</title>\n<link>${esc(siteUrl || '/')}</link>\n<description>${esc(config.tagline)}</description>\n${articles
    .map(
      (a) =>
        `<item><title>${esc(a.title)}</title><link>${esc(`${siteUrl}/articles/${a.slug}/`)}</link><pubDate>${new Date(`${a.date}T00:00:00+09:00`).toUTCString()}</pubDate><description>${esc(a.description)}</description></item>`
    )
    .join('\n')}\n</channel></rss>\n`
);

fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n${siteUrl ? `Sitemap: ${siteUrl}/sitemap.xml\n` : ''}`);
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

/* ---------- 結果報告 ---------- */

console.log(`✔ ビルド完了: ${articles.length} 記事 → ${path.relative(process.cwd(), DIST)}/`);
if (warnings.length) {
  console.log(`\n⚠ 収益化のために対応が必要な項目 (${warnings.length}件):`);
  for (const w of [...new Set(warnings)]) console.log(`  - ${w}`);
  console.log('\n  → 対応方法は mofulog/README.md の「チェックリスト」を参照');
}
