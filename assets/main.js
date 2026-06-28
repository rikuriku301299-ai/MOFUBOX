// MOFUBOX — shared interactivity for all prototype screens

document.addEventListener('DOMContentLoaded', () => {
  initPasswordGate();
  initDashboardNav();
  initReelActions();
  initLikeToggles();
  initReelSwipe();
  initReelDoubleTapLike();
  initSegmentedControls();
  initMobileNav();
});

// --- Password gate for admin.html / breeder.html (client-side only; a ---
// --- deterrent against casual visitors, not real auth) ---
const GATE_PASSWORD = 'rikuto1289';
const GATE_STORAGE_KEY = 'mofubox_gate_ok';

function initPasswordGate() {
  const overlay = document.querySelector('[data-gate]');
  if (!overlay) return;

  if (localStorage.getItem(GATE_STORAGE_KEY) === '1') {
    overlay.classList.add('unlocked');
    return;
  }

  const form = overlay.querySelector('[data-gate-form]');
  const input = overlay.querySelector('[data-gate-input]');
  const error = overlay.querySelector('[data-gate-error]');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value === GATE_PASSWORD) {
      localStorage.setItem(GATE_STORAGE_KEY, '1');
      overlay.classList.add('unlocked');
    } else {
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
      if (view) view.classList.add('active');

      const title = document.querySelector('[data-view-title]');
      const sub = document.querySelector('[data-view-sub]');
      const titleText = link.dataset.title || (sidebarMatch && sidebarMatch.dataset.title);
      const subText = link.dataset.sub || (sidebarMatch && sidebarMatch.dataset.sub);
      if (title && titleText) title.textContent = titleText;
      if (sub && subText) sub.textContent = subText;
    });
  });
}

// --- Reel screen: like / save toggle buttons ---
function initLikeToggles() {
  document.querySelectorAll('[data-toggle-like]').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('liked');
      const countEl = btn.querySelector('[data-count]');
      if (!countEl) return;
      const base = parseInt(countEl.dataset.base, 10) || 0;
      countEl.textContent = formatCount(btn.classList.contains('liked') ? base + 1 : base);
    });
  });

  document.querySelectorAll('[data-toggle-save]').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('saved'));
  });

  document.querySelectorAll('[data-toggle-follow]').forEach(btn => {
    btn.addEventListener('click', () => {
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
    setTimeout(() => { wheelLocked = false; }, 480);
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
          p.style.display = p.dataset.segValue === btn.dataset.segValue ? '' : 'none';
        });
      });
    });
  });
}

// --- Mobile nav toggle on the landing page ---
function initMobileNav() {
  const btn = document.querySelector('[data-mobile-menu-btn]');
  const menu = document.querySelector('[data-mobile-menu]');
  if (!btn || !menu) return;
  btn.addEventListener('click', () => menu.classList.toggle('open'));
}
