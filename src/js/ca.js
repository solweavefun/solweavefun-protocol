// Click-to-copy for the contract-address bar. Inert (no handler) when the CA is not stated.
export function initCa() {
  const btn = document.getElementById('ca');
  if (!btn || btn.tagName !== 'BUTTON') return;
  const fb = btn.querySelector('.ca-feedback');
  let t;
  btn.addEventListener('click', async () => {
    const addr = btn.dataset.address;
    let ok = false;
    try { await navigator.clipboard.writeText(addr); ok = true; } catch {
      const ta = document.createElement('textarea'); ta.value = addr; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
    }
    fb.textContent = ok ? 'Copied' : 'Press Ctrl+C';
    btn.classList.toggle('is-copied', ok);
    clearTimeout(t);
    t = setTimeout(() => { fb.textContent = 'Copy'; btn.classList.remove('is-copied'); }, 1700);
  });
}
