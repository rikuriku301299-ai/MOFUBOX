export const STATUS_DOT = {
  pending:   '<span class="status-dot pending">審査中</span>',
  approved:  '<span class="status-dot ok">承認済み</span>',
  rejected:  '<span class="status-dot danger">却下</span>',
  active:    '<span class="status-dot ok">有効</span>',
  suspended: '<span class="status-dot danger">停止中</span>',
};

export function formatCount(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

export function formatRegisterDate(iso) {
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return '—';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export function formatCountUpNumber(n, decimals, useComma) {
  const fixed = n.toFixed(decimals);
  if (!useComma) return fixed;
  const [intPart, decPart] = fixed.split('.');
  const withCommas = parseInt(intPart, 10).toLocaleString('en-US');
  return decPart ? `${withCommas}.${decPart}` : withCommas;
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function bumpHeadingCount(selector, addCount) {
  const el = document.querySelector(selector);
  if (!el) return;
  const match = el.textContent.match(/([\d,]+)/);
  if (!match) return;
  const updated = (parseInt(match[1].replace(/,/g, ''), 10) + addCount).toLocaleString('en-US');
  el.textContent = el.textContent.replace(match[1], updated);
}
