import { api } from './api.js';
import { escapeHtml } from './utils.js';

// Admin outreach: message all breeders (or one), and hold two-way conversations.
// Reuses the generic /api/messages endpoints — the admin is just another user,
// so replies from breeders show up here.
export function initAdminOutreach() {
  const view = document.querySelector('#view-outreach');
  if (!view) return;

  const targetSel = view.querySelector('[data-outreach-target]');
  const pickWrap = view.querySelector('[data-outreach-pick]');
  const breederSel = view.querySelector('[data-outreach-breeder]');
  const bodyEl = view.querySelector('[data-outreach-body]');
  const sendBtn = view.querySelector('[data-outreach-send]');
  const result = view.querySelector('[data-outreach-result]');

  const convos = view.querySelector('[data-outreach-convos]');
  const thread = view.querySelector('[data-outreach-thread]');
  const threadHead = view.querySelector('[data-outreach-thread-head]');
  const threadBody = view.querySelector('[data-outreach-thread-body]');
  const replyForm = view.querySelector('[data-outreach-reply]');
  const replyInput = view.querySelector('[data-outreach-reply-input]');

  let loaded = false;
  let openWith = null; // userId of the currently open thread

  function timeLabel(iso) {
    if (!iso) return '';
    const d = new Date(/[TZ]/.test(iso) ? iso : iso.replace(' ', 'T') + 'Z');
    return isNaN(d) ? '' : d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  targetSel.addEventListener('change', () => {
    pickWrap.style.display = targetSel.value === 'one' ? '' : 'none';
  });

  async function loadBreederOptions() {
    const { ok, data } = await api('/api/admin/breeders');
    if (!ok) return;
    breederSel.innerHTML = data.breeders.map(b =>
      `<option value="${b.id}">${escapeHtml(b.kennel || b.name || ('#' + b.id))}</option>`).join('');
  }

  sendBtn.addEventListener('click', async () => {
    const body = bodyEl.value.trim();
    if (!body) { showResult('メッセージを入力してください。', true); return; }
    const target = targetSel.value === 'one' ? breederSel.value : targetSel.value;
    sendBtn.disabled = true;
    const { ok, data } = await api('/api/admin/message-breeders', { method: 'POST', body: { target, body } });
    sendBtn.disabled = false;
    if (!ok) { showResult(data.message || '送信に失敗しました。', true); return; }
    showResult(data.sent > 0 ? `${data.sent}名のブリーダーに送信しました。` : '送信対象のブリーダーがいませんでした。', false);
    bodyEl.value = '';
    loadConversations();
  });

  function showResult(msg, isError) {
    result.textContent = msg;
    result.style.display = '';
    result.style.color = isError ? 'var(--coral-dark,#c0453e)' : 'var(--mint-darker,#1f8a6d)';
  }

  async function loadConversations() {
    const { ok, data } = await api('/api/messages');
    if (!ok) return;
    const list = data.conversations || [];
    if (!list.length) {
      convos.innerHTML = '<p style="font-size:13px;color:var(--ink-faint);margin:0;">まだやり取りはありません。上のフォームから連絡できます。</p>';
      return;
    }
    convos.innerHTML = list.map(c => `
      <button data-convo="${c.userId}" style="display:flex;width:100%;text-align:left;gap:10px;align-items:center;padding:10px 8px;border:0;background:none;border-bottom:1px solid var(--line);cursor:pointer;">
        <div class="avatar avatar-sm mint" style="width:34px;height:34px;font-size:12px;flex-shrink:0;">${escapeHtml((c.name || '?').charAt(0))}</div>
        <div style="min-width:0;flex:1;">
          <div style="font-weight:600;font-size:13.5px;display:flex;justify-content:space-between;gap:8px;">
            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(c.name)}</span>
            ${c.unread ? `<span style="background:var(--coral,#e8615a);color:#fff;border-radius:10px;font-size:11px;padding:0 7px;">${c.unread}</span>` : ''}
          </div>
          <div style="font-size:12px;color:var(--ink-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.lastFromMe ? '自分: ' : ''}${escapeHtml(c.lastBody || '')}</div>
        </div>
      </button>`).join('');
    convos.querySelectorAll('[data-convo]').forEach(btn => {
      btn.addEventListener('click', () => openThread(Number(btn.dataset.convo)));
    });
  }

  async function openThread(userId) {
    openWith = userId;
    const { ok, data } = await api(`/api/messages/${userId}`);
    if (!ok) return;
    thread.style.display = '';
    threadHead.textContent = data.other.name;
    threadBody.innerHTML = data.messages.map(m => `
      <div style="align-self:${m.fromMe ? 'flex-end' : 'flex-start'};max-width:80%;">
        <div style="padding:8px 12px;border-radius:12px;font-size:13px;line-height:1.5;white-space:pre-wrap;background:${m.fromMe ? 'var(--coral,#e8615a)' : '#fff'};color:${m.fromMe ? '#fff' : 'var(--ink)'};border:${m.fromMe ? '0' : '1px solid var(--line)'};">${escapeHtml(m.body)}</div>
        <div style="font-size:10.5px;color:var(--ink-faint);margin-top:2px;text-align:${m.fromMe ? 'right' : 'left'};">${timeLabel(m.at)}</div>
      </div>`).join('');
    threadBody.scrollTop = threadBody.scrollHeight;
    loadConversations(); // clears the unread badge
  }

  replyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = replyInput.value.trim();
    if (!text || !openWith) return;
    const { ok } = await api(`/api/messages/${openWith}`, { method: 'POST', body: { body: text } });
    if (ok) { replyInput.value = ''; openThread(openWith); }
  });

  async function init() {
    if (loaded) return;
    const { data: meData } = await api('/api/auth/me');
    if (!meData.user || meData.user.role !== 'admin') return;
    loaded = true;
    loadBreederOptions();
    loadConversations();
  }

  init();
  document.addEventListener('gate:unlocked', init);
}
