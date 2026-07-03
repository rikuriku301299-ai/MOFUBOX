import { api } from './api.js';

export function initLogout() {
  document.querySelectorAll('[data-logout]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api('/api/auth/logout', { method: 'POST' });
      location.reload();
    });
  });
}

// Login gate for admin.html / breeder.html — real per-account auth against
// the backend, session cookie based. Auto-unlocks if session is already valid.
export async function initPasswordGate() {
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

  function unlock(user) {
    overlay.classList.add('unlocked');
    // Signal data-loading modules (e.g. admin lists) that an authenticated
    // session is now available, so they can (re)load after login — not just
    // on initial page load when the user may still be at the gate.
    document.dispatchEvent(new CustomEvent('gate:unlocked', { detail: { user } }));
  }

  const { data: meData } = await api('/api/auth/me');
  if (roleAllowed(meData.user)) {
    unlock(meData.user);
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { ok, data } = await api('/api/auth/login', {
      method: 'POST',
      body: { email: emailInput.value, password: input.value },
    });
    if (ok && roleAllowed(data.user)) {
      unlock(data.user);
    } else {
      if (ok && data.user) await api('/api/auth/logout', { method: 'POST' });
      error.classList.add('show');
      input.value = '';
      input.focus();
    }
  });
}
