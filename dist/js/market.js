// Live market board. Follows the `market` register record only; the CA record is read solely
// to decide whether row #1 is the own-token row or the placeholder. It never gates the trending feed.
import { reg, isStated, ownAddress } from './register.js';
import { DASH, fmtPrice, fmtUsd, fmtPct, fmtInt, letterOf, shortAddr, num } from './format.js';
import { countTo } from './motion.js';

const M = reg.market;
const LOGO = './assets/logo.png';
const POLL_MS = 60000;
const TREND_SHOWN = 9; // ranks 2..10 sit under the pinned row #1

const rowsEl = document.getElementById('rows');
const tickerEl = document.getElementById('ticker');
const noteEl = document.getElementById('panel-note');
const pillEl = document.getElementById('state-pill');
const pillText = document.getElementById('state-text');
const mCount = document.getElementById('m-count');
const mMove = document.getElementById('m-move');
const mLiq = document.getElementById('m-liq');

const store = { trend: null, own: null }; // last good data per feed
let ownRow = null;
const trendRows = [];

/* ---------- network ---------- */
async function getJSON(url, timeout = 10000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(t); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withBackoff(fn, tries = 3, base = 700) {
  let err;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { err = e; if (i < tries - 1) await sleep(base * 2 ** i + Math.random() * 250); }
  }
  throw err;
}

/* ---------- data shaping ---------- */
const vol24 = (p) => num(p && p.volume && p.volume.h24) || 0;
function pickPair(pairs, addr) {
  if (!Array.isArray(pairs) || !pairs.length) return null;
  const own = addr ? pairs.filter((p) => p.baseToken && p.baseToken.address === addr) : [];
  const pool = own.length ? own : pairs;
  return [...pool].sort((a, b) => vol24(b) - vol24(a))[0];
}
function shape(addr, pair, extra = {}) {
  return {
    addr,
    symbol: (pair && pair.baseToken && pair.baseToken.symbol) || extra.symbol || '',
    name: (pair && pair.baseToken && pair.baseToken.name) || extra.name || '',
    price: num(pair && pair.priceUsd),
    chg: num(pair && pair.priceChange && pair.priceChange.h24),
    vol: num(pair && pair.volume && pair.volume.h24),
    liq: num(pair && pair.liquidity && pair.liquidity.usd),
    imgs: [...(extra.imgs || []), pair && pair.info && pair.info.imageUrl, extra.icon].filter(Boolean),
    url: (pair && pair.url) || '',
  };
}

async function loadTrending() {
  const boosts = await getJSON(M.boosts);
  const best = new Map();
  for (const b of Array.isArray(boosts) ? boosts : []) {
    if (b.chainId !== 'solana' || !b.tokenAddress) continue;
    const cur = best.get(b.tokenAddress);
    if (!cur || num(b.totalAmount) > num(cur.totalAmount)) best.set(b.tokenAddress, b);
  }
  const top = [...best.values()].sort((a, b) => (num(b.totalAmount) || 0) - (num(a.totalAmount) || 0)).slice(0, 10);
  if (!top.length) throw new Error('no solana boosts');
  const res = await Promise.allSettled(top.map((b) => getJSON(M.tokens + b.tokenAddress)));
  if (res.every((r) => r.status === 'rejected')) throw new Error('pair lookups failed');
  return top.map((b, i) => shape(b.tokenAddress, res[i].status === 'fulfilled' ? pickPair(res[i].value, b.tokenAddress) : null, { icon: b.icon }));
}

// DexScreener and pump.fun are requested side by side; neither waits for the other.
async function loadOwn() {
  const addr = ownAddress();
  const [d, p] = await Promise.allSettled([getJSON(M.own + addr), isStated(reg.market) && M.pump ? getJSON(M.pump + addr) : Promise.reject(new Error('no pump record'))]);
  if (d.status === 'rejected' && p.status === 'rejected') throw new Error('own token sources failed');
  const pair = d.status === 'fulfilled' ? pickPair(d.value && d.value.pairs, addr) : null;
  const pump = p.status === 'fulfilled' && p.value ? p.value : null;
  return shape(addr, pair, { symbol: pump && pump.symbol, name: pump && pump.name, imgs: [pump && pump.image_uri, ], icon: LOGO });
}

/* ---------- DOM ---------- */
function tileInto(tile, imgs, label) {
  tile.className = 'tile';
  tile.textContent = '';
  const urls = [...imgs];
  const next = () => {
    const u = urls.shift();
    if (!u) { tile.className = 'tile'; tile.textContent = letterOf(label); return; }
    const img = new Image();
    img.alt = ''; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
    img.onload = () => { tile.textContent = ''; tile.classList.toggle('is-brand', u === LOGO); tile.appendChild(img); };
    img.onerror = next;
    img.src = u;
  };
  next();
}

function buildRow(rank, { tag = 'a', own = false } = {}) {
  const li = document.createElement('li');
  const row = document.createElement(tag);
  row.className = 'row skel-row' + (own ? ' own' : '');
  row.innerHTML =
    `<span class="rank">${rank}</span>` +
    `<span class="who"><span class="tile skel"></span><span class="who-text"><b class="skel">······</b><small class="skel">··········</small></span></span>` +
    ['price', 'chg', 'vol', 'liq'].map((f, i) => `<span class="cell skel" data-f="${f}"><span class="lbl">${['Price', '24H', 'Vol', 'Liq'][i]}</span><span class="val">·····</span></span>`).join('');
  li.appendChild(row);
  rowsEl.appendChild(li);
  return row;
}

function setCell(row, f, value, fmt) {
  const cell = row.querySelector(`[data-f="${f}"]`);
  const val = cell.querySelector('.val');
  cell.classList.remove('skel', 'dash');
  if (!Number.isFinite(value)) { val._v = undefined; val.textContent = DASH; cell.classList.add('dash'); cell.classList.remove('up', 'dn'); return; }
  countTo(val, value, fmt);
  if (f === 'chg') { cell.classList.toggle('up', value >= 0); cell.classList.toggle('dn', value < 0); }
}

function fillRow(row, item, idx) {
  const fresh = row.dataset.key !== item.addr;
  if (fresh) { row.dataset.key = item.addr; row.querySelectorAll('.val').forEach((v) => { v._v = undefined; }); }
  row.classList.remove('skel-row');
  const sym = row.querySelector('.who-text b'), nm = row.querySelector('.who-text small'), tile = row.querySelector('.tile');
  sym.classList.remove('skel'); nm.classList.remove('skel');
  sym.textContent = item.symbol || shortAddr(item.addr);
  nm.textContent = item.name || shortAddr(item.addr);
  if (fresh || tile.classList.contains('skel')) { tile.classList.remove('skel'); tileInto(tile, item.imgs, item.symbol || item.name || item.addr); }
  setCell(row, 'price', item.price, fmtPrice);
  setCell(row, 'chg', item.chg, fmtPct);
  setCell(row, 'vol', item.vol, fmtUsd);
  setCell(row, 'liq', item.liq, fmtUsd);
  if (row.tagName === 'A') {
    if (item.url) { row.href = item.url; row.target = '_blank'; row.rel = 'noopener noreferrer'; row.setAttribute('aria-label', `${item.symbol || 'token'} on DexScreener`); }
    else row.removeAttribute('href');
  }
  if (!row.classList.contains('is-in')) { row.style.setProperty('--i', idx); row.classList.add('is-in'); }
}

function dashRow(row, label) {
  row.classList.remove('skel-row');
  const sym = row.querySelector('.who-text b'), nm = row.querySelector('.who-text small'), tile = row.querySelector('.tile');
  sym.classList.remove('skel'); nm.classList.remove('skel'); tile.classList.remove('skel');
  sym.textContent = label || DASH; nm.textContent = 'Unavailable';
  if (!tile.textContent) tile.textContent = DASH;
  for (const f of ['price', 'chg', 'vol', 'liq']) setCell(row, f, NaN, String);
}

function buildPlaceholder() {
  const li = document.createElement('li');
  const row = document.createElement('div');
  row.className = 'row own placeholder';
  row.setAttribute('aria-label', 'Own token row, waiting for its address');
  row.innerHTML =
    `<span class="rank">1</span>` +
    `<span class="who"><span class="tile is-brand"><img src="${LOGO}" alt="" width="32" height="32"></span><span class="who-text"><b>SOLWEAVE</b><small>Awaiting token address</small></span></span>` +
    [['price','Price'], ['chg','24H'], ['vol','Vol'], ['liq','Liq']].map(([f, l]) => `<span class="cell" data-f="${f}"><span class="lbl">${l}</span><span class="val">· · · · ·</span></span>`).join('');
  li.appendChild(row);
  rowsEl.appendChild(li);
  return row;
}

/* ---------- ticker ---------- */
let tickKeys = '';
function renderTicker(items) {
  const keys = items.map((i) => i.addr).join('|');
  if (keys !== tickKeys) {
    tickKeys = keys;
    const one = items.map(() => `<span class="tick"><span class="tile"></span><b></b><span class="p"></span><span class="c"></span></span>`).join('');
    tickerEl.innerHTML = one + one;
  }
  const ticks = tickerEl.querySelectorAll('.tick');
  ticks.forEach((el, n) => {
    const it = items[n % items.length];
    el.querySelector('b').textContent = it.symbol || shortAddr(it.addr);
    el.querySelector('.p').textContent = fmtPrice(it.price);
    const c = el.querySelector('.c');
    c.textContent = fmtPct(it.chg);
    c.className = 'c ' + (Number.isFinite(it.chg) ? (it.chg >= 0 ? 'up' : 'dn') : '');
    const tile = el.querySelector('.tile');
    if (tile.dataset.k !== it.addr) { tile.dataset.k = it.addr; tileInto(tile, it.imgs, it.symbol || it.addr); }
  });
}

/* ---------- metrics ---------- */
function renderMetrics(items) {
  countTo(mCount, items.length, fmtInt, { flash: false });
  const moves = items.filter((i) => Number.isFinite(i.chg));
  if (moves.length) {
    const big = moves.reduce((a, b) => (Math.abs(b.chg) > Math.abs(a.chg) ? b : a));
    countTo(mMove, big.chg, fmtPct);
  } else mMove.textContent = DASH;
  const liq = items.map((i) => i.liq).filter(Number.isFinite);
  if (liq.length) countTo(mLiq, liq.reduce((a, b) => a + b, 0), fmtUsd); else mLiq.textContent = DASH;
}

/* ---------- status ---------- */
const failed = { trend: false, own: false };
function paintStatus() {
  const bad = failed.trend || failed.own;
  const have = store.trend || store.own;
  pillEl.dataset.state = bad ? 'offline' : have ? 'live' : 'syncing';
  pillText.textContent = bad ? 'Offline, retrying' : have ? 'Live' : 'Syncing';
  if (bad) {
    noteEl.hidden = false;
    noteEl.textContent = store.trend || store.own
      ? 'A data source stopped answering. Last good numbers stay up while we retry.'
      : 'A data source stopped answering. Retrying after longer pauses.';
  } else noteEl.hidden = true;
}

/* ---------- renderers ---------- */
function renderTrend() {
  const own = ownAddress();
  const items = (store.trend || []).filter((i) => i.addr !== own); // dedupe: own token only ever shows in row #1
  trendRows.forEach((row, n) => {
    const it = items[n];
    if (it) fillRow(row, it, n + 1); else dashRow(row, DASH);
  });
  renderTicker(own && store.own ? [store.own, ...items] : items);
  renderMetrics(store.trend);
}
function renderOwn() { if (ownRow && store.own) fillRow(ownRow, store.own, 0); }

/* ---------- polling ---------- */
function makeFeed(load, onOk, onFail) {
  let timer = null, fails = 0, busy = false;
  const schedule = () => {
    clearTimeout(timer);
    if (document.hidden) return;
    timer = setTimeout(run, fails ? Math.min(POLL_MS, 5000 * 2 ** (fails - 1)) : POLL_MS);
  };
  async function run() {
    if (document.hidden || busy) return;
    busy = true;
    try { const d = await withBackoff(load); fails = 0; onOk(d); } catch (e) { fails++; onFail(e); }
    busy = false; schedule();
  }
  return { run, stop: () => clearTimeout(timer) };
}

export function initMarket() {
  if (!rowsEl) return;
  rowsEl.textContent = '';
  const own = ownAddress();
  ownRow = own ? buildRow(1, { own: true }) : buildPlaceholder();
  for (let r = 2; r <= TREND_SHOWN + 1; r++) trendRows.push(buildRow(r));
  tickerEl.innerHTML = Array.from({ length: 8 }, () => '<span class="tick-skel skel"></span>').join('');

  if (!isStated(M)) {
    pillEl.dataset.state = 'offline'; pillText.textContent = 'Source not stated';
    trendRows.forEach((r) => dashRow(r, DASH));
    return;
  }

  const feeds = [];
  feeds.push(makeFeed(loadTrending,
    (d) => { store.trend = d; failed.trend = false; renderTrend(); paintStatus(); },
    () => { failed.trend = true; if (!store.trend) trendRows.forEach((r) => dashRow(r, DASH)); paintStatus(); }));
  if (own) {
    feeds.push(makeFeed(loadOwn,
      (d) => { store.own = d; failed.own = false; renderOwn(); if (store.trend) renderTrend(); paintStatus(); },
      () => { failed.own = true; if (!store.own) dashRow(ownRow, shortAddr(own)); paintStatus(); }));
  }
  const start = () => feeds.forEach((f) => f.run());
  document.addEventListener('visibilitychange', () => { if (document.hidden) feeds.forEach((f) => f.stop()); else start(); });
  if (!document.hidden) start();
}
