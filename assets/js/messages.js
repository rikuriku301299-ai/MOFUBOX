import { api } from './api.js';
import { escapeHtml } from './utils.js';
import { ensureAuth } from './authgate.js';

// One-tap phrases. Customers ask common questions; breeders reply without typing.
const CUSTOMER_QUICKS = [
  'この子はまだ募集していますか？',
  '見学はできますか？',
  'お迎えまでの流れを教えてください',
  '費用の詳細を教えてください',
];
const BREEDER_QUICKS = [
  'お問い合わせありがとうございます！',
  'はい、まだ募集中です🐱',
  '見学も可能です。ご希望日を教えてください',
  '詳しい資料をお送りしますね',
];

// Build a row of quick-reply chips and insert it before `beforeEl`. Clicking a
// chip drops the phrase into `input` and submits `form` (reusing its send path).
function mountQuickReplies(beforeEl, form, input, phrases) {
  if (!beforeEl || beforeEl.previousElementSibling?.classList?.contains('quick-replies')) return;
  const bar = document.createElement('div');
  bar.className = 'quick-replies';
  phrases.forEach(p => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'quick-reply';
    chip.textContent = p;
    chip.addEventListener('click', () => {
      input.value = p;
      if (form.requestSubmit) form.requestSubmit();
      else form.dispatchEvent(new Event('submit', { cancelable: true }));
    });
    bar.appendChild(chip);
  });
  beforeEl.parentNode.insertBefore(bar, beforeEl);
}

// Escape for use inside a double-quoted HTML attribute (escapeHtml misses quotes).
function attr(s) { return escapeHtml(s == null ? '' : String(s)).replace(/"/g, '&quot;'); }

function timeLabel(iso) {
  if (!iso) return '';
  const d = new Date(/[TZ]/.test(iso) ? iso : iso.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

async function currentUser() {
  const { data } = await api('/api/auth/me');
  return data.user || null;
}

export function initMessages() {
  const overlay = document.querySelector('[data-msg-overlay]');
  if (!overlay) return;
  const trigger = document.querySelector('[data-msg-trigger]');
  const closeBtn = overlay.querySelector('[data-msg-close]');
  const backBtn = overlay.querySelector('[data-msg-back]');
  const title = overlay.querySelector('[data-msg-title]');
  const listView = overlay.querySelector('[data-msg-list-view]');
  const listEl = overlay.querySelector('[data-msg-list]');
  const threadView = overlay.querySelector('[data-msg-thread-view]');
  const threadEl = overlay.querySelector('[data-msg-thread]');
  const form = overlay.querySelector('[data-msg-form]');
  const input = overlay.querySelector('[data-msg-input]');
  const badge = document.querySelector('[data-msg-badge]');

  let currentOther = null;

  function showList() {
    currentOther = null;
    listView.style.display = '';
    threadView.style.display = 'none';
    backBtn.style.display = 'none';
    title.textContent = 'メッセージ';
  }
  function showThread(other) {
    currentOther = other;
    listView.style.display = 'none';
    threadView.style.display = 'flex';
    backBtn.style.display = '';
    title.textContent = other.name;
  }

  async function loadList() {
    const { ok, data } = await api('/api/messages');
    if (!ok) return;
    if (!data.conversations.length) {
      listEl.className = 'notif-empty';
      listEl.textContent = 'まだメッセージはありません。気になる子猫のブリーダーに「相談する」から話しかけてみましょう。';
      return;
    }
    listEl.className = 'msg-list';
    listEl.innerHTML = '';
    data.conversations.forEach(c => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'msg-row';
      const initial = escapeHtml((c.name || '?').charAt(0));
      row.innerHTML = `
        <div class="avatar avatar-md ${c.role === 'breeder' ? 'mint' : 'coral'}">${initial}</div>
        <div class="msg-row__body">
          <div class="msg-row__top"><span class="msg-row__name">${escapeHtml(c.name)}</span><span class="msg-row__time">${timeLabel(c.lastAt)}</span></div>
          <div class="msg-row__preview">${c.lastFromMe ? 'あなた: ' : ''}${escapeHtml(c.lastBody)}</div>
        </div>
        ${c.unread ? `<span class="msg-row__unread">${c.unread}</span>` : ''}`;
      row.addEventListener('click', () => openThread({ userId: c.userId, name: c.name }));
      listEl.appendChild(row);
    });
  }

  function appendBubble(fromMe, body) {
    const b = document.createElement('div');
    b.className = 'msg-bubble ' + (fromMe ? 'me' : 'them');
    b.textContent = body;
    threadEl.appendChild(b);
  }

  async function openThread(other) {
    showThread(other);
    threadEl.innerHTML = '<div class="notif-empty">読み込み中…</div>';
    const { ok, data } = await api(`/api/messages/${other.userId}`);
    threadEl.innerHTML = '';
    if (!ok) { threadEl.innerHTML = '<div class="notif-empty">読み込めませんでした</div>'; return; }
    data.messages.forEach(m => appendBubble(m.fromMe, m.body));
    threadEl.scrollTop = threadEl.scrollHeight;
  }

  async function refreshBadge() {
    if (!badge) return;
    const { ok, data } = await api('/api/messages');
    if (!ok) return;
    if (data.totalUnread > 0) { badge.textContent = data.totalUnread; badge.style.display = ''; }
    else badge.style.display = 'none';
  }

  async function open() {
    if (!(await ensureAuth())) return;
    showList();
    listEl.className = 'notif-empty';
    listEl.textContent = '読み込み中…';
    overlay.classList.add('open');
    await loadList();
  }
  function close() { overlay.classList.remove('open'); }

  if (trigger) trigger.addEventListener('click', (e) => { e.preventDefault(); open(); });
  closeBtn.addEventListener('click', close);
  backBtn.addEventListener('click', () => { showList(); loadList(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !currentOther) return;
    input.value = '';
    appendBubble(true, text);
    threadEl.scrollTop = threadEl.scrollHeight;
    const { ok } = await api(`/api/messages/${currentOther.userId}`, { method: 'POST', body: { body: text } });
    if (!ok) appendBubble(false, '（送信に失敗しました）');
  });

  // "相談する" CTA on a reel → open a chat with that breeder.
  document.querySelectorAll('[data-consult]').forEach(cta => {
    cta.addEventListener('click', async (e) => {
      e.preventDefault();
      const slide = cta.closest('[data-breeder-id]');
      const breederId = slide && slide.dataset.breederId;
      if (!breederId) return;
      if (!(await ensureAuth())) return;
      const { ok, data } = await api(`/api/messages/${breederId}`);
      if (!ok) { alert('このブリーダーにはまだ連絡できません。'); return; }
      overlay.classList.add('open');
      openThread({ userId: Number(breederId), name: data.other.name });
    });
  });

  mountQuickReplies(form, form, input, CUSTOMER_QUICKS);
  refreshBadge();
}

export function initMyPage() {
  const overlay = document.querySelector('[data-mypage-overlay]');
  if (!overlay) return;
  const trigger = document.querySelector('[data-mypage-trigger]');
  const closeBtn = overlay.querySelector('[data-mypage-close]');
  const bodyEl = overlay.querySelector('[data-mypage-body]');
  const titleEl = overlay.querySelector('[data-mypage-title]');

  function fieldHtml(label, name, value, opts = {}) {
    if (opts.textarea) {
      return `<div class="field"><label>${label}</label><textarea name="${name}" rows="3">${escapeHtml(value || '')}</textarea></div>`;
    }
    return `<div class="field"><label>${label}</label><input type="${opts.type || 'text'}" name="${name}" value="${attr(value)}" ${opts.attr || ''}></div>`;
  }

  function stat(num, label) {
    return `<div class="tt-prof__stat"><strong>${num}</strong><span>${label}</span></div>`;
  }

  function tile(r) {
    const media = r.imageUrl
      ? `<img src="${attr(r.imageUrl)}" alt="" loading="lazy">`
      : `<span class="tt-tile__emoji">${r.posterEmoji || '🐱'}</span>`;
    return `<a class="tt-tile" href="profile.html?id=${r.breederId}">${media}<span class="tt-tile__cap">${escapeHtml(r.caption || '')}</span></a>`;
  }

  // TikTok-style profile view.
  function renderProfile(user, data) {
    const isBreeder = user.role === 'breeder';
    const display = user.kennel || user.name || 'ユーザー';
    const handle = '@' + (user.email ? user.email.split('@')[0] : (user.name || 'mofubox'));
    const initial = escapeHtml(display.charAt(0));
    const bio = user.bio || (isBreeder ? '' : (user.breed_interest ? `気になる猫種：${user.breed_interest}` : ''));

    const items = isBreeder ? (data.mine || []) : (data.favs || []);
    const tabLabel = isBreeder ? '掲載した子' : 'きになる';
    const stats = isBreeder
      ? stat(items.length, '掲載') + stat(data.likes || 0, 'いいね') + stat(data.convos || 0, 'メッセージ')
      : stat(items.length, 'きになる') + stat(data.convos || 0, 'メッセージ') + stat(user.area ? '📍' : '—', user.area || 'エリア');

    const grid = items.length
      ? `<div class="tt-grid">${items.map(tile).join('')}</div>`
      : `<div class="tt-empty">
           <div class="tt-empty__ico">🐾</div>
           <div class="tt-empty__t">${isBreeder ? 'まだ掲載がありません' : 'まだ「きになる」がありません'}</div>
           <div class="tt-empty__s">${isBreeder ? 'ブリーダー管理から子猫を投稿しましょう' : 'リールで気になる子の ❤ を押すとここに集まります'}</div>
         </div>`;

    bodyEl.innerHTML = `
      <div class="tt-prof">
        <div class="tt-prof__avatar">${initial}</div>
        <div class="tt-prof__name">${escapeHtml(display)}${isBreeder ? '<span class="tt-prof__verified">✔</span>' : ''}</div>
        <div class="tt-prof__handle">${escapeHtml(handle)}</div>
        <div class="tt-prof__stats">${stats}</div>
        ${bio ? `<div class="tt-prof__bio">${escapeHtml(bio)}</div>` : ''}
        <div class="tt-prof__actions">
          <button type="button" class="tt-btn tt-btn--main" data-mypage-edit>プロフィールを編集</button>
          <button type="button" class="tt-btn" data-share data-share-url="/" data-share-text="MOFUBOXで気になる子猫を探せるよ🐱">シェア</button>
        </div>
        <div class="tt-prof__tabbar"><span class="active">${tabLabel}</span></div>
        ${grid}
        <a href="#" class="mypage__logout" data-mypage-logout>ログアウト</a>
      </div>`;

    if (titleEl) titleEl.textContent = 'プロフィール';
    bodyEl.querySelector('[data-mypage-edit]').addEventListener('click', () => renderEdit(user));
    bodyEl.querySelector('[data-mypage-logout]').addEventListener('click', async (e) => {
      e.preventDefault();
      await api('/api/auth/logout', { method: 'POST' });
      location.reload();
    });
  }

  // Editable form (reached via the 編集 button).
  function renderEdit(user) {
    const isBreeder = user.role === 'breeder';
    const fields = isBreeder
      ? fieldHtml('キャッテリー名', 'kennel', user.kennel)
        + fieldHtml('代表者名', 'name', user.name)
        + fieldHtml('電話番号', 'phone', user.phone, { type: 'tel' })
        + fieldHtml('住所', 'address', user.address)
        + fieldHtml('紹介文', 'bio', user.bio, { textarea: true })
      : fieldHtml('お名前', 'name', user.name)
        + fieldHtml('メールアドレス', '_email', user.email, { type: 'email', attr: 'disabled' })
        + fieldHtml('電話番号', 'phone', user.phone, { type: 'tel' })
        + fieldHtml('お住まいの地域', 'area', user.area)
        + fieldHtml('気になる猫種', 'breed_interest', user.breed_interest);

    bodyEl.innerHTML = `
      <form class="mypage" data-mypage-form>
        <button type="button" class="tt-back" data-mypage-back>← プロフィールに戻る</button>
        ${fields}
        <button type="submit" class="btn btn-coral btn-block">保存する</button>
        <div class="mypage__saved" data-mypage-saved></div>
      </form>`;
    if (titleEl) titleEl.textContent = 'プロフィールを編集';

    const form = bodyEl.querySelector('[data-mypage-form]');
    const saved = bodyEl.querySelector('[data-mypage-saved]');
    bodyEl.querySelector('[data-mypage-back]').addEventListener('click', () => open());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {};
      new FormData(form).forEach((v, k) => { if (!k.startsWith('_')) payload[k] = v; });
      const { ok } = await api('/api/auth/profile', { method: 'POST', body: payload });
      saved.textContent = ok ? '保存しました ✓' : '保存に失敗しました';
      if (ok) setTimeout(() => open(), 900);
    });
  }

  async function open() {
    const user = await ensureAuth();
    if (!user) return;
    overlay.classList.add('open');
    bodyEl.innerHTML = '<div class="notif-empty">読み込み中…</div>';
    // Pull stats/content in parallel.
    const [msgs, favs, mine] = await Promise.all([
      api('/api/messages'),
      user.role === 'breeder' ? Promise.resolve({ data: {} }) : api('/api/favorites'),
      user.role === 'breeder' ? api('/api/reels/mine') : Promise.resolve({ data: {} }),
    ]);
    const mineReels = (mine.data && mine.data.reels) || [];
    renderProfile(user, {
      convos: (msgs.data && msgs.data.conversations ? msgs.data.conversations.length : 0),
      favs: (favs.data && favs.data.reels) || [],
      mine: mineReels,
      likes: mineReels.reduce((s, r) => s + (r.likeCount || 0), 0),
    });
  }
  function close() { overlay.classList.remove('open'); }

  if (trigger) trigger.addEventListener('click', (e) => { e.preventDefault(); open(); });
  closeBtn.addEventListener('click', close);
}

// Breeder dashboard messaging (breeder.html view-messages): reply to customers.
export function initBreederMessages() {
  const listEl = document.querySelector('[data-bm-list]');
  if (!listEl) return;
  const windowEl = document.querySelector('[data-bm-window]');
  const emptyEl = windowEl.querySelector('[data-bm-empty]');
  const activeEl = windowEl.querySelector('[data-bm-active]');
  const headerEl = windowEl.querySelector('[data-bm-header]');
  const bodyEl = windowEl.querySelector('[data-bm-body]');
  const form = windowEl.querySelector('[data-bm-form]');
  const input = windowEl.querySelector('[data-bm-input]');
  const heading = document.querySelector('[data-bm-heading]');

  let currentOther = null;
  let loaded = false;

  async function loadList() {
    const { ok, data } = await api('/api/messages');
    if (!ok) return;
    const convs = data.conversations;
    if (heading) heading.textContent = `メッセージ${data.totalUnread ? `（未読 ${data.totalUnread}）` : ''}`;
    if (!convs.length) {
      listEl.className = 'notif-empty';
      listEl.textContent = 'まだお問い合わせはありません。お客様からメッセージが届くとここに表示されます。';
      return;
    }
    listEl.className = 'chat-list';
    listEl.innerHTML = '';
    convs.forEach(c => {
      const item = document.createElement('div');
      item.className = 'chat-list-item' + (currentOther && currentOther.userId === c.userId ? ' active' : '');
      const initial = escapeHtml((c.name || '?').charAt(0));
      item.innerHTML = `
        <div class="avatar avatar-sm mint" style="width:40px;height:40px;font-size:14px;">${initial}</div>
        <div class="chat-list-item__body">
          <div class="chat-list-item__top"><strong>${escapeHtml(c.name)}</strong><time>${timeLabel(c.lastAt)}</time></div>
          <p>${c.lastFromMe ? 'あなた: ' : ''}${escapeHtml(c.lastBody)}${c.unread ? `　・未読${c.unread}` : ''}</p>
        </div>`;
      item.addEventListener('click', () => openThread({ userId: c.userId, name: c.name }));
      listEl.appendChild(item);
    });
  }

  function appendRow(fromMe, body, at) {
    const row = document.createElement('div');
    row.className = 'chat-row' + (fromMe ? ' me' : '');
    const inner = document.createElement('div');
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = body;
    inner.appendChild(bubble);
    if (at) { const t = document.createElement('time'); t.textContent = timeLabel(at); inner.appendChild(t); }
    row.appendChild(inner);
    bodyEl.appendChild(row);
  }

  async function openThread(other) {
    currentOther = other;
    emptyEl.style.display = 'none';
    activeEl.style.display = 'flex';
    const initial = escapeHtml((other.name || '?').charAt(0));
    headerEl.innerHTML = `<div class="avatar avatar-md mint">${initial}</div><div><strong>${escapeHtml(other.name)}</strong><span>お客様とのメッセージ</span></div>`;
    bodyEl.innerHTML = '<div class="notif-empty">読み込み中…</div>';
    const { ok, data } = await api(`/api/messages/${other.userId}`);
    bodyEl.innerHTML = '';
    if (!ok) { bodyEl.innerHTML = '<div class="notif-empty">読み込めませんでした</div>'; return; }
    data.messages.forEach(m => appendRow(m.fromMe, m.body, m.at));
    bodyEl.scrollTop = bodyEl.scrollHeight;
    loadList();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !currentOther) return;
    input.value = '';
    appendRow(true, text, new Date().toISOString());
    bodyEl.scrollTop = bodyEl.scrollHeight;
    const { ok } = await api(`/api/messages/${currentOther.userId}`, { method: 'POST', body: { body: text } });
    if (ok) loadList();
  });

  async function loadAll() {
    if (loaded) return;
    const { data } = await api('/api/auth/me');
    if (!data.user || data.user.role !== 'breeder') return;
    loaded = true;
    loadList();
  }

  mountQuickReplies(form, form, input, BREEDER_QUICKS);
  loadAll();
  document.addEventListener('gate:unlocked', loadAll);
}
