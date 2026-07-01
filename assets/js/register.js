import { api } from './api.js';
import { revealNow } from './animations.js';

export async function initRegisterPage() {
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
