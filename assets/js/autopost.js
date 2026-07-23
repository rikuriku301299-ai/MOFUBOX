import { api } from './api.js';

// Zero-cost caption writer. Given a few facts (breed / age / name / area), it
// composes a warm, natural Japanese caption + hashtags automatically, so the
// breeder never has to write anything. No external AI/API needed.

const TEMPLATES = [
  '{name}、{breed}の{sex}の子です🐱 {age}{area}からお迎えできます。気になったら気軽に話しかけてね🐾',
  'こんにちは、{name}です🐱 {breed}・{age}今日もげんきいっぱい。{area}より🐾',
  '{breed}の{name}🐾 {age}まんまるおめめのこの子、里親さん募集中です。',
  'すやすや中の{name}💤 {breed}・{age}{area}。動画だともっと可愛いよ。',
  '{name}に、ひとめぼれ。🐱 {breed}・{age}{area}のブリーダーからお迎えできます。',
  'ちいさな{breed}、{name}です🐾 {age}気になる子がいたら、チャットで気軽にどうぞ。{area}',
];

const SEX_LABEL = { male: '男の子', female: '女の子' };

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export function generateCaption({ name, breed, weeks, area, sex }) {
  const nm = (name || '').trim() || 'この子';
  const br = (breed || '').trim() || '子猫';
  const ageText = weeks ? `生後${weeks}週。` : '';
  const areaText = (area || '').trim() ? `${area.trim()}` : '';
  const sexText = SEX_LABEL[sex] || '';
  let s = pick(TEMPLATES)
    .replace('{name}', nm)
    .replace('{breed}', br)
    .replace('{age}', ageText)
    .replace('{sex}', sexText || '子')
    .replace('{area}', areaText);
  // tidy up: collapse doubled spaces / stray punctuation from empty fields
  return s.replace(/\s{2,}/g, ' ').replace(/・。/g, '。').replace(/。\s*$/,'。').trim();
}

// Build the text a breeder pastes into TikTok / Instagram. It ends with a
// call-to-action + a MOFUBOX link, so viewers who see the post on SNS can jump
// back to MOFUBOX to chat / adopt (funnel-in, not funnel-out).
export function buildSnsText({ caption, tags, link }) {
  const tagLine = (tags || [])
    .map((t) => '#' + String(t).replace(/^#/, '').replace(/\s+/g, ''))
    .filter(Boolean)
    .join(' ');
  const parts = [String(caption || '').trim()];
  if (tagLine) parts.push(tagLine);
  parts.push('👀 この子とチャット・お迎えはモフボックスから🐾\n🔗 ' + link);
  return parts.filter(Boolean).join('\n\n');
}

export function generateTags({ breed, area }) {
  const rotating = ['子猫', '子猫のいる暮らし', '猫好きさんと繋がりたい', 'ねこすたぐらむ', 'ねこのいる生活', '子猫販売', 'ブリーダー直販'];
  const tags = [];
  if (breed && breed.trim()) tags.push(breed.trim().replace(/\s+/g, ''));
  if (area && area.trim()) tags.push(area.trim().replace(/[都道府県市区町村].*$/, '') || area.trim());
  // 3 rotating generic tags
  const shuffled = rotating.slice().sort(() => Math.random() - 0.5).slice(0, 3);
  return [...new Set([...tags, ...shuffled])];
}

// Wire the "おまかせ投稿" panel in breeder.html.
export function initAutoPost() {
  const form = document.querySelector('[data-autopost]');
  if (!form) return;
  const fileInput = form.querySelector('[data-ap-file]');
  const trigger = form.querySelector('[data-ap-trigger]');
  const fileLabel = form.querySelector('[data-ap-filelabel]');
  const nameEl = form.querySelector('[data-ap-name]');
  const breedEl = form.querySelector('[data-ap-breed]');
  const weeksEl = form.querySelector('[data-ap-weeks]');
  const areaEl = form.querySelector('[data-ap-area]');
  const sexEl = form.querySelector('[data-ap-sex]');
  const preview = form.querySelector('[data-ap-preview]');
  const previewText = form.querySelector('[data-ap-preview-text]');
  const submitBtn = form.querySelector('[data-ap-submit]');
  const status = form.querySelector('[data-ap-status]');
  const snsBox = form.querySelector('[data-ap-sns]');
  const snsText = form.querySelector('[data-ap-sns-text]');
  const snsCopy = form.querySelector('[data-ap-sns-copy]');
  let file = null;

  const facts = () => ({
    name: nameEl.value, breed: breedEl.value, weeks: weeksEl.value,
    area: areaEl.value, sex: sexEl.value,
  });

  function refreshPreview() {
    previewText.textContent = generateCaption(facts());
    preview.style.display = '';
  }
  function showStatus(msg, tone) {
    status.textContent = msg;
    status.style.display = msg ? '' : 'none';
    status.style.color = tone === 'error' ? 'var(--coral-dark,#c0453e)' : tone === 'ok' ? 'var(--mint-darker,#1f8a6d)' : 'var(--ink-soft)';
  }

  trigger.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    fileLabel.textContent = file ? file.name : '写真・動画を選ぶ';
    if (file) refreshPreview();
  });
  [nameEl, breedEl, weeksEl, areaEl, sexEl].forEach(el => el.addEventListener('input', () => { if (file) refreshPreview(); }));

  // "文章を作り直す" — reroll the caption wording.
  form.querySelector('[data-ap-reroll]').addEventListener('click', (e) => { e.preventDefault(); refreshPreview(); });

  submitBtn.addEventListener('click', async () => {
    if (!file) { showStatus('まず写真か動画を選んでください', 'error'); return; }
    const caption = previewText.textContent.trim();
    const tags = generateTags(facts());
    submitBtn.disabled = true;
    showStatus('自動で投稿中…', null);
    try {
      const { ok, data } = await api('/api/reels', { method: 'POST', body: { caption, tags } });
      if (!ok || !data.id) { showStatus(data.message || '投稿に失敗しました', 'error'); submitBtn.disabled = false; return; }
      const isImage = file.type.startsWith('image/');
      const res = await fetch(`/api/reels/${data.id}/${isImage ? 'image' : 'video'}`, {
        method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': file.type }, body: file,
      });
      if (!res.ok) {
        let m = 'アップロードに失敗しました';
        try { const j = await res.json(); if (j.message) m = j.message; } catch { /* */ }
        showStatus(m, 'error'); submitBtn.disabled = false; return;
      }
      showStatus('投稿しました！リールに表示されます🐱', 'ok');
      // Offer the SNS-ready text (caption + tags + MOFUBOX link) to copy-paste
      // into TikTok / Instagram, so SNS viewers funnel back to MOFUBOX.
      if (snsBox && snsText) {
        const link = `${window.location.origin}/reel.html`;
        snsText.value = buildSnsText({ caption, tags, link });
        snsBox.style.display = '';
      }
      file = null; fileInput.value = ''; fileLabel.textContent = '写真・動画を選ぶ';
      nameEl.value = ''; weeksEl.value = '';
      preview.style.display = 'none';
      document.dispatchEvent(new CustomEvent('reel:posted'));
    } catch {
      showStatus('通信エラーが発生しました', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  // Copy the SNS text to the clipboard so it can be pasted into TikTok / IG.
  if (snsCopy && snsText) {
    snsCopy.addEventListener('click', async () => {
      snsText.focus();
      snsText.select();
      let done = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(snsText.value);
          done = true;
        }
      } catch { /* fall through to execCommand */ }
      if (!done) { try { done = document.execCommand('copy'); } catch { done = false; } }
      snsCopy.textContent = done ? 'コピーしました！' : '長押しでコピー';
      setTimeout(() => { snsCopy.textContent = 'コピーする'; }, 1800);
    });
  }
}
