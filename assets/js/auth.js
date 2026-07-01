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
