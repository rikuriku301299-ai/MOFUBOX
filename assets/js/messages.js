import { api } from './api.js';
import { escapeHtml } from './utils.js';

// Escape for use inside a double-quoted HTML attribute (escapeHtml misses quotes).
function attr(s) { return escapeHtml(s == null ? '' : String(s)).replace(/"/g, '&quot;'); }

function timeLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
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
    if (!(await currentUser())) { location.href = 'register.html'; return; }
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
      if (!(await currentUser())) { location.href = 'register.html'; return; }
      const { ok, data } = await api(`/api/messages/${breederId}`);
      if (!ok) { alert('このブリーダーにはまだ連絡できません。'); return; }
      overlay.classList.add('open');
      openThread({ userId: Number(breederId), name: data.other.name });
    });
  });

  refreshBadge();
}

export function initMyPage() {
  const overlay = document.querySelector('[data-mypage-overlay]');
  if (!overlay) return;
  const trigger = document.querySelector('[data-mypage-trigger]');
  const closeBtn = overlay.querySelector('[data-mypage-close]');
  const bodyEl = overlay.querySelector('[data-mypage-body]');

  function fieldHtml(label, name, value, opts = {}) {
    if (opts.textarea) {
      return `<div class="field"><label>${label}</label><textarea name="${name}" rows="3">${escapeHtml(value)}</textarea></div>`;
    }
    return `<div class="field"><label>${label}</label><input type="${opts.type || 'text'}" name="${name}" value="${attr(value)}" ${opts.attr || ''}></div>`;
  }

  function render(user) {
    const initial = escapeHtml((user.kennel || user.name || '?').charAt(0));
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
        <div class="mypage__avatar">${initial}</div>
        <div class="mypage__role">${isBreeder ? 'ブリーダーアカウント' : 'お客様アカウント'}</div>
        ${fields}
        <button type="submit" class="btn btn-coral btn-block">保存する</button>
        <div class="mypage__saved" data-mypage-saved></div>
        <a href="#" class="mypage__logout" data-mypage-logout>ログアウト</a>
      </form>`;

    const form = bodyEl.querySelector('[data-mypage-form]');
    const saved = bodyEl.querySelector('[data-mypage-saved]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {};
      new FormData(form).forEach((v, k) => { if (!k.startsWith('_')) payload[k] = v; });
      const { ok } = await api('/api/auth/profile', { method: 'POST', body: payload });
      saved.textContent = ok ? '保存しました ✓' : '保存に失敗しました';
      if (ok) setTimeout(() => { saved.textContent = ''; }, 2500);
    });
    bodyEl.querySelector('[data-mypage-logout]').addEventListener('click', async (e) => {
      e.preventDefault();
      await api('/api/auth/logout', { method: 'POST' });
      location.reload();
    });
  }

  async function open() {
    const user = await currentUser();
    if (!user) { location.href = 'register.html'; return; }
    render(user);
    overlay.classList.add('open');
  }
  function close() { overlay.classList.remove('open'); }

  if (trigger) trigger.addEventListener('click', (e) => { e.preventDefault(); open(); });
  closeBtn.addEventListener('click', close);
}
