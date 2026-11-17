// Solweave build: src/ -> dist/ (no bundler). Exits non-zero on any failed build gate.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { palette, tokensCss } from '../src/tokens.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : def; };
const OUT = path.resolve(arg('--out', path.join(root, 'dist')));
const REG = path.resolve(arg('--register', path.join(root, 'src/register.json')));
const SRC = path.resolve(arg('--src', path.join(root, 'src')));
const LOGO_SRC = path.join(root, 'brand', 'LOGO WEAVE PNG...png'); // the true RGBA logo (colortype 6, transparent field)
const BANNER_SRC = path.join(root, 'reference', 'SAMPUL WEAVE JPG.jpg.jpeg');

const fail = (m) => { console.error('BUILD GATE FAILED: ' + m); process.exit(1); };
const gates = [];
const gate = (name, ok, detail = '') => { gates.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) fail(name); };

// ---- register ----
const reg = JSON.parse(fs.readFileSync(REG, 'utf8'));
const STATES = new Set(['stated', 'absent', 'unconfirmed']);
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
const isAddr = (s) => typeof s === 'string' && (SOL_RE.test(s) || EVM_RE.test(s));
for (const [k, r] of Object.entries(reg)) gate(`register.${k} has a valid state`, STATES.has(r.state), r.state);
if (reg.ca.state === 'stated') gate('register.ca value is address-shaped', isAddr(reg.ca.value));
const stated = (r) => r && r.state === 'stated';
const caOn = stated(reg.ca) && isAddr(reg.ca.value);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const handleOf = (u) => { try { return new URL(u).pathname.replace(/^\/+|\/+$/g, '').split('/')[0]; } catch { return ''; } };

// ---- clean ----
fs.rmSync(OUT, { recursive: true, force: true });
for (const d of ['css', 'js', 'assets']) fs.mkdirSync(path.join(OUT, d), { recursive: true });

// ---- static copy ----
fs.writeFileSync(path.join(OUT, 'css/tokens.css'), tokensCss());
fs.copyFileSync(path.join(SRC, 'css/styles.css'), path.join(OUT, 'css/styles.css'));
for (const f of fs.readdirSync(path.join(SRC, 'js'))) fs.copyFileSync(path.join(SRC, 'js', f), path.join(OUT, 'js', f));

// ---- assets: premultiplied resize of the RGBA logo, then explicit copy into dist/assets ----
const { data: aRaw, info } = await sharp(LOGO_SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
  if (aRaw[(y * info.width + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
}
const side = Math.max(x1 - x0, y1 - y0) + 1, pad = Math.round(side * 0.04);
const cx = Math.round((x0 + x1) / 2), cy = Math.round((y0 + y1) / 2), half = Math.round(side / 2) + pad;
const box = { left: Math.max(0, cx - half), top: Math.max(0, cy - half), width: Math.min(info.width, half * 2), height: Math.min(info.height, half * 2) };
const cropped = await sharp(LOGO_SRC).ensureAlpha().extract(box).png().toBuffer();
// Pure-black RGB lives under alpha 0. Resizing straight RGBA would bleed black into edges, so premultiply first.
async function premultResize(buf, size) {
  const { data, info: i } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let p = 0; p < data.length; p += 4) { const a = data[p + 3] / 255; data[p] = Math.round(data[p] * a); data[p + 1] = Math.round(data[p + 1] * a); data[p + 2] = Math.round(data[p + 2] * a); }
  const small = await sharp(data, { raw: { width: i.width, height: i.height, channels: 4 } }).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  const d = small.data;
  for (let p = 0; p < d.length; p += 4) { const a = d[p + 3] / 255; if (a > 0) { d[p] = Math.min(255, Math.round(d[p] / a)); d[p + 1] = Math.min(255, Math.round(d[p + 1] / a)); d[p + 2] = Math.min(255, Math.round(d[p + 2] / a)); } }
  return { png: await sharp(d, { raw: { width: size, height: size, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer(), raw: d };
}
const logo = await premultResize(cropped, 512);
fs.writeFileSync(path.join(OUT, 'assets/logo.png'), logo.png);
let sum = 0, cnt = 0;
for (let p = 0; p < logo.raw.length; p += 4) if (logo.raw[p + 3] > 200) { sum += (logo.raw[p] + logo.raw[p + 1] + logo.raw[p + 2]) / 3; cnt++; }
gate('logo resize has no black fringe (mean opaque RGB >= 235)', cnt > 1000 && sum / cnt >= 235, `mean ${(sum / cnt).toFixed(1)} over ${cnt}px`);

await sharp(BANNER_SRC).resize(1500, 500, { fit: 'cover' }).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(OUT, 'assets/banner.jpg'));

// ---- favicon: 32x32 SVG traced from the real alpha pixel grid of the logo ----
const GRID = 28, OFF = 2;
const alpha = await sharp(cropped).ensureAlpha().extractChannel(3).resize(GRID, GRID, { fit: 'fill', kernel: 'cubic' }).raw().toBuffer();
let rects = '';
for (let y = 0; y < GRID; y++) {
  let x = 0;
  while (x < GRID) {
    if (alpha[y * GRID + x] >= 100) { let w = 0; while (x + w < GRID && alpha[y * GRID + x + w] >= 100) w++; rects += `M${x + OFF} ${y + OFF}h${w}v1h-${w}z`; x += w; } else x++;
  }
}
const fav = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><rect width="32" height="32" rx="7" fill="${palette.bg}"/><path fill="${palette.ink}" shape-rendering="crispEdges" d="${rects}"/></svg>\n`;
fs.writeFileSync(path.join(OUT, 'favicon.svg'), fav);

// ---- html ----
const X_PATH = 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z';
const GH_PATH = 'M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z';
const icon = (vb, d) => `<svg viewBox="${vb}" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
const social = (rec, label, vb, d) => stated(rec) && rec.url
  ? `<a class="social" href="${esc(rec.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(label)} (@${esc(handleOf(rec.url))})">${icon(vb, d)}</a>`
  : `<span class="social is-inert" role="img" aria-disabled="true" aria-label="${esc(label)} not available yet">${icon(vb, d)}</span>`;
const socials = social(reg.x, 'Solweave on X', '0 0 24 24', X_PATH) + social(reg.github, 'Solweave on GitHub', '0 0 16 16', GH_PATH);
const COPY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="1.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
const caSlot = caOn
  ? `<button class="ca" id="ca" type="button" data-address="${esc(reg.ca.value)}" aria-label="Copy token address ${esc(reg.ca.value)}"><span class="ca-tag">CA</span><span class="ca-value">${esc(reg.ca.value)}</span><span class="ca-action">${COPY_SVG}<span class="ca-feedback" aria-live="polite">Copy</span></span></button>`
  : `<div class="ca is-inert" id="ca" role="group" aria-disabled="true" aria-label="Token address, pending"><span class="ca-tag">CA</span><span class="ca-value">Token address pending</span></div>`;

// Only stated records ship their values; absent/unconfirmed records are emptied so they stay inert.
const publicReg = Object.fromEntries(Object.entries(reg).map(([k, r]) => [k, r.state === 'stated' ? r : { ...r, ...(r.value !== undefined ? { value: null } : {}), ...(r.url !== undefined ? { url: null } : {}) }]));
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8')
  .replaceAll('{{BG}}', palette.bg)
  .replaceAll('{{DOMAIN}}', reg.domain.value)
  .replaceAll('{{MARKET_SITE}}', reg.market.site)
  .replace('{{SOCIALS}}', socials)
  .replace('{{CA_SLOT}}', caSlot)
  .replace('{{REGISTER_JSON}}', JSON.stringify(publicReg).replace(/</g, '\\u003c'));
fs.writeFileSync(path.join(OUT, 'index.html'), html);

// ---- gates ----
gate('dist/assets/logo.png exists', fs.existsSync(path.join(OUT, 'assets/logo.png')));
gate('index.html references ./assets/logo.png', html.includes('src="./assets/logo.png"'));
for (const m of html.matchAll(/(?:src|href)="(\.\/[^"#?]+)"/g)) gate(`relative ref resolves: ${m[1]}`, fs.existsSync(path.join(OUT, m[1])));
gate('favicon.svg is 32x32', /viewBox="0 0 32 32"/.test(fav));

// palette rule: colour literals only in src/tokens.js
const lit = [];
for (const f of ['index.html', 'css/styles.css', ...fs.readdirSync(path.join(SRC, 'js')).map((n) => 'js/' + n)]) {
  const t = fs.readFileSync(path.join(SRC, f), 'utf8');
  for (const m of t.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g)) lit.push(`${f}:${m[0]}`);
}
gate('no colour literals outside src/tokens.js', lit.length === 0, lit.slice(0, 4).join(' '));

// address scanner: any address-shaped string must equal a stated register value; the CA record itself is exempt.
const allowed = new Set(Object.values(reg).filter((r) => r.state === 'stated').flatMap((r) => [r.value, r.url]).filter(Boolean));
const SHAPE = /\b(?:0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})\b/g;
const bad = [];
for (const f of ['index.html', 'css/styles.css', 'css/tokens.css', ...fs.readdirSync(path.join(OUT, 'js')).map((n) => 'js/' + n)]) {
  const t = fs.readFileSync(path.join(OUT, f), 'utf8');
  for (const m of t.matchAll(SHAPE)) {
    const s = m[0];
    if (s.startsWith('0x') || (/[0-9]/.test(s) && /[a-z]/.test(s) && /[A-Z]/.test(s))) if (!allowed.has(s)) bad.push(`${f}:${s}`);
  }
}
gate('address scanner: every address-shaped string is a stated register value', bad.length === 0, bad.slice(0, 3).join(' '));
gate('CA slot matches register state', caOn ? html.includes('data-address="' + reg.ca.value + '"') : !html.includes('data-address='), caOn ? 'stated branch' : 'absent branch');
gate('GitHub icon inert when unstated', stated(reg.github) ? html.includes('github') : !/href="[^"]*github/i.test(html));
gate('no dates in page', !/\b(19|20)\d{2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}\b|\d{1,2}:\d{2}/i.test(html.replace(/<script[\s\S]*?<\/script>/g, '')), 'static html');

console.log(`\nbuild ok: ${gates.filter((g) => g.ok).length}/${gates.length} gates -> ${OUT}`);
