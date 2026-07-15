import { api } from './api.js';
import { revealNow } from './animations.js';

export function initDashboardNav() {
  const allLinks = document.querySelectorAll('[data-view-link]');
  if (!allLinks.length) return;
  const sidebarLinks = document.querySelectorAll('.dash-nav [data-view-link]');

  allLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.getAttribute('data-view-link');
      const sidebarMatch = document.querySelector(`.dash-nav [data-view-link="${target}"]`);

      sidebarLinks.forEach(l => l.classList.remove('active'));
      if (sidebarMatch) sidebarMatch.classList.add('active');

      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      const view = document.getElementById(target);
      if (view) { view.classList.add('active'); revealNow(view); }

      const title = document.querySelector('[data-view-title]');
      const sub = document.querySelector('[data-view-sub]');
      const titleText = link.dataset.title || (sidebarMatch && sidebarMatch.dataset.title);
      const subText = link.dataset.sub || (sidebarMatch && sidebarMatch.dataset.sub);
      if (title && titleText) title.textContent = titleText;
      if (sub && subText) sub.textContent = subText;
    });
  });
}

export function initDashboardSearch() {
  const input = document.querySelector('.dash-topbar .search-box input');
  if (!input) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    const activeView = document.querySelector('.view.active');
    if (!activeView) return;

    activeView.querySelectorAll('tbody tr').forEach((row) => {
      row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
    activeView.querySelectorAll('.t-card, .cat-card').forEach((card) => {
      card.style.display = !q || card.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

export function initReelUpload() {
  const form = document.querySelector('[data-reel-upload-form]');
  if (!form) return;

  const input = form.querySelector('[data-reel-video-input]');
  const trigger = form.querySelector('[data-reel-upload-trigger]');
  const label = form.querySelector('[data-reel-upload-label]');
  const captionInput = form.querySelector('[data-reel-caption]');
  const tagsInput = form.querySelector('[data-reel-tags]');
  const status = form.querySelector('[data-reel-upload-status]');
  const submitBtn = form.querySelector('[data-reel-submit]');
  const defaultLabel = label ? label.textContent : '';
  let selectedFile = null;

  const showStatus = (text, tone) => {
    if (!status) return;
    status.textContent = text;
    status.style.display = text ? 'block' : 'none';
    status.style.color = tone === 'error' ? 'var(--coral, #e8615a)' : tone === 'success' ? 'var(--mint, #2fa88a)' : '';
  };

  if (trigger && input) trigger.addEventListener('click', () => input.click());

  if (input) {
    input.addEventListener('change', () => {
      selectedFile = input.files && input.files[0] ? input.files[0] : null;
      if (label) label.textContent = selectedFile ? selectedFile.name : defaultLabel;
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const caption = captionInput ? captionInput.value.trim() : '';
      const tags = tagsInput ? tagsInput.value.split(',').map(s => s.trim()).filter(Boolean) : [];

      if (!selectedFile) { showStatus('写真か動画のファイルを選択してください', 'error'); return; }
      if (!caption) { showStatus('タイトル・キャプションを入力してください', 'error'); return; }

      const isImage = selectedFile.type.startsWith('image/');

      submitBtn.disabled = true;
      showStatus('投稿中…', null);

      try {
        const { ok, data } = await api('/api/reels', { method: 'POST', body: { caption, tags } });
        if (!ok || !data.id) {
          showStatus(data.message || '投稿に失敗しました', 'error');
          submitBtn.disabled = false;
          return;
        }

        // Photos and videos use their own upload endpoints; pick by file type.
        const endpoint = isImage ? `/api/reels/${data.id}/image` : `/api/reels/${data.id}/video`;
        const uploadRes = await fetch(endpoint, {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': selectedFile.type },
          body: selectedFile,
        });

        if (!uploadRes.ok) {
          let message = (isImage ? '写真' : '動画') + 'のアップロードに失敗しました';
          try { const errData = await uploadRes.json(); if (errData.message) message = errData.message; } catch { /* no body */ }
          showStatus(message, 'error');
          submitBtn.disabled = false;
          return;
        }

        showStatus('投稿しました！', 'success');
        if (captionInput) captionInput.value = '';
        if (tagsInput) tagsInput.value = '';
        if (input) input.value = '';
        selectedFile = null;
        if (label) label.textContent = defaultLabel;
      } catch {
        showStatus('通信エラーが発生しました', 'error');
      } finally {
        submitBtn.disabled = false;
      }
    });
  }
}
