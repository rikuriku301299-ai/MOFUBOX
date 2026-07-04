import { revealNow } from './animations.js';

// Photo cards (breed cards, etc.) show a real photo when one is present and
// gracefully fall back to the emoji sitting behind it if the image is missing
// or fails to load. Handles images that already errored before this ran.
export function initPhotoFallbacks() {
  document.querySelectorAll('[data-photo] img').forEach(img => {
    const drop = () => img.remove();
    if (img.complete && img.naturalWidth === 0) drop();
    else img.addEventListener('error', drop);
  });
}

export function initSegmentedControls() {
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

export function initMobileNav() {
  const btn = document.querySelector('[data-mobile-menu-btn]');
  const menu = document.querySelector('[data-mobile-menu]');
  if (!btn || !menu) return;
  btn.addEventListener('click', () => menu.classList.toggle('open'));
}
