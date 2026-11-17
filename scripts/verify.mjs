// Mutation harness. Every anchor is state-independent: it reads the register as it is right now,
// then forces the exact state each branch needs before building into a scratch folder.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = path.join(root, '.verify');
const current = JSON.parse(fs.readFileSync(path.join(root, 'src/register.json'), 'utf8'));
const TEST_SOL = 'So11111111111111111111111111111111111111112';
const TEST_EVM = '0x' + 'aB'.repeat(20);
let pass = 0, total = 0;
const check = (name, ok) => { total++; if (ok) pass++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); };

function build(name, mutate, { src } = {}) {
  const reg = structuredClone(current); mutate(reg);
  const regFile = path.join(tmp, name + '.json'); const out = path.join(tmp, name);
  fs.mkdirSync(tmp, { recursive: true }); fs.writeFileSync(regFile, JSON.stringify(reg));
  const args = [path.join(root, 'scripts/build.mjs'), '--register', regFile, '--out', out];
  if (src) args.push('--src', src);
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  return { code: r.status, out, html: fs.existsSync(path.join(out, 'index.html')) ? fs.readFileSync(path.join(out, 'index.html'), 'utf8') : '', log: r.stdout };
}
const count = (s, re) => (s.match(re) || []).length;

// --- branch A: CA absent ---
const A = build('absent', (r) => { r.ca = { state: 'absent', value: null, chain: 'solana' }; });
check('A build exits 0 (CA absent)', A.code === 0);
check('A CA slot inert, no data-address', /class="ca is-inert"/.test(A.html) && !A.html.includes('data-address='));
check('A both social icons present', count(A.html, /class="social(?: is-inert)?"/g) === 2);
check('A X is a link derived from stated URL', A.html.includes('href="https://x.com/sol_weave"') && A.html.includes('(@sol_weave)'));
check('A GitHub renders inert, no href', /<span class="social is-inert"[^>]*GitHub/.test(A.html));
check('A logo copied into dist and referenced', fs.existsSync(path.join(A.out, 'assets/logo.png')) && A.html.includes('src="./assets/logo.png"'));

// --- branch B: CA stated (Solana base58) ---
const B = build('stated', (r) => { r.ca = { state: 'stated', value: TEST_SOL, chain: 'solana' }; });
check('B build exits 0 (CA stated)', B.code === 0);
check('B CA button carries full address, copyable', B.html.includes(`data-address="${TEST_SOL}"`) && /<button class="ca"/.test(B.html));
check('B CA text shown in full', B.html.includes(`<span class="ca-value">${TEST_SOL}</span>`));
check('B CA exempt from address scanner', /address scanner[^\n]*/.test(B.log) && !/FAIL/.test(B.log));
check('B register JSON embedded for runtime gate', B.html.includes(TEST_SOL) && B.html.includes('id="register"'));

// --- branch C: 0x hex is never blanket-rejected when it matches the registry ---
const C = build('evm', (r) => { r.ca = { state: 'stated', value: TEST_EVM, chain: 'solana' }; });
check('C 0x hex CA accepted when it matches the registry', C.code === 0 && C.html.includes(`data-address="${TEST_EVM}"`));

// --- branch D: unconfirmed CA stays inert ---
const D = build('unconfirmed', (r) => { r.ca = { state: 'unconfirmed', value: TEST_SOL, chain: 'solana' }; });
check('D unconfirmed CA renders inert', D.code === 0 && !D.html.includes('data-address=') && /is-inert/.test(D.html));

// --- branch E: GitHub stated flips icon to link ---
const E = build('github', (r) => { r.github = { state: 'stated', url: 'https://github.com/solweave' }; });
check('E stated GitHub becomes a link with derived handle', E.code === 0 && E.html.includes('href="https://github.com/solweave"') && E.html.includes('(@solweave)'));

// --- branch F: unregistered address-shaped strings must fail the build (both shapes) ---
for (const [label, stray] of [['base58', 'Zk3pQ9vR7sT2uW5xY8aB4cD6eF1gH3jK5mN7pR9s'], ['0x hex', '0x' + 'cd'.repeat(20)]]) {
  const srcCopy = path.join(tmp, 'src-' + label.replace(/\W/g, ''));
  fs.rmSync(srcCopy, { recursive: true, force: true }); fs.cpSync(path.join(root, 'src'), srcCopy, { recursive: true });
  fs.appendFileSync(path.join(srcCopy, 'index.html'), `\n<!-- ${stray} -->\n`);
  const F = build('stray-' + label.replace(/\W/g, ''), () => {}, { src: srcCopy });
  check(`F stray ${label} address fails the build`, F.code !== 0);
}

// --- branch G: palette rule ---
{
  const srcCopy = path.join(tmp, 'src-hex'); fs.rmSync(srcCopy, { recursive: true, force: true }); fs.cpSync(path.join(root, 'src'), srcCopy, { recursive: true });
  fs.appendFileSync(path.join(srcCopy, 'css/styles.css'), '\n.x{color:#abcdef}\n');
  check('G colour literal outside tokens fails the build', build('hexlit', () => {}, { src: srcCopy }).code !== 0);
}


// --- animation + social audit (runs on the real source) ---
{
  const css = fs.readFileSync(path.join(root, 'src/css/styles.css'), 'utf8');
  const jsDir = path.join(root, 'src/js');
  const js = fs.readdirSync(jsDir).map((f) => fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n');
  const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
  for (const n of names) {
    const inCss = new RegExp('animation[^;{}]*\\b' + n + '\\b').test(css);
    check('K keyframes ' + n + ' is applied to an element', inCss || js.includes(n));
  }
  const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  check('K reduced-motion block kills every animation and transition', /animation:\s*none\s*!important/.test(rm) && /transition:\s*none\s*!important/.test(rm));
  check('K own-row pulse has its own reduced-motion rule', /\.row\.own[^{]*\{\s*animation:\s*none/.test(rm));
  const rmJs = (f) => /RM\(\)/.test(fs.readFileSync(path.join(jsDir, f), 'utf8'));
  check('K waves.js and motion.js honour reduced motion', rmJs('waves.js') && rmJs('motion.js'));
  const real = build('audit', () => {});
  check('S exactly one X link, to https://x.com/sol_weave', count(real.html, /href="https:\/\/x\.com\//g) === 1 && real.html.includes('href="https://x.com/sol_weave"'));
  check('S X icon lives in the header socials group', /<div class="socials"[^>]*><a class="social" href="https:\/\/x\.com\/sol_weave"/.test(real.html));
}

// --- real build last, so dist/ reflects the committed register ---
fs.rmSync(tmp, { recursive: true, force: true });
const real = spawnSync(process.execPath, [path.join(root, 'scripts/build.mjs')], { cwd: root, encoding: 'utf8' });
check('H default build exits 0', real.status === 0);
check('H dist/ has index.html, favicon.svg, assets/logo.png', ['index.html', 'favicon.svg', 'assets/logo.png'].every((f) => fs.existsSync(path.join(root, 'dist', f))));
check('H no AI-attribution files or folders', !fs.existsSync(path.join(root, 'CLAUDE.md')) && !fs.existsSync(path.join(root, '.claude')));
console.log(`\nverify: ${pass}/${total} gates passed`);
process.exit(pass === total ? 0 : 1);
