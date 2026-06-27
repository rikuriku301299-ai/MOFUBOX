// MOFUBOX — shared interactivity for all prototype screens

document.addEventListener('DOMContentLoaded', () => {
  initDashboardNav();
  initReelActions();
  initLikeToggles();
  initSegmentedControls();
  initMobileNav();
});

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

// --- Reel screen: progress bar + tab switching (visual only) ---
function initReelActions() {
  const tabs = document.querySelectorAll('.reel-topbar__tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  const feed = document.querySelector('.reel-feed');
  if (!feed) return;
  const slides = feed.querySelectorAll('.reel-slide');
  const bars = document.querySelectorAll('.reel-progress i');
  if (!bars.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const idx = Array.from(slides).indexOf(entry.target);
        bars.forEach((bar, i) => {
          bar.classList.remove('now', 'done');
          if (i < idx) bar.classList.add('done');
          if (i === idx) bar.classList.add('now');
        });
      }
    });
  }, { root: feed, threshold: 0.6 });

  slides.forEach(s => observer.observe(s));
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
