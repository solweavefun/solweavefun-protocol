const nf = (o) => new Intl.NumberFormat('en-US', o);
export const DASH = '—';
export function fmtPrice(n) {
  if (!Number.isFinite(n)) return DASH;
  if (n >= 1000) return '$' + nf({ maximumFractionDigits: 0 }).format(n);
  if (n >= 1) return '$' + nf({ minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(n);
  if (n === 0) return '$0';
  const digits = Math.min(10, Math.max(4, 2 - Math.floor(Math.log10(Math.abs(n))) + 2));
  return '$' + n.toFixed(digits).replace(/0+$/, '');
}
export function fmtUsd(n) {
  if (!Number.isFinite(n)) return DASH;
  return '$' + nf({ notation: 'compact', maximumFractionDigits: 2 }).format(n);
}
export function fmtPct(n) {
  if (!Number.isFinite(n)) return DASH;
  return (n > 0 ? '+' : '') + nf({ maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(n) + '%';
}
export const fmtInt = (n) => (Number.isFinite(n) ? nf({ maximumFractionDigits: 0 }).format(Math.round(n)) : DASH);
export const letterOf = (s) => ((s || '?').trim()[0] || '?').toUpperCase();
export const shortAddr = (a) => (a && a.length > 12 ? a.slice(0, 4) + '…' + a.slice(-4) : a || DASH);
export const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
