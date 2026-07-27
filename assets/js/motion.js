// Bespoke motion layer for the landing page. Everything here is opt-in per
// capability: coarse-pointer (touch) devices and users who ask for reduced
// motion get a calm page — no cursor ring, magnetics or tilt, and the kinetic
// headline simply appears. Scoped to body.lp-editorial so the in-app screens
// (reel / breeder / admin) are never touched.

export function initMotion() {
  if (!document.body.classList.contains('lp-editorial')) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(pointer: fine)').matches;

  scrollProgress();
  kineticHeroTitle(reduce);

  if (reduce) return;

  heroParallax();
  if (fine) {
    cursorRing();
    magneticButtons();
    cardTilt();
  }
}

// ---- Thin scroll-progress line pinned to the top of the viewport ----------
function scrollProgress() {
  const bar = document.createElement('div');
  bar.className = 'scroll-prog';
  document.body.appendChild(bar);
  let ticking = false;
  const update = () => {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    const p = h > 0 ? window.scrollY / h : 0;
    bar.style.transform = `scaleX(${Math.max(0, Math.min(1, p))})`;
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }, { passive: true });
  update();
}

// ---- Hero headline rises in per character with a blur/rotate settle --------
function kineticHeroTitle(reduce) {
  const el = document.querySelector('.hero-e__title');
  if (!el) return;

  // Rebuild the title, wrapping each visible glyph in a <span> while keeping
  // <br> line breaks and whitespace intact.
  const nodes = Array.from(el.childNodes);
  el.textContent = '';
  let i = 0;
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      for (const ch of node.textContent) {
        if (ch === ' ' || ch === '\n') { el.appendChild(document.createTextNode(ch)); continue; }
        const s = document.createElement('span');
        s.className = 'kw';
        s.textContent = ch;
        s.style.setProperty('--i', i++);
        el.appendChild(s);
      }
    } else if (node.nodeName === 'BR') {
      el.appendChild(document.createElement('br'));
    } else {
      el.appendChild(node);
    }
  }

  if (reduce) return; // glyphs are wrapped but stay fully visible

  // Arm (hide) then reveal on the next frames. `.kinetic-in` is the resting
  // style, so even an interrupted transition ends on "visible". A safety timer
  // guarantees the reveal fires no matter what.
  requestAnimationFrame(() => {
    el.classList.add('kinetic-armed');
    requestAnimationFrame(() => el.classList.add('kinetic-in'));
  });
  setTimeout(() => el.classList.add('kinetic-in'), 500);
}

// ---- Hero copy drifts up and fades as you scroll past it -------------------
function heroParallax() {
  const content = document.querySelector('.hero-e__content');
  if (!content) return;
  let ticking = false;
  const update = () => {
    const y = window.scrollY;
    if (y < 700) {
      content.style.transform = `translateY(${y * 0.22}px)`;
      content.style.opacity = String(Math.max(0, 1 - y / 620));
    }
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }, { passive: true });
}

// ---- A soft ring that lags behind the cursor and swells over targets -------
function cursorRing() {
  const ring = document.createElement('div');
  ring.className = 'cursor-ring';
  document.body.appendChild(ring);
  document.body.classList.add('has-cursor-ring');

  let x = window.innerWidth / 2, y = window.innerHeight / 2;
  let rx = x, ry = y;
  window.addEventListener('mousemove', (e) => { x = e.clientX; y = e.clientY; }, { passive: true });

  const hot = 'a, button, .btn, summary, input, textarea, [role="button"]';
  document.addEventListener('mouseover', (e) => {
    if (e.target.closest && e.target.closest(hot)) ring.classList.add('is-hot');
  }, true);
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest && e.target.closest(hot)) ring.classList.remove('is-hot');
  }, true);
  window.addEventListener('mouseleave', () => ring.classList.add('is-gone'), { passive: true });
  window.addEventListener('mouseenter', () => ring.classList.remove('is-gone'), { passive: true });

  (function loop() {
    rx += (x - rx) * 0.18;
    ry += (y - ry) * 0.18;
    ring.style.transform = `translate(${rx}px, ${ry}px)`;
    requestAnimationFrame(loop);
  })();
}

// ---- Primary CTAs pull slightly toward the cursor ("magnetic") -------------
function magneticButtons() {
  document.querySelectorAll('.btn-hero, .cta-band__actions .btn, [data-magnetic]').forEach((btn) => {
    btn.addEventListener('mousemove', (e) => {
      const r = btn.getBoundingClientRect();
      const mx = e.clientX - (r.left + r.width / 2);
      const my = e.clientY - (r.top + r.height / 2);
      btn.style.transform = `translate(${mx * 0.25}px, ${my * 0.4}px)`;
    });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
  });
}

// ---- Cards tip toward the cursor in 3D --------------------------------------
function cardTilt() {
  document.querySelectorAll('.cat-card, .breed-card, .feature-card').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(760px) rotateX(${-py * 5.5}deg) rotateY(${px * 5.5}deg) translateY(-6px)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  });
}
