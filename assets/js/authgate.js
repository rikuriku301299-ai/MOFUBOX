import { api } from './api.js';

// In-context login instead of bouncing logged-out users to the registration
// page. ensureAuth() resolves with the user if signed in, otherwise opens a
// login sheet (with a link to register) and resolves once they log in — or
// null if they close it.
let resolveFn = null;
let overlay, form, emailEl, pwEl, errorEl;

function cache() {
  if (overlay) return true;
  overlay = document.querySelector('[data-auth-overlay]');
  if (!overlay) return false;
  form = overlay.querySelector('[data-auth-form]');
  emailEl = overlay.querySelector('[data-auth-email]');
  pwEl = overlay.querySelector('[data-auth-pw]');
  errorEl = overlay.querySelector('[data-auth-error]');
  return true;
}

function closeSheet(user) {
  if (overlay) overlay.classList.remove('open');
  const r = resolveFn; resolveFn = null;
  if (r) r(user || null);
}

export function initAuthGate() {
  if (!cache()) return;
  overlay.querySelector('[data-auth-close]').addEventListener('click', () => closeSheet(null));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';
    const { ok, data } = await api('/api/auth/login', {
      method: 'POST',
      body: { email: emailEl.value.trim(), password: pwEl.value },
    });
    if (ok && data.user) {
      pwEl.value = '';
      closeSheet(data.user);
    } else {
      errorEl.textContent = (data && data.message) || 'メールアドレスまたはパスワードが正しくありません。';
      errorEl.style.display = '';
    }
  });
}

export function ensureAuth() {
  return new Promise(async (resolve) => {
    const { data } = await api('/api/auth/me');
    if (data.user) return resolve(data.user);
    if (!cache()) { location.href = 'register.html'; return resolve(null); }
    resolveFn = resolve;
    if (errorEl) errorEl.style.display = 'none';
    overlay.classList.add('open');
    if (emailEl) emailEl.focus();
  });
}
