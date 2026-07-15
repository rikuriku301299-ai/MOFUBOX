import { api } from './api.js';
import { escapeHtml, formatCount } from './utils.js';

const THEMES = ['coral', 'mint', 'gold', 'rose'];
const AVAIL = {
  available: { label: '受付中', cls: 'mint' },
  reserved: { label: '商談中', cls: 'gold' },
  adopted: { label: 'お迎え決定', cls: 'muted' },
};

export function availBadge(status) {
  const a = AVAIL[status] || AVAIL.available;
  return `<span class="reel-avail reel-avail--${a.cls}">${a.label}</span>`;
}

// Render the live feed from real breeder posts. When there are no posts yet
// (pre-launch), the hand-authored demo slides in reel.html are left in place so
// the page still looks alive. Returns true when real reels were rendered.
export async function initReelFeed() {
  const feed = document.querySelector('.reel-feed');
  if (!feed) return false;
  const { ok, data } = await api('/api/reels');
  if (!ok || !data.reels || !data.reels.length) return false;

  feed.innerHTML = data.reels.map((r, i) => {
    const theme = THEMES.includes(r.posterTheme) ? r.posterTheme : THEMES[i % THEMES.length];
    const kennel = r.breederKennel || r.breederName || 'ブリーダー';
    const initial = escapeHtml(kennel.charAt(0));
    const media = r.imageUrl
      ? `<img class="reel-slide__media" src="${escapeHtml(r.imageUrl)}" alt="${escapeHtml(kennel + 'の子猫')}" loading="lazy">`
      : r.videoUrl
      ? `<video class="reel-slide__media" src="${escapeHtml(r.videoUrl)}" muted loop playsinline preload="metadata"></video>`
      : `<div class="reel-slide__media illus illus-${theme}"><span class="emoji">${r.posterEmoji || '🐱'}</span></div>`;
    const tags = (r.tags || []).filter(Boolean).map(t => `<span>#${escapeHtml(t)}</span>`).join('');
    const liked = r.likedByMe ? ' liked' : '';
    const base = r.likeCount - (r.likedByMe ? 1 : 0);
    return `
      <article class="reel-slide" data-reel-id="${r.id}" data-breeder-id="${r.breederId}">
        ${media}
        <div class="reel-slide__shade"></div>
        <div class="reel-right">
          <div class="reel-right__avatar">
            <a href="profile.html?id=${r.breederId}" class="avatar avatar-lg ${theme}">${initial}</a>
            <button class="plus${r.followedByMe ? ' followed' : ''}" data-toggle-follow aria-label="フォローする">${r.followedByMe ? '✓' : '+'}</button>
          </div>
          <div class="reel-act${liked}" data-toggle-like>
            <button aria-label="いいねする">
              <span class="icon-circle"><svg class="icon" viewBox="0 0 24 24" width="28" height="28"><path d="M12 21s-6.7-4.3-9.4-8.3C.8 9.7 1.9 6 5.2 5 7.4 4.3 9.6 5.2 12 7.6 14.4 5.2 16.6 4.3 18.8 5c3.3 1 4.4 4.7 2.6 7.7C18.7 16.7 12 21 12 21z"/></svg></span>
              <span data-count data-base="${base}">${formatCount(r.likeCount)}</span>
            </button>
          </div>
          <div class="reel-act" data-toggle-save>
            <button>
              <span class="icon-circle"><svg class="icon" viewBox="0 0 24 24" width="26" height="26"><path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></span>
              <span>保存</span>
            </button>
          </div>
          <div class="reel-act" data-share data-share-url="/profile.html?id=${r.breederId}" data-share-text="${escapeHtml('MOFUBOXで見つけた' + kennel + 'の子猫🐱')}">
            <button aria-label="共有する">
              <span class="icon-circle"><svg class="icon" viewBox="0 0 24 24" width="26" height="26"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14"/></svg></span>
              <span>共有</span>
            </button>
          </div>
        </div>
        <div class="reel-bottom-info">
          <a href="profile.html?id=${r.breederId}" class="reel-bottom-info__breeder">
            <span class="verified"><svg class="icon" viewBox="0 0 24 24" width="15" height="15" fill="currentColor" stroke="none"><path d="M12 2 4 5v6c0 5 3.4 8.4 8 11 4.6-2.6 8-6 8-11V5l-8-3z"/><path d="m9 12 2 2 4-4" stroke="#fff" stroke-width="2" fill="none"/></svg></span>
            ${escapeHtml(kennel)} ${availBadge(r.availStatus)}
          </a>
          <div class="reel-bottom-info__cat">${escapeHtml(r.caption || '')}</div>
          <div class="reel-bottom-info__tags">${tags}</div>
          <a href="#" class="reel-bottom-info__cta" data-consult>
            チャットで相談する
            <svg class="icon" viewBox="0 0 24 24" width="14" height="14"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </a>
        </div>
      </article>`;
  }).join('');

  // Rebuild the progress dots to match the real number of reels.
  const progress = document.querySelector('.reel-progress');
  if (progress) {
    progress.innerHTML = data.reels.map((_, i) => `<i${i === 0 ? ' class="now"' : ''}><b></b></i>`).join('');
  }
  return true;
}

export function initReelActions() {
  const tabs = document.querySelectorAll('.reel-topbar__tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });
}

// Hydrate like/follow state + counts from the backend so a logged-in user
// sees their real, persisted state on page load.
export async function initReelData() {
  const slides = document.querySelectorAll('.reel-slide[data-reel-id]');
  if (!slides.length) return;

  const { ok, data } = await api('/api/reels');
  if (!ok) return;
  const byId = new Map(data.reels.map(r => [String(r.id), r]));

  slides.forEach(slide => {
    const reel = byId.get(slide.dataset.reelId);
    if (!reel) return;

    const likeBtn = slide.querySelector('[data-toggle-like]');
    if (likeBtn) {
      likeBtn.classList.toggle('liked', reel.likedByMe);
      const countEl = likeBtn.querySelector('[data-count]');
      if (countEl) {
        countEl.dataset.base = reel.likeCount - (reel.likedByMe ? 1 : 0);
        countEl.textContent = formatCount(reel.likeCount);
      }
    }

    const followBtn = slide.querySelector('[data-toggle-follow]');
    if (followBtn) {
      followBtn.classList.toggle('followed', reel.followedByMe);
      followBtn.textContent = reel.followedByMe ? '✓' : '+';
    }
  });
}

export function initLikeToggles() {
  document.querySelectorAll('[data-toggle-like]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const slide = btn.closest('[data-reel-id]');
      const countEl = btn.querySelector('[data-count]');

      if (slide) {
        const { ok, status, data } = await api(`/api/reels/${slide.dataset.reelId}/like`, { method: 'POST' });
        if (status === 401) { location.href = 'register.html'; return; }
        if (!ok) return;
        btn.classList.toggle('liked', data.liked);
        if (countEl) countEl.textContent = formatCount(data.count);
        return;
      }

      btn.classList.toggle('liked');
      if (!countEl) return;
      const base = parseInt(countEl.dataset.base, 10) || 0;
      countEl.textContent = formatCount(btn.classList.contains('liked') ? base + 1 : base);
    });
  });

  document.querySelectorAll('[data-toggle-save]').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('saved'));
  });

  document.querySelectorAll('[data-toggle-follow]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const slide = btn.closest('[data-breeder-id]');

      if (slide) {
        const { ok, status, data } = await api(`/api/users/${slide.dataset.breederId}/follow`, { method: 'POST' });
        if (status === 401) { location.href = 'register.html'; return; }
        if (!ok) return;
        btn.classList.toggle('followed', data.following);
        btn.textContent = data.following ? '✓' : '+';
        btn.setAttribute('aria-label', data.following ? 'フォロー中' : 'フォローする');
        return;
      }

      btn.classList.toggle('followed');
      const following = btn.classList.contains('followed');
      btn.textContent = following ? '✓' : '+';
      btn.setAttribute('aria-label', following ? 'フォロー中' : 'フォローする');
    });
  });
}

// TikTok-style one-at-a-time swipe feed. Slides are moved with an eased
// transform so wheel/touch/keyboard all advance exactly one slide at a time.
export function initReelSwipe() {
  const feed = document.querySelector('.reel-feed');
  if (!feed) return;
  const slides = Array.from(feed.querySelectorAll('.reel-slide'));
  const bars = document.querySelectorAll('.reel-progress i');
  const hint = document.querySelector('[data-swipe-hint]');
  let index = 0;
  let dragging = false;
  let dragStartY = 0;
  let dragY = 0;
  let dragStartTime = 0;

  function render() {
    slides.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === index);
      if (i === index) slide.style.transform = 'translateY(0)';
      else if (i < index) slide.style.transform = 'translateY(-100%)';
      else slide.style.transform = 'translateY(100%)';
    });
    bars.forEach((bar, i) => {
      bar.classList.remove('now', 'done');
      if (i < index) bar.classList.add('done');
      if (i === index) bar.classList.add('now');
    });
  }

  function goTo(newIndex) {
    newIndex = Math.max(0, Math.min(slides.length - 1, newIndex));
    const changed = newIndex !== index;
    index = newIndex;
    render();
    if (changed && hint) hint.classList.add('hide');
  }

  // One slide per gesture; debounced so a long trackpad scroll doesn't skip.
  let wheelLocked = false;
  feed.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (wheelLocked || Math.abs(e.deltaY) < 20) return;
    wheelLocked = true;
    goTo(index + (e.deltaY > 0 ? 1 : -1));
    setTimeout(() => { wheelLocked = false; }, 740);
  }, { passive: false });

  feed.addEventListener('touchstart', (e) => {
    dragging = true;
    dragStartY = e.touches[0].clientY;
    dragStartTime = Date.now();
    slides.forEach(s => { s.style.transition = 'none'; });
  }, { passive: true });

  feed.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    dragY = e.touches[0].clientY - dragStartY;
    const pct = (dragY / feed.clientHeight) * 100;
    slides.forEach((slide, i) => {
      if (i === index) slide.style.transform = `translateY(${pct}%)`;
      else if (i === index - 1) slide.style.transform = `translateY(${-100 + pct}%)`;
      else if (i === index + 1) slide.style.transform = `translateY(${100 + pct}%)`;
    });
  }, { passive: true });

  feed.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    slides.forEach(s => { s.style.transition = ''; });
    const elapsed = Math.max(Date.now() - dragStartTime, 1);
    const velocity = dragY / elapsed;
    // Lower sensitivity: you have to drag further (and flick faster) before the
    // feed commits to the next slide, so it feels like a real scroll rather than
    // snapping on the slightest swipe.
    const threshold = feed.clientHeight * 0.30;
    if (dragY <= -threshold || velocity < -0.9) goTo(index + 1);
    else if (dragY >= threshold || velocity > 0.9) goTo(index - 1);
    else render();
    dragY = 0;
  });

  document.addEventListener('keydown', (e) => {
    if (!document.querySelector('.reel-app')) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); goTo(index + 1); }
    if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); goTo(index - 1); }
  });

  slides.forEach(s => { s.style.transition = 'none'; });
  render();
  requestAnimationFrame(() => { slides.forEach(s => { s.style.transition = ''; }); });
}

export function initReelDoubleTapLike() {
  const feed = document.querySelector('.reel-feed');
  if (!feed) return;
  let lastTap = 0;

  feed.addEventListener('click', (e) => {
    if (e.target.closest('.reel-right, .reel-bottom-info, a, button')) return;
    const slide = e.target.closest('.reel-slide.is-active');
    if (!slide) return;

    const now = Date.now();
    if (now - lastTap < 300) {
      burstHeart(slide, e.clientX, e.clientY);
      const likeWrap = slide.querySelector('[data-toggle-like]');
      if (likeWrap && !likeWrap.classList.contains('liked')) likeWrap.click();
      lastTap = 0;
    } else {
      lastTap = now;
    }
  });
}

function burstHeart(slide, clientX, clientY) {
  const rect = slide.getBoundingClientRect();
  const heart = document.createElement('div');
  heart.className = 'tap-heart';
  heart.style.left = `${clientX - rect.left}px`;
  heart.style.top = `${clientY - rect.top}px`;
  heart.innerHTML = '<svg viewBox="0 0 24 24" width="84" height="84" fill="currentColor"><path d="M12 21s-6.7-4.3-9.4-8.3C.8 9.7 1.9 6 5.2 5 7.4 4.3 9.6 5.2 12 7.6 14.4 5.2 16.6 4.3 18.8 5c3.3 1 4.4 4.7 2.6 7.7C18.7 16.7 12 21 12 21z"/></svg>';
  slide.appendChild(heart);
  heart.addEventListener('animationend', () => heart.remove());
}

export function initReelSearch() {
  const triggers = document.querySelectorAll('[data-reel-search-trigger]');
  const overlay = document.querySelector('[data-reel-search]');
  if (!triggers.length || !overlay) return;

  const input = overlay.querySelector('[data-reel-search-input]');
  const closeBtn = overlay.querySelector('[data-reel-search-close]');
  const results = overlay.querySelector('[data-reel-search-results]');
  let debounceTimer = null;

  // Quick filter chips: tap a popular breed / area to search it instantly.
  const FILTERS = ['スコティッシュフォールド', 'マンチカン', 'ラグドール', 'ブリティッシュショートヘア', 'ノルウェージャン', '東京', '千葉', '神奈川'];
  if (!overlay.querySelector('.reel-filter-chips')) {
    const bar = document.createElement('div');
    bar.className = 'reel-filter-chips';
    bar.innerHTML = FILTERS.map(f => `<button type="button" class="reel-filter-chip">${escapeHtml(f)}</button>`).join('');
    input.insertAdjacentElement('afterend', bar);
    bar.querySelectorAll('.reel-filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        input.value = chip.textContent;
        input.dispatchEvent(new Event('input'));
      });
    });
  }

  triggers.forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      overlay.classList.add('open');
      input.focus();
    });
  });

  closeBtn.addEventListener('click', () => overlay.classList.remove('open'));

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (!q) {
      results.innerHTML = '<div class="notif-empty">気になるブリーダー名・猫種・地域・タグで検索してみましょう</div>';
      return;
    }
    debounceTimer = setTimeout(async () => {
      const { ok, data } = await api(`/api/search?q=${encodeURIComponent(q)}`);
      if (!ok) return;
      renderSearchResults(results, data.reels);
    }, 250);
  });
}

function renderSearchResults(container, reels) {
  if (!reels.length) {
    container.innerHTML = '<div class="notif-empty">該当するリールが見つかりませんでした</div>';
    return;
  }
  container.innerHTML = reels.map((r) => `
    <a class="reel-search-result" href="profile.html">
      <span class="reel-search-result__emoji">${r.posterEmoji || '🐱'}</span>
      <span>
        <strong>${escapeHtml(r.breederKennel || r.breederName || '')}</strong>
        <span class="reel-search-result__caption">${escapeHtml(r.caption || '')}</span>
        <span class="reel-search-result__tags">${(r.tags || []).map(t => `#${escapeHtml(t)}`).join(' ')}</span>
      </span>
    </a>
  `).join('');
}
