// FX chart analysis. The admin uploads a chart photo; we send it to Claude
// (vision) together with recent daily rates fetched from the ECB via the free
// Frankfurter API, and return trend analysis + entry/exit guidance in Japanese.
//
// Calls the Anthropic Messages API over raw HTTPS with Node's built-in fetch —
// this backend deliberately runs on a stock Node install with zero npm
// dependencies (see server/db.js), so the official SDK is not used here.
const { db } = require('../db');
const { currentUser } = require('../auth');

// ANTHROPIC_BASE_URL is the SDKs' standard override convention (tests/proxies).
const ANTHROPIC_API_URL = `${process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'}/v1/messages`;
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-opus-4-8';

const IMAGE_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // decoded size; the page downscales before upload

// Currencies the Frankfurter API (ECB daily reference rates) can serve.
const SUPPORTED_CURRENCIES = new Set([
  'USD', 'JPY', 'EUR', 'GBP', 'AUD', 'NZD', 'CAD', 'CHF',
  'CNY', 'HKD', 'SGD', 'KRW', 'MXN', 'ZAR', 'TRY', 'SEK', 'NOK', 'PLN',
]);

function requireAdmin(req, res) {
  const user = currentUser(req);
  if (!user) {
    res.json(401, { error: 'auth_required', message: 'ログインが必要です。' });
    return null;
  }
  if (user.role !== 'admin') {
    res.json(403, { error: 'admin_only', message: 'この機能は管理者専用です。' });
    return null;
  }
  return user;
}

// "data:image/jpeg;base64,..." -> { mediaType, data } (validated)
function parseImageDataUrl(image) {
  if (typeof image !== 'string') return null;
  const m = image.match(/^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i);
  if (!m) return null;
  const mediaType = m[1].toLowerCase();
  if (!IMAGE_MEDIA_TYPES.has(mediaType)) return null;
  const data = m[2];
  // base64 -> bytes is ~3/4; reject oversized payloads before hitting the API
  if (data.length * 0.75 > MAX_IMAGE_BYTES) return null;
  return { mediaType, data };
}

async function callClaude(payload) {
  let res;
  try {
    res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    const err = new Error(`network error: ${e.message}`);
    err.statusCode = 502;
    err.code = 'anthropic_request_failed';
    throw err;
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body && body.error && body.error.message ? body.error.message : `HTTP ${res.status}`;
    const err = new Error(message);
    err.statusCode = res.status === 429 ? 429 : 502;
    err.code = 'anthropic_request_failed';
    throw err;
  }
  return body;
}

function extractText(message) {
  if (!message || !Array.isArray(message.content)) return '';
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

// Ask Claude to identify the currency pair from the chart image alone.
// Returns e.g. "USD/JPY" or null.
async function detectPair(imageBlock) {
  const message = await callClaude({
    model: MODEL,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        imageBlock,
        {
          type: 'text',
          text: 'この画像はFX(為替)チャートのスクリーンショットです。チャートの通貨ペアを特定し、「USD/JPY」のような3文字コード2つをスラッシュで区切った形式だけで答えてください。特定できない場合は「UNKNOWN」とだけ答えてください。他の文章は一切書かないでください。',
        },
      ],
    }],
  });
  const text = extractText(message);
  const m = text.match(/\b([A-Z]{3})\s*\/\s*([A-Z]{3})\b/);
  if (!m || m[1] === m[2]) return null;
  return `${m[1]}/${m[2]}`;
}

// Fetch ~6 months of daily rates from Frankfurter and condense them into a
// prompt-friendly summary. Returns null when the pair isn't supported or the
// request fails — analysis then proceeds on the chart image alone.
async function fetchMarketData(base, quote) {
  if (!SUPPORTED_CURRENCIES.has(base) || !SUPPORTED_CURRENCIES.has(quote)) return null;
  const end = new Date();
  const start = new Date(end.getTime() - 185 * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const url = `https://api.frankfurter.dev/v1/${fmt(start)}..${fmt(end)}?base=${base}&symbols=${quote}`;

  let json;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    json = await res.json();
  } catch {
    return null;
  }
  if (!json || !json.rates) return null;

  const series = Object.entries(json.rates)
    .map(([date, rates]) => ({ date, rate: rates[quote] }))
    .filter((p) => typeof p.rate === 'number')
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (series.length < 10) return null;

  const latest = series[series.length - 1];
  const at = (daysBack) => series[Math.max(0, series.length - 1 - daysBack)];
  const pct = (from) => (((latest.rate - from.rate) / from.rate) * 100).toFixed(2);
  const rates = series.map((p) => p.rate);
  const high = Math.max(...rates);
  const low = Math.min(...rates);

  // Thin the series so the prompt stays compact: weekly points for the older
  // part, then the last 15 trading days daily.
  const older = series.slice(0, -15).filter((_, i) => i % 5 === 0);
  const recent = series.slice(-15);
  const points = [...older, ...recent];

  const summary = {
    pair: `${base}/${quote}`,
    latestDate: latest.date,
    latestRate: latest.rate,
    change1w: pct(at(5)),
    change1m: pct(at(21)),
    change3m: pct(at(63)),
    high6m: high,
    low6m: low,
  };

  const promptText = [
    `【${base}/${quote} 直近の市場データ(ECB日次参照レート、最新: ${latest.date})】`,
    `最新レート: ${latest.rate}`,
    `変化率: 1週間 ${summary.change1w}% / 1ヶ月 ${summary.change1m}% / 3ヶ月 ${summary.change3m}%`,
    `過去6ヶ月レンジ: 安値 ${low} 〜 高値 ${high}`,
    '日次レート推移(古い期間は週次に間引き):',
    points.map((p) => `${p.date}: ${p.rate}`).join('\n'),
  ].join('\n');

  return { summary, promptText };
}

function buildAnalysisPrompt(pairLabel, market, timeframe, notes) {
  const parts = [
    `添付の画像はFX(為替)チャートのスクリーンショットです。対象通貨ペア: ${pairLabel}${timeframe ? ` / 時間足: ${timeframe}` : ''}`,
  ];
  if (market) {
    parts.push(market.promptText);
  } else {
    parts.push('(外部の市場データは取得できなかったため、チャート画像から読み取れる情報のみで分析してください。)');
  }
  if (notes) parts.push(`【ユーザーからの補足】\n${notes}`);
  parts.push([
    '上記を踏まえて、以下の構成のMarkdownで日本語の分析レポートを書いてください。',
    '',
    '## 1. チャート概要',
    '(通貨ペア・時間足・表示期間・現在価格など、画像から読み取れる基本情報)',
    '## 2. テクニカル分析',
    '(トレンド方向と強さ、主要なサポート/レジスタンスの具体的な価格、チャートパターン、画像に表示されているインジケーターの状態)',
    '## 3. 市場環境',
    '(提供した直近レートデータとチャートを突き合わせた、現在の相場の位置づけ)',
    '## 4. 売買プラン',
    '(シナリオ別に: 方向(買い/売り/様子見)、エントリーの価格帯と根拠となるタイミング条件、損切りライン、利確目標、リスクリワード比)',
    '## 5. リスクと注意点',
    '(プラン否定の条件、直近の警戒イベント、想定と逆に動いた場合の対応)',
    '',
    '価格は必ず具体的な数値で示してください。最後に「本分析は教育目的の参考情報であり、投資助言ではありません」という免責を一行添えてください。',
  ].join('\n'));
  return parts.join('\n\n');
}

async function analyze(req, res, body) {
  const user = requireAdmin(req, res);
  if (!user) return;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json(501, { error: 'anthropic_not_configured', message: 'ANTHROPIC_API_KEY が設定されていません。' });
  }

  const image = parseImageDataUrl(body.image);
  if (!image) {
    return res.json(400, { error: 'invalid_image', message: 'チャート画像(JPEG/PNG/WebP、4MB以下)をアップロードしてください。' });
  }

  const imageBlock = {
    type: 'image',
    source: { type: 'base64', media_type: image.mediaType, data: image.data },
  };

  const timeframe = typeof body.timeframe === 'string' ? body.timeframe.slice(0, 40) : '';
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 2000) : '';

  try {
    // 1. Resolve the currency pair (user-selected, or detected from the image).
    let pair = null;
    let detected = false;
    const requested = typeof body.pair === 'string' ? body.pair.toUpperCase() : 'AUTO';
    const m = requested.match(/^([A-Z]{3})\/([A-Z]{3})$/);
    if (m) {
      pair = `${m[1]}/${m[2]}`;
    } else {
      pair = await detectPair(imageBlock);
      detected = true;
    }

    // 2. Pull recent daily rates for context (best effort).
    let market = null;
    if (pair) {
      const [base, quote] = pair.split('/');
      market = await fetchMarketData(base, quote);
    }

    // 3. Main vision analysis.
    const pairLabel = pair || '不明(画像から自動特定できませんでした。画像内の表記を優先してください)';
    const message = await callClaude({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      system: 'あなたは経験豊富なFXテクニカルアナリストです。チャート画像と提供された市場データを根拠に、具体的な価格水準を伴う実践的な分析を日本語で行います。根拠のない断定は避け、不確実性は明示します。',
      messages: [{
        role: 'user',
        content: [imageBlock, { type: 'text', text: buildAnalysisPrompt(pairLabel, market, timeframe, notes) }],
      }],
    });

    if (message.stop_reason === 'refusal') {
      return res.json(502, { error: 'analysis_refused', message: '分析リクエストが拒否されました。別の画像でお試しください。' });
    }

    const analysis = extractText(message);
    if (!analysis) {
      return res.json(502, { error: 'empty_analysis', message: '分析結果を取得できませんでした。もう一度お試しください。' });
    }

    const info = db.prepare(`
      INSERT INTO fx_analyses (user_id, pair, timeframe, notes, market_summary, analysis)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(user.id, pair, timeframe || null, notes || null, market ? JSON.stringify(market.summary) : null, analysis);

    res.json(200, {
      id: Number(info.lastInsertRowid),
      pair,
      detectedPair: detected ? pair : null,
      market: market ? market.summary : null,
      analysis,
    });
  } catch (e) {
    if (e.code === 'anthropic_request_failed') {
      return res.json(e.statusCode, { error: e.code, message: `AI分析でエラーが発生しました: ${e.message}` });
    }
    throw e;
  }
}

function history(req, res) {
  const user = requireAdmin(req, res);
  if (!user) return;

  const rows = db.prepare(`
    SELECT id, pair, timeframe, market_summary, analysis, created_at
    FROM fx_analyses
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(user.id);

  res.json(200, {
    analyses: rows.map((r) => ({
      id: r.id,
      pair: r.pair,
      timeframe: r.timeframe,
      market: r.market_summary ? JSON.parse(r.market_summary) : null,
      analysis: r.analysis,
      createdAt: r.created_at,
    })),
  });
}

module.exports = { analyze, history };
