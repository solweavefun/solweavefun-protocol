// Runtime view of the register. Every external fact is one record: stated | absent | unconfirmed.
// Only "stated" records are ever rendered live; everything else stays inert.
const node = document.getElementById('register');
export const reg = JSON.parse(node ? node.textContent : '{}');
export const isStated = (rec) => !!rec && rec.state === 'stated';
export const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
export const isAddressShaped = (s) => typeof s === 'string' && (SOL_RE.test(s) || EVM_RE.test(s));
export const handleFromUrl = (url) => {
  try { return new URL(url).pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || ''; } catch { return ''; }
};
export const ownAddress = () => (isStated(reg.ca) && isAddressShaped(reg.ca.value) ? reg.ca.value : null);
export const RM = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
