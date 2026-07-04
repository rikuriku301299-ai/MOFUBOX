import { formatCountUpNumber } from './utils.js';

export function initScrollReveal() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;

  const els = Array.from(document.querySelectorAll(
    '.feature-card, .step-card, .t-card, .faq-item, .section-head, .cta-band, ' +
    '.split > div, .lp-hero__inner > div, .stat-card, .cat-card, .report-card, ' +
    '.panel, .profile-reel-card, .profile-section, ' +
    // Also observe anything with a hardcoded `reveal` class in the HTML (e.g.
    // .breed-card, .kitten-stat) so it never gets stuck invisible.
    '.reveal'
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

  // Two-column hero/split sections slide in from opposite sides.
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

// Call after making a hidden container visible (e.g. dashboard tab switch,
// register form panel) so scroll-reveal fires immediately rather than waiting
// for an intersection event that may never come while the element was hidden.
export function revealNow(root) {
  if (!root) return;
  if (root.classList.contains('reveal')) root.classList.add('is-visible');
  root.querySelectorAll('.reveal:not(.is-visible)').forEach(el => el.classList.add('is-visible'));
}

export function initCountUp() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;

  const els = document.querySelectorAll(
    '.lp-hero__stat strong, .stat-card__value, .profile-stats strong, .split__badge strong'
  );
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
