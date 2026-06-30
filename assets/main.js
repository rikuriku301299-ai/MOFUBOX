// MOFUBOX — shared interactivity for all prototype screens

document.addEventListener('DOMContentLoaded', () => {
  initScrollReveal();
  initCountUp();
  initPasswordGate();
  initDashboardNav();
  initReelActions();
  initLikeToggles();
  initReelData();
  initReelSwipe();
  initReelDoubleTapLike();
  initSegmentedControls();
  initMobileNav();
  initRegisterPage();
  initRegistrationFeed();
  initProfileFollow();
  initReelUpload();
  initLogout();
});

// --- Thin fetch wrapper for the /api/* backend (server/index.js). Sends/ ---
// --- receives the session cookie automatically (same-origin). ---
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { ok: res.ok, status: res.status, data: data || {} };
}

function initLogout() {
  document.querySelectorAll('[data-logout]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api('/api/auth/logout', { method: 'POST' });
      location.reload();
    });
  });
}

// --- Login gate for admin.html / breeder.html — real per-account auth ---
// --- against the backend (server/index.js), session cookie based. ---
async function initPasswordGate() {
  const overlay = document.querySelector('[data-gate]');
  if (!overlay) return;

  const form = overlay.querySelector('[data-gate-form]');
  const requiredRole = form.dataset.gateRole;
  const emailInput = overlay.querySelector('[data-gate-email]');
  const input = overlay.querySelector('[data-gate-input]');
  const error = overlay.querySelector('[data-gate-error]');

  function roleAllowed(user) {
    if (!user || user.role !== requiredRole) return false;
    if (user.role === 'breeder' && user.status !== 'approved') return false;
    return true;
  }

  // Already have a valid session for this role? Skip straight in.
  const { data: meData } = await api('/api/auth/me');
  if (roleAllowed(meData.user)) {
    overlay.classList.add('unlocked');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { ok, data } = await api('/api/auth/login', {
      method: 'POST',
      body: { email: emailInput.value, password: input.value },
    });

    if (ok && roleAllowed(data.user)) {
      overlay.classList.add('unlocked');
    } else {
      if (ok && data.user) await api('/api/auth/logout', { method: 'POST' });
      error.classList.add('show');
      input.value = '';
      input.focus();
    }
  });
}

// --- Dashboard sidebar tab switching (breeder.html / admin.html) ---
// Any element with [data-view-link] can trigger a view switch (sidebar items,
// or shortcut buttons elsewhere on the page), but only sidebar items receive
// the visual "active" state.
function initDashboardNav() {
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

// --- Reel screen: hydrate like/follow state + counts from the backend so a ---
// --- logged-in user sees their real, persisted likes/follows on load. ---
async function initReelData() {
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

// --- Breeder dashboard: new reel upload form. Creates the reel record, ---
// --- then uploads the raw video file in a second request (real fetch, ---
// --- not the api() helper, since the body must be the raw file bytes). ---
function initReelUpload() {
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

  if (trigger && input) {
    trigger.addEventListener('click', () => input.click());
  }

  if (input) {
    input.addEventListener('change', () => {
      selectedFile = input.files && input.files[0] ? input.files[0] : null;
      if (label) label.textContent = selectedFile ? selectedFile.name : defaultLabel;
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const caption = captionInput ? captionInput.value.trim() : '';
      const tags = tagsInput
        ? tagsInput.value.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      if (!selectedFile) {
        showStatus('動画ファイルを選択してください', 'error');
        return;
      }
      if (!caption) {
        showStatus('タイトル・キャプションを入力してください', 'error');
        return;
      }

      submitBtn.disabled = true;
      showStatus('投稿中…', null);

      try {
        const { ok, data } = await api('/api/reels', { method: 'POST', body: { caption, tags } });
        if (!ok || !data.id) {
          showStatus(data.message || '投稿に失敗しました', 'error');
          submitBtn.disabled = false;
          return;
        }

        const uploadRes = await fetch(`/api/reels/${data.id}/video`, {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': selectedFile.type },
          body: selectedFile,
        });

        if (!uploadRes.ok) {
          let message = '動画のアップロードに失敗しました';
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

// --- Reel screen: like / save / follow toggle buttons. Persists to the ---
// --- backend when the slide carries data-reel-id/data-breeder-id (reel.html); ---
// --- otherwise degrades to a visual-only toggle. ---
function initLikeToggles() {
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
        return;
      }

      btn.classList.toggle('followed');
      btn.textContent = btn.classList.contains('followed') ? '✓' : '+';
    });
  });
}

function formatCount(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

// --- Reel screen: top tab switching (visual only) ---
function initReelActions() {
  const tabs = document.querySelectorAll('.reel-topbar__tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });
}

// --- Reel screen: TikTok-style one-at-a-time swipe feed ---
// Slides are stacked absolutely and moved with an eased transform instead of
// native scroll-snap, so wheel/touch/keyboard all advance exactly one slide
// at a time with the same smooth, controllable motion.
function initReelSwipe() {
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

  // Mouse wheel / trackpad — one slide per gesture, debounced so a long
  // trackpad scroll doesn't skip multiple slides at once.
  let wheelLocked = false;
  feed.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (wheelLocked || Math.abs(e.deltaY) < 8) return;
    wheelLocked = true;
    goTo(index + (e.deltaY > 0 ? 1 : -1));
    setTimeout(() => { wheelLocked = false; }, 1220);
  }, { passive: false });

  // Touch / pointer drag — the active slide (and its neighbor) follow the
  // finger 1:1, then either completes the swipe or springs back on release.
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
    const threshold = feed.clientHeight * 0.16;
    if (dragY <= -threshold || velocity < -0.55) goTo(index + 1);
    else if (dragY >= threshold || velocity > 0.55) goTo(index - 1);
    else render();
    dragY = 0;
  });

  document.addEventListener('keydown', (e) => {
    if (!document.querySelector('.reel-app')) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); goTo(index + 1); }
    if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); goTo(index - 1); }
  });

  // First paint: position slides instantly, no slide-in animation.
  slides.forEach(s => { s.style.transition = 'none'; });
  render();
  requestAnimationFrame(() => {
    slides.forEach(s => { s.style.transition = ''; });
  });
}

// --- Reel screen: double-tap-to-like with a heart-burst at the tap point ---
function initReelDoubleTapLike() {
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

// --- Site-wide scroll-triggered entrance animations for cards/sections ---
function initScrollReveal() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;

  const els = Array.from(document.querySelectorAll(
    '.feature-card, .step-card, .t-card, .faq-item, .section-head, .cta-band, ' +
    '.split > div, .lp-hero__inner > div, .stat-card, .cat-card, .report-card, ' +
    '.panel, .profile-reel-card, .profile-section'
  ));
  if (!els.length) return;

  const siblingIndex = new Map();
  els.forEach(el => {
    const parent = el.parentElement;
    const i = siblingIndex.get(parent) || 0;
    siblingIndex.set(parent, i + 1);
    el.classList.add('reveal');
    el.style.transitionDelay = `${Math.min(i, 6) * 70}ms`;
  });

  // Two-column hero/split sections slide in from opposite sides instead of
  // just fading up, since left/right framing reads better at that width.
  document.querySelectorAll('.split, .lp-hero__inner').forEach(wrap => {
    const children = Array.from(wrap.children).filter(c => c.classList.contains('reveal'));
    if (children.length === 2) {
      children[0].classList.add('reveal-left');
      children[1].classList.add('reveal-right');
    }
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      io.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  els.forEach(el => io.observe(el));
}

// Elements toggled in/out of `display:none` by other features (dashboard
// tabs, register form panels) never intersect while hidden, so the
// scroll-reveal observer above never fires for them — call this right after
// making such a container visible to reveal it (and its contents) instantly.
function revealNow(root) {
  if (!root) return;
  if (root.classList.contains('reveal')) root.classList.add('is-visible');
  root.querySelectorAll('.reveal:not(.is-visible)').forEach(el => el.classList.add('is-visible'));
}

// --- Animated count-up for stat numbers (hero stats, dashboard KPIs, etc) ---
function initCountUp() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;

  const els = document.querySelectorAll('.lp-hero__stat strong, .stat-card__value, .profile-stats strong, .split__badge strong');
  if (!els.length) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      animateCountUp(entry.target);
      io.unobserve(entry.target);
    });
  }, { threshold: 0.6 });

  els.forEach(el => io.observe(el));
}

function animateCountUp(el) {
  const original = el.textContent.trim();
  const match = original.match(/^(\D*)([\d,]+\.?\d*)(.*)$/);
  if (!match) return;
  const [, prefix, numStr, suffix] = match;
  const target = parseFloat(numStr.replace(/,/g, ''));
  if (isNaN(target)) return;
  const decimals = (numStr.split('.')[1] || '').length;
  const useComma = numStr.includes(',');
  const duration = 1100;
  const start = performance.now();

  function frame(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = prefix + formatCountUpNumber(target * eased, decimals, useComma) + suffix;
    if (p < 1) requestAnimationFrame(frame);
    else el.textContent = original;
  }
  requestAnimationFrame(frame);
}

function formatCountUpNumber(n, decimals, useComma) {
  const fixed = n.toFixed(decimals);
  if (!useComma) return fixed;
  const [intPart, decPart] = fixed.split('.');
  const withCommas = parseInt(intPart, 10).toLocaleString('en-US');
  return decPart ? `${withCommas}.${decPart}` : withCommas;
}

// --- Generic segmented control (pill tabs inside dashboard panels) ---
function initSegmentedControls() {
  document.querySelectorAll('.seg').forEach(seg => {
    const buttons = seg.querySelectorAll('button');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const groupName = seg.dataset.segGroup;
        if (!groupName) return;
        document.querySelectorAll(`[data-seg-panel="${groupName}"]`).forEach(p => {
          const show = p.dataset.segValue === btn.dataset.segValue;
          p.style.display = show ? '' : 'none';
          if (show) revealNow(p);
        });
      });
    });
  });
}

// --- profile.html: visual-only follow toggle for the breeder profile page ---
async function initProfileFollow() {
  const btn = document.querySelector('[data-toggle-follow-profile]');
  if (!btn) return;
  const defaultLabel = btn.textContent;
  const breederId = btn.dataset.breederId;

  function render(following) {
    btn.classList.toggle('is-following', following);
    btn.textContent = following ? 'フォロー中' : defaultLabel;
  }

  if (breederId) {
    const { ok, data } = await api('/api/reels');
    if (ok) {
      const mine = data.reels.find(r => String(r.breederId) === breederId);
      if (mine) render(mine.followedByMe);
    }
  }

  btn.addEventListener('click', async () => {
    if (!breederId) {
      render(!btn.classList.contains('is-following'));
      return;
    }
    const { ok, status, data } = await api(`/api/users/${breederId}/follow`, { method: 'POST' });
    if (status === 401) { location.href = 'register.html'; return; }
    if (ok) render(data.following);
  });
}

// --- Mobile nav toggle on the landing page ---
function initMobileNav() {
  const btn = document.querySelector('[data-mobile-menu-btn]');
  const menu = document.querySelector('[data-mobile-menu]');
  if (!btn || !menu) return;
  btn.addEventListener('click', () => menu.classList.toggle('open'));
}

// --- register.html: customer / breeder sign-up against the real backend ---
// --- (server/index.js); session cookie keeps the user signed in. ---
async function initRegisterPage() {
  const app = document.querySelector('[data-register-app]');
  const success = document.querySelector('[data-register-success]');
  if (!app || !success) return;

  const { data: meData } = await api('/api/auth/me');
  if (meData.user) {
    showRegisterSuccess(app, success, meData.user, true);
    return;
  }

  if (new URLSearchParams(location.search).get('as') === 'breeder') {
    const breederTab = document.querySelector('[data-seg-group="register-as"] [data-seg-value="breeder"]');
    if (breederTab) breederTab.click();
  }

  app.querySelectorAll('[data-register-form]').forEach(form => {
    const errorEl = form.querySelector('[data-register-error]') || (() => {
      const p = document.createElement('p');
      p.className = 'gate-error';
      p.style.cssText = 'display:none;color:var(--coral,#e8615a);font-size:13px;margin:-6px 0 14px;';
      p.dataset.registerError = '';
      form.querySelector('button[type=submit]').insertAdjacentElement('beforebegin', p);
      return p;
    })();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const role = form.dataset.registerForm;
      const payload = { role };
      new FormData(form).forEach((value, key) => { payload[key] = value; });
      if (payload.breed) { payload.breed_interest = payload.breed; delete payload.breed; }

      const submitBtn = form.querySelector('button[type=submit]');
      submitBtn.disabled = true;
      const { ok, data } = await api('/api/auth/register', { method: 'POST', body: payload });
      submitBtn.disabled = false;

      if (!ok) {
        errorEl.textContent = data.message || '登録に失敗しました。入力内容をご確認ください。';
        errorEl.style.display = '';
        return;
      }
      errorEl.style.display = 'none';
      showRegisterSuccess(app, success, data.user, false);
    });
  });
}

function showRegisterSuccess(app, success, user, isReturning) {
  app.style.display = 'none';
  success.style.display = '';
  revealNow(success);
  const title = success.querySelector('[data-register-success-title]');
  const message = success.querySelector('[data-register-success-message]');
  const cta = success.querySelector('[data-register-success-cta]');
  const name = user.role === 'breeder' ? (user.kennel || user.name) : user.name;

  if (user.role === 'breeder') {
    title.textContent = isReturning ? `おかえりなさい、${name}さん` : '登録が完了しました！';
    message.textContent = isReturning
      ? `ブリーダー登録は完了しています（審査状況：${user.status === 'approved' ? '承認済み' : user.status === 'rejected' ? '却下' : '審査中'}）。`
      : 'ご登録ありがとうございます。運営チームが内容を確認のうえ、ご連絡いたします。';
    cta.textContent = 'MOFUBOXトップに戻る';
    cta.href = 'index.html';
  } else {
    title.textContent = isReturning ? `おかえりなさい、${name}さん` : '登録が完了しました！';
    message.textContent = isReturning
      ? 'ご登録は完了しています。さっそく気になる子猫を探してみましょう。'
      : 'ご登録ありがとうございます。さっそくリールで気になる子猫を探してみましょう。';
    cta.textContent = 'リールを見てみる';
    cta.href = 'reel.html';
  }
}

// --- admin.html: surface real pending breeder applications / customers ---
// --- from the backend into the existing breeder / user tables, with ---
// --- working approve / reject buttons wired to /api/admin/*. ---
async function initRegistrationFeed() {
  const breedersTable = document.querySelector('#view-breeders tbody');
  const usersTable = document.querySelector('#view-users tbody');
  if (!breedersTable && !usersTable) return;

  const { data: meData } = await api('/api/auth/me');
  if (!meData.user || meData.user.role !== 'admin') return;

  if (breedersTable) {
    const { ok: bOk, data } = await api('/api/admin/breeders');
    if (bOk) {
      data.breeders.slice().reverse().forEach(b => breedersTable.prepend(buildBreederRow(b)));
      if (data.breeders.length) bumpHeadingCount('#view-breeders .panel-head h3', data.breeders.length);
    }
  }

  if (usersTable) {
    const { ok: uOk, data } = await api('/api/admin/customers');
    if (uOk) {
      data.customers.slice().reverse().forEach(c => usersTable.prepend(buildCustomerRow(c)));
      if (data.customers.length) bumpHeadingCount('#view-users .panel-head h3', data.customers.length);
    }
  }
}

const STATUS_DOT = {
  pending: '<span class="status-dot pending">審査中</span>',
  approved: '<span class="status-dot ok">承認済み</span>',
  rejected: '<span class="status-dot danger">却下</span>',
  active: '<span class="status-dot ok">有効</span>',
};

function buildBreederRow(b) {
  const tr = document.createElement('tr');
  const initial = escapeHtml((b.kennel || b.name || '?').charAt(0));
  tr.dataset.breederId = b.id;
  tr.innerHTML = `
    <td><div class="t-row-title"><div class="avatar avatar-sm mint" style="width:36px;height:36px;font-size:13px;">${initial}</div><div><strong>${escapeHtml(b.kennel || '')}</strong><span>${escapeHtml(b.address || '')}</span></div></div></td>
    <td>${formatRegisterDate(b.created_at)}</td><td class="t-num">0</td><td class="t-num">—</td>
    <td data-status-cell>${STATUS_DOT[b.status] || STATUS_DOT.pending}</td>
    <td><div class="row-actions">${b.status === 'pending'
      ? '<button class="approve" data-admin-action="approve" aria-label="承認"><svg class="icon" viewBox="0 0 24 24" width="15" height="15"><polyline points="20 6 9 17 4 12"/></svg></button><button class="reject" data-admin-action="reject" aria-label="却下"><svg class="icon" viewBox="0 0 24 24" width="15" height="15"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>'
      : '<button aria-label="詳細"><svg class="icon" viewBox="0 0 24 24" width="15" height="15"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>'}</div></td>
  `;
  tr.querySelectorAll('[data-admin-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const decision = btn.dataset.adminAction;
      const { ok, data } = await api(`/api/admin/breeders/${b.id}/${decision}`, { method: 'POST' });
      if (!ok) return;
      const cell = tr.querySelector('[data-status-cell]');
      cell.innerHTML = STATUS_DOT[data.status] || '';
      tr.querySelector('.row-actions').innerHTML = '<button aria-label="詳細"><svg class="icon" viewBox="0 0 24 24" width="15" height="15"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>';
    });
  });
  return tr;
}

function buildCustomerRow(c) {
  const tr = document.createElement('tr');
  const initial = escapeHtml((c.name || '?').charAt(0));
  tr.innerHTML = `
    <td><div class="t-row-title"><div class="avatar avatar-sm mint" style="width:36px;height:36px;font-size:13px;">${initial}</div><div><strong>${escapeHtml(c.name || '')} 様</strong><span>${escapeHtml(c.area || '新規登録')}</span></div></div></td>
    <td>${formatRegisterDate(c.created_at)}</td><td class="t-num">0</td><td class="t-num">0</td>
    <td>${STATUS_DOT.active}</td>
    <td><div class="row-actions"><button aria-label="詳細"><svg class="icon" viewBox="0 0 24 24" width="15" height="15"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button></div></td>
  `;
  return tr;
}

function formatRegisterDate(iso) {
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return '—';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function bumpHeadingCount(selector, addCount) {
  const el = document.querySelector(selector);
  if (!el) return;
  const match = el.textContent.match(/([\d,]+)/);
  if (!match) return;
  const updated = (parseInt(match[1].replace(/,/g, ''), 10) + addCount).toLocaleString('en-US');
  el.textContent = el.textContent.replace(match[1], updated);
}
