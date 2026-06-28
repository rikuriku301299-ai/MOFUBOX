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
  initRegisterPage();
  initRegistrationFeed();
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

// --- register.html: customer / breeder sign-up (client-side only; data ---
// --- lives in this browser's localStorage, there is no real backend) ---
const REGISTER_MEMBER_KEY = 'mofubox_member';

function initRegisterPage() {
  const app = document.querySelector('[data-register-app]');
  const success = document.querySelector('[data-register-success]');
  if (!app || !success) return;

  const existing = JSON.parse(localStorage.getItem(REGISTER_MEMBER_KEY) || 'null');
  if (existing) {
    showRegisterSuccess(app, success, existing, true);
    return;
  }

  if (new URLSearchParams(location.search).get('as') === 'breeder') {
    const breederTab = document.querySelector('[data-seg-group="register-as"] [data-seg-value="breeder"]');
    if (breederTab) breederTab.click();
  }

  app.querySelectorAll('[data-register-form]').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const role = form.dataset.registerForm;
      const data = { role, submittedAt: new Date().toISOString() };
      new FormData(form).forEach((value, key) => { data[key] = value; });

      localStorage.setItem(REGISTER_MEMBER_KEY, JSON.stringify(data));
      const listKey = role === 'breeder' ? 'mofubox_breeder_registrations' : 'mofubox_customer_registrations';
      const list = JSON.parse(localStorage.getItem(listKey) || '[]');
      list.push(data);
      localStorage.setItem(listKey, JSON.stringify(list));

      showRegisterSuccess(app, success, data, false);
    });
  });
}

function showRegisterSuccess(app, success, data, isReturning) {
  app.style.display = 'none';
  success.style.display = '';
  const title = success.querySelector('[data-register-success-title]');
  const message = success.querySelector('[data-register-success-message]');
  const cta = success.querySelector('[data-register-success-cta]');
  const name = data.role === 'breeder' ? (data.kennel || data.name) : data.name;

  if (data.role === 'breeder') {
    title.textContent = isReturning ? `おかえりなさい、${name}さん` : '登録が完了しました！';
    message.textContent = isReturning
      ? 'ブリーダー登録は完了しています。審査結果はご登録のメールアドレスにご連絡します。'
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

// --- admin.html: surface register.html sign-ups in the existing breeder / ---
// --- user tables (same-browser only, since this prototype has no backend) ---
function initRegistrationFeed() {
  const breedersTable = document.querySelector('#view-breeders tbody');
  const usersTable = document.querySelector('#view-users tbody');
  if (!breedersTable && !usersTable) return;

  if (breedersTable) {
    const regs = JSON.parse(localStorage.getItem('mofubox_breeder_registrations') || '[]');
    regs.slice().reverse().forEach(reg => breedersTable.prepend(buildBreederRow(reg)));
    if (regs.length) bumpHeadingCount('#view-breeders .panel-head h3', regs.length);
  }

  if (usersTable) {
    const regs = JSON.parse(localStorage.getItem('mofubox_customer_registrations') || '[]');
    regs.slice().reverse().forEach(reg => usersTable.prepend(buildCustomerRow(reg)));
    if (regs.length) bumpHeadingCount('#view-users .panel-head h3', regs.length);
  }
}

function buildBreederRow(reg) {
  const tr = document.createElement('tr');
  const initial = escapeHtml((reg.kennel || reg.name || '?').charAt(0));
  tr.innerHTML = `
    <td><div class="t-row-title"><div class="avatar avatar-sm mint" style="width:36px;height:36px;font-size:13px;">${initial}</div><div><strong>${escapeHtml(reg.kennel || '')}</strong><span>${escapeHtml(reg.address || '')}</span></div></div></td>
    <td>${formatRegisterDate(reg.submittedAt)}</td><td class="t-num">0</td><td class="t-num">—</td>
    <td><span class="status-dot pending">審査中</span></td>
    <td><div class="row-actions"><button class="approve" aria-label="承認"><svg class="icon" viewBox="0 0 24 24" width="15" height="15"><polyline points="20 6 9 17 4 12"/></svg></button><button class="reject" aria-label="却下"><svg class="icon" viewBox="0 0 24 24" width="15" height="15"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div></td>
  `;
  return tr;
}

function buildCustomerRow(reg) {
  const tr = document.createElement('tr');
  const initial = escapeHtml((reg.name || '?').charAt(0));
  tr.innerHTML = `
    <td><div class="t-row-title"><div class="avatar avatar-sm mint" style="width:36px;height:36px;font-size:13px;">${initial}</div><div><strong>${escapeHtml(reg.name || '')} 様</strong><span>${escapeHtml(reg.area || '新規登録')}</span></div></div></td>
    <td>${formatRegisterDate(reg.submittedAt)}</td><td class="t-num">0</td><td class="t-num">0</td>
    <td><span class="status-dot ok">有効</span></td>
    <td><div class="row-actions"><button aria-label="詳細"><svg class="icon" viewBox="0 0 24 24" width="15" height="15"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button><button class="reject" aria-label="利用停止"><svg class="icon" viewBox="0 0 24 24" width="15" height="15"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg></button></div></td>
  `;
  return tr;
}

function formatRegisterDate(iso) {
  const d = new Date(iso);
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
