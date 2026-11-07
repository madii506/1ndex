// 1ndex: the coin that hedges against the stock market. Live data from /api/ndx (prices, the coin, the treasury)
// and GeckoTerminal (4-hour history, straight from the browser).
(function () {
  const A = window.MINTART, $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const DPR = Math.min(2, window.devicePixelRatio || 1), RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NAVY = '#0b1022', LAV = '#e8ecff', MUTE = '#8f9ac8', SH = '#251c66', UP = '#3fe6a6', DN = '#ff5a7a';
  const SEG = ['#22d1f8', '#5b8cff', '#9b63ff', '#c200fb'];
  const GT = 'https://api.geckoterminal.com/api/v2/networks/solana';
  const S = { b: null, hist: null, coin: null, tre: null };
  const usd = (x, d) => x == null || !isFinite(x) ? '—' : '$' + Math.abs(+x).toLocaleString('en-US', { minimumFractionDigits: d ?? (Math.abs(x) >= 1 ? 2 : 4), maximumFractionDigits: d ?? (Math.abs(x) >= 1 ? 2 : 4) });
  const big = x => x == null || !isFinite(x) ? '—' : x >= 1e9 ? '$' + (x / 1e9).toFixed(2) + 'B' : x >= 1e6 ? '$' + (x / 1e6).toFixed(2) + 'M' : x >= 1e3 ? '$' + (x / 1e3).toFixed(1) + 'K' : usd(x, 0);
  const pct = x => x == null || !isFinite(x) ? '—' : (x < 0 ? '▼' : '▲') + Math.abs(x).toFixed(2) + '%';
  const spct = x => x == null || !isFinite(x) ? '—' : (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2) + '%';
  const cls = x => x == null ? '' : x < 0 ? 'dn' : 'up';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const short = a => a ? a.slice(0, 4) + '…' + a.slice(-4) : '';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cue = n => window.MINTSOUND && MINTSOUND.cue(n);
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), io = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, out = t => 1 - Math.pow(1 - t, 3), sm = t => t * t * (3 - 2 * t);
  async function api(a) { const r = await fetch('/api/ndx?a=' + a); const j = await r.json().catch(() => ({ error: 'bad response' })); if (!r.ok || j.error) throw new Error(j.error || 'request failed'); return j; }
  function sizeCanvas(c, w, h) { c.width = Math.round(w * DPR); c.height = Math.round(h * DPR); const g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.imageSmoothingEnabled = false; return g; }
  const setF = (id, v, c) => { const el = $(id); if (!el) return; el.textContent = v; if (c !== undefined) el.className = c; };

  // ---------------------------------------------------------------- the mark: a pixel ring in four slices, a pixel 1 in the hole
  const N = 22, ONE = ['.XX.', 'XXX.', '.XX.', '.XX.', '.XX.', '.XX.', 'XXXX'];
  const CELLS = (() => { const c = (N - 1) / 2, out = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const dx = x - c, dy = y - c, r = Math.hypot(dx, dy); if (r < 5.6 || r > 10.4) continue;
      let a = Math.atan2(dy, dx) + Math.PI / 2; if (a < 0) a += Math.PI * 2; const f = a / (Math.PI * 2) * 4, k = Math.floor(f), off = (f - k) * (Math.PI / 2) * r; if (off < .8 || (Math.PI / 2) * r - off < .55) continue; out.push([x, y, k]); }
    const ox = Math.round(c - 1.5), oy = Math.round(c - 3); ONE.forEach((row, j) => [...row].forEach((q, i) => { if (q === 'X') out.push([ox + i, oy + j, -1]); })); return out; })();
  function mark(g, x0, y0, size, o = {}) { const p = size / N, sh = o.shadow !== false;
    if (sh) { g.fillStyle = SH; for (const [x, y, k] of CELLS) if (o.one !== false || k >= 0) g.fillRect(x0 + (x + 1) * p, y0 + (y + 1) * p, p + .4, p + .4); }
    for (const [x, y, k] of CELLS) { if (k < 0 && o.one === false) continue; g.fillStyle = k < 0 ? LAV : SEG[k]; g.fillRect(x0 + x * p, y0 + y * p, p + .4, p + .4); } }
  function drawMarks() { $$('canvas.ringmark').forEach(c => { const wm = c.parentElement.querySelector('.wm'); const css = wm ? Math.round(parseFloat(getComputedStyle(wm).fontSize) * .8) : +c.dataset.size;
    const g = sizeCanvas(c, css * 1.06, css * 1.06); c.style.width = css * 1.06 + 'px'; c.style.height = css * 1.06 + 'px'; mark(g, 0, 0, css, { shadow: css > 30 }); }); }

  // ---------------------------------------------------------------- the intro (~5.6 s): the S&P climbs, crashes red, bears' arrows rain;
  // four slices fly in from the corners and lock into the ring, a second line rises out of the crash, the 1 drops in, the name rises, the logo glides home
  function intro(done) {
    const cv = $('#intro'); if (RM || location.hash || scrollY > 10 || document.hidden) { cv.remove(); document.body.classList.remove('intro-on'); return done(); }
    setTimeout(() => { if (document.body.contains(cv)) { cv.remove(); document.body.classList.remove('intro-on', 'handoff'); } }, 12000);
    history.scrollRestoration = 'manual'; scrollTo(0, 0);
    const W = innerWidth, H = innerHeight, g = sizeCanvas(cv, W, H); cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const L = Math.min(W * .17, H * .24), F = L / .8; g.font = `700 ${F}px ID`; const ww = g.measureText('1ndex').width, gap = L * .12, lockW = L * 1.06 + gap + ww;
    const lx = (W - lockW) / 2, ly = H / 2 - L / 2, cx = lx + L / 2, cy = ly + L / 2;
    // the S&P line: up, then a cliff
    const r = A.rng(31), pts = []; let v = 0; const NP = 70; for (let i = 0; i < NP; i++) { v += (r() - .38) * 1.1; pts.push(v); }
    const x0 = W * .06, x1 = W * .94, yTop = H * .2, yBase = H * .62, mx = Math.max(...pts), mn = Math.min(...pts), Y = i => yBase - (pts[i] - mn) / (mx - mn || 1) * (yBase - yTop), X = i => x0 + i / (NP - 1) * (x1 - x0) * .62;
    const crashX = X(NP - 1), crashY = Y(NP - 1), bottomY = H * .9;
    const drops = Array.from({ length: 70 }, () => ({ x: r() * W, y: -r() * H, s: 6 + Math.floor(r() * 3) * 3, v: 3 + r() * 5 }));
    const corners = [[1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, b]) => [a * W * .7, b * H * .7]), LBL = ['GOLD', 'SQQQ', 'VIX', 'USD'];
    let t0 = performance.now(), handoff = null, finished = false; const said = {}; const once = (k, n) => { if (!said[k]) { said[k] = 1; cue(n); } };
    const skip = () => { if (!handoff && performance.now() - t0 < 4700) t0 = performance.now() - 4700; }; addEventListener('pointerdown', skip, { once: true }); addEventListener('keydown', skip, { once: true });
    const T_LINE = 0, T_CRASH = 1500, T_SLICE = 2300, T_RISE = 2700, T_ONE = 3350, T_NAME = 3750, T_TAG = 4150, T_GO = 5000;
    function frame(now) {
      const t = now - t0; g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
      if (t > T_GO && !handoff) { const tl = $('#heroMark').getBoundingClientRect(); handoff = { t: now, x: tl.left, y: tl.top, s: (tl.width / 1.06) / L }; document.body.classList.add('handoff'); document.body.classList.remove('intro-on'); }
      let bgA = 1, X0 = lx, Y0 = ly, sc = 1;
      if (handoff) { const k = clamp((now - handoff.t) / 1000), e = io(k); bgA = 1 - sm(clamp((k - .3) / .7)); X0 = lx + (handoff.x - lx) * e; Y0 = ly + (handoff.y - ly) * e; sc = 1 + (handoff.s - 1) * e; if (k >= 1 && !finished) { finished = true; document.body.classList.remove('handoff'); cv.remove(); return done(); } }
      g.globalAlpha = bgA; g.fillStyle = NAVY; g.fillRect(0, 0, W, H);
      // grid
      const shake = t > T_CRASH && t < T_CRASH + 380 ? (1 - (t - T_CRASH) / 380) * 7 : 0; g.save(); g.translate((r() - .5) * shake, (r() - .5) * shake);
      g.strokeStyle = `rgba(154,166,217,${.07 * clamp(t / 600)})`; g.lineWidth = 1; for (let x = 0; x < W; x += 48) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 48) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      const fadeLines = 1 - sm(clamp((t - T_NAME) / 700));
      if (!handoff && fadeLines > 0) {
        g.globalAlpha = bgA * fadeLines;
        // the climb
        const n = Math.max(2, Math.floor(clamp((t - T_LINE) / 1400) * NP)); const red = t > T_CRASH;
        g.lineWidth = 4; g.lineJoin = 'round'; g.strokeStyle = red ? DN : UP; g.shadowColor = g.strokeStyle; g.shadowBlur = 14; g.beginPath(); for (let i = 0; i < n; i++) i ? g.lineTo(X(i), Y(i)) : g.moveTo(X(i), Y(i));
        // the cliff
        const kc = out(clamp((t - T_CRASH) / 520)); if (kc > 0) g.lineTo(crashX + (W * .05) * kc, crashY + (bottomY - crashY) * kc); g.stroke(); g.shadowBlur = 0;
        g.font = '600 15px JB'; g.fillStyle = red ? DN : UP; g.textAlign = 'left'; g.fillText(red ? 'S&P 500  ▼ the market falls' : 'S&P 500', x0, yTop - 24); if (t > T_LINE + 200) once('line', 'tick');
        if (kc > 0) once('crash', 'thud');
        // the arrows rain
        const kr = clamp((t - T_CRASH) / 2600); if (kr > 0 && kr < 1) { g.globalAlpha = bgA * fadeLines * (1 - kr) * .9; for (const d of drops) { d.y += d.v; A.down(g, d.x, d.y % (H + 40), d.s, DN); } }
        g.globalAlpha = bgA * fadeLines;
        // the other side: a line rising out of the crash, in the index colours
        const kup = out(clamp((t - T_RISE) / 900)); if (kup > 0) { const sx = crashX + W * .05, sy = bottomY, ex = W * .97, ey = H * .14; const gr = g.createLinearGradient(sx, sy, ex, ey); SEG.forEach((c, i) => gr.addColorStop(i / 3, c));
          g.strokeStyle = gr; g.lineWidth = 5; g.shadowColor = SEG[2]; g.shadowBlur = 18; g.beginPath(); g.moveTo(sx, sy); const steps = 22; for (let i = 1; i <= steps * kup; i++) { const k = i / steps; g.lineTo(sx + (ex - sx) * k, sy + (ey - sy) * k + Math.sin(k * 9) * 8); } g.stroke(); g.shadowBlur = 0;
          g.font = '600 15px JB'; g.fillStyle = SEG[0]; g.textAlign = 'right'; g.globalAlpha = bgA * fadeLines * kup; g.fillText('the other side ▲', ex, ey - 16); g.globalAlpha = bgA * fadeLines; once('rise', 'chime'); }
      }
      g.restore(); g.globalAlpha = 1;
      // the four slices fly in from the corners and lock into the ring
      if (t > T_SLICE || handoff) {
        const size = L * sc, p = size / N, pulse = handoff ? 0 : Math.max(0, 1 - Math.abs(t - T_ONE - 250) / 250) * .06;
        const S0 = 1 + pulse; const ox = (handoff ? X0 : lx) - size * (S0 - 1) / 2, oy = (handoff ? Y0 : ly) - size * (S0 - 1) / 2, pp = p * S0;
        for (let k = 0; k < 4; k++) { const kk = handoff ? 1 : out(clamp((t - T_SLICE - k * 110) / 600)); if (kk <= 0) continue; const [dx, dy] = corners[k], offx = dx * (1 - kk), offy = dy * (1 - kk), rot = (1 - kk) * (k % 2 ? 1 : -1) * .9;
          g.save(); g.translate(ox + size * S0 / 2 + offx, oy + size * S0 / 2 + offy); g.rotate(rot); g.translate(-(ox + size * S0 / 2), -(oy + size * S0 / 2));
          g.fillStyle = SH; for (const [x, y, s] of CELLS) if (s === k) g.fillRect(ox + (x + 1) * pp, oy + (y + 1) * pp, pp + .4, pp + .4);
          g.fillStyle = SEG[k]; for (const [x, y, s] of CELLS) if (s === k) g.fillRect(ox + x * pp, oy + y * pp, pp + .4, pp + .4);
          g.restore();
          if (!handoff && kk > .3 && t < T_NAME + 300) { const ang = -Math.PI / 4 + k * Math.PI / 2 - Math.PI / 2 + Math.PI / 2, la = clamp(1 - (t - T_ONE) / 400); if (la > 0) { g.globalAlpha = la; g.font = '700 15px JB'; g.fillStyle = SEG[k]; g.textAlign = 'center'; g.fillText(LBL[k], ox + size / 2 + Math.cos(ang) * size * .62, oy + size / 2 + Math.sin(ang) * size * .62); g.globalAlpha = 1; } } }
        if (!handoff && t > T_SLICE + 450 && t < T_SLICE + 900) once('lock', 'pop');
        // the 1 drops in
        const k1 = handoff ? 1 : out(clamp((t - T_ONE) / 420)); if (k1 > 0) { const dy = (1 - k1) * -size * .9; g.globalAlpha = Math.min(1, k1 * 2);
          g.fillStyle = SH; for (const [x, y, s] of CELLS) if (s < 0) g.fillRect(ox + (x + 1) * pp, oy + (y + 1) * pp + dy, pp + .4, pp + .4);
          g.fillStyle = LAV; for (const [x, y, s] of CELLS) if (s < 0) g.fillRect(ox + x * pp, oy + y * pp + dy, pp + .4, pp + .4); g.globalAlpha = 1; if (k1 >= 1) once('one', 'tick'); }
        // the name
        const fs = F * sc; g.font = `700 ${fs}px ID`; g.textBaseline = 'middle'; g.textAlign = 'left'; let wx = (handoff ? X0 : lx) + (L * 1.06 + gap) * sc; const wy = (handoff ? Y0 : ly) + size * .5 - fs * .04;
        [...'1ndex'].forEach((ch, i) => { const k = handoff ? 1 : out(clamp((t - T_NAME - i * 80) / 480)), cw = g.measureText(ch).width; if (k > 0) { const dy = (1 - k) * fs * .3; g.globalAlpha = k; g.fillStyle = '#3b2a9a'; g.fillText(ch, wx + fs * .045, wy + dy + fs * .045); g.fillStyle = LAV; g.fillText(ch, wx, wy + dy); g.globalAlpha = 1; } wx += cw; });
        const kt = handoff ? 1 - clamp((now - handoff.t) / 320) : sm(clamp((t - T_TAG) / 600)); if (kt > 0) { g.globalAlpha = kt * .9; g.font = `500 ${Math.max(13, Math.min(F * .13, (W - 32) / 30))}px JB`; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = MUTE; g.fillText('the coin that hedges against the stock market', W / 2, ly + L + L * .32 + (handoff ? 0 : (1 - kt) * 8)); g.globalAlpha = 1; }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- live prices
  const M = () => (S.b && S.b.members) || [];
  async function loadBasket() { try { S.b = await api('basket'); renderBasket(); } catch (e) { if (!S.b) $('#tape').innerHTML = '<span>prices are busy right now, retrying</span>'; } }
  function renderBasket() { const b = S.b; if (!b) return; const spy = b.benchmark && b.benchmark.price;
    const items = []; if (spy) items.push(`S&amp;P 500 (SPYx) <em>${usd(spy.usd)}</em> <span class="${cls(spy.ch24)}">${pct(spy.ch24)}</span>`);
    M().forEach(m => { const p = m.price; if (p) items.push(`${esc(m.symbol)} (${esc(m.ticker)}) <em>${usd(p.usd)}</em> <span class="${cls(p.ch24)}">${pct(p.ch24)}</span>`); });
    if (b.ch24 != null) items.push(`the 1ndex four <span class="${cls(b.ch24)}">${pct(b.ch24)}</span>`); if (b.sol) items.push(`SOL <em>${usd(b.sol.usd)}</em>`);
    const one = items.map(x => `<span>${x}</span>`).join(''); $('#tape').innerHTML = one + one;
    if (spy) { setF('#fx-spy', pct(spy.ch24), cls(spy.ch24)); setF('#dSpy', spct(spy.ch24), cls(spy.ch24)); }
    if (b.ch24 != null) { setF('#fx-ndx', pct(b.ch24), cls(b.ch24)); setF('#dNdx', spct(b.ch24), cls(b.ch24)); }
    if (spy && b.ch24 != null) { const d = b.ch24 - spy.ch24; $('#duelV').innerHTML = spy.ch24 < 0 ? (d >= 0 ? `A red day for stocks. <b>The four are ${d.toFixed(2)} points ahead.</b>` : `A red day for stocks, and the four are behind by ${(-d).toFixed(2)} points so far.`) : (d >= 0 ? `A green day for stocks, and the four are still ahead.` : `A green day for stocks. <b>A hedge costs a little on days like this.</b>`); seesaw(d); }
    renderMembers(); ring(); renderPools(); renderLadder(); }
  function renderMembers() { const b = S.b; if (!b) return; const ART = ['gold', 'short', 'vol', 'cash'];
    $('#members').innerHTML = M().map((m, i) => { const p = m.price || {}; return `<div class="bt reveal shown" data-k="${m.symbol}" style="--c:${SEG[i]};--d:${i}" data-tilt><canvas class="bt-art" data-art="${ART[i]}"></canvas><span class="bt-name">${esc({ GOLD: 'gold', SQQQ: 'the short Nasdaq', VIX: 'VIX', USD: 'dollars' }[m.symbol] || m.symbol)}</span><span class="bt-sub">${esc(m.ticker)} · ${esc(m.name)}</span><b class="bt-px">${usd(p.usd)}</b><span class="bt-ch ${cls(p.ch24)}">${pct(p.ch24)} 24h</span><span class="bt-w">25% of the index</span><p class="bt-note">${esc(m.note)}</p><span class="bt-liq">${p.liquidity ? big(p.liquidity) + ' of liquidity · ' + big(p.vol24) + ' traded 24h' : ''}</span></div>`; }).join('');
    boardArt(); memberSparks(); if (window.MINTFX) MINTFX.tilt(); }
  function memberSparks() { if (!S.hist) return; $$('#members .bt').forEach(el => { const k = el.dataset.k, a = S.hist.ser[k === 'GOLD' ? 'GOLD' : k]; let c = $('.bt-spark', el); if (!c) { c = document.createElement('canvas'); c.className = 'bt-spark'; el.insertBefore(c, $('.bt-note', el)); }
    if (k === 'USD') { spark(c, S.hist.t.map(() => 0), getComputedStyle(el).getPropertyValue('--c')); return; } if (a) spark(c, a.map(v => v / a[0] - 1), getComputedStyle(el).getPropertyValue('--c')); }); }
  function boardArt() { $$('.bt-art').forEach(c => { const s = 76, g = sizeCanvas(c, s, s), k = c.dataset.art;
    if (k === 'gold') { g.fillStyle = '#16204e'; g.fillRect(0, 0, s, s); A.goldBar(g, 10, 30, 4); }
    else if (k === 'short') { g.fillStyle = '#16204e'; g.fillRect(0, 0, s, s); A.bear(g, 6, 8, 4, A.bearSpec(A.rng(9))); A.down(g, s - 22, 8, 14, DN); }
    else if (k === 'vol') { g.fillStyle = '#16204e'; g.fillRect(0, 0, s, s); g.strokeStyle = SEG[2]; g.lineWidth = 4; g.beginPath(); [[6, 54], [18, 50], [28, 56], [38, 48], [46, 18], [54, 40], [62, 34], [70, 44]].forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); }
    else { g.fillStyle = '#16204e'; g.fillRect(0, 0, s, s); g.fillStyle = '#060917'; g.fillRect(17, 25, 46, 30); g.fillStyle = '#c9f2e2'; g.fillRect(13, 21, 46, 30); g.fillStyle = '#16a874'; g.fillRect(13, 21, 46, 4); g.fillRect(13, 47, 46, 4); g.font = '700 22px PX'; g.fillStyle = '#060917'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 36, 37); } }); }
  function ring() { const c = $('#ringBig'); if (!c || !S.b) return; const s = Math.min(240, c.parentElement.clientWidth - 40), g = sizeCanvas(c, s, s); c.style.width = s + 'px'; c.style.height = s + 'px'; mark(g, s * .05, s * .05, s * .9);
    $('#ringLab').innerHTML = M().map((m, i) => `<span style="--c:${SEG[i]}"><i></i>${esc(m.symbol === 'USD' ? 'dollars' : m.symbol)} <b>25%</b> <em class="${cls(m.price && m.price.ch24)}">${pct(m.price && m.price.ch24)}</em></span>`).join(''); }
  function seesaw(d) { const c = $('#seesaw'); if (!c) return; const w = c.clientWidth || 120, h = c.clientHeight || 90, g = sizeCanvas(c, w, h); const a = Math.max(-.32, Math.min(.32, -d * .06));
    g.fillStyle = MUTE; g.beginPath(); g.moveTo(w / 2, h * .62); g.lineTo(w / 2 - 12, h * .9); g.lineTo(w / 2 + 12, h * .9); g.closePath(); g.fill();
    g.save(); g.translate(w / 2, h * .6); g.rotate(a); g.fillStyle = LAV; g.fillRect(-w * .42, -3, w * .84, 6); g.fillStyle = DN; g.fillRect(-w * .42, -16, 14, 13); const gr = g.createLinearGradient(w * .3, 0, w * .42, 0); gr.addColorStop(0, SEG[0]); gr.addColorStop(1, SEG[3]); g.fillStyle = gr; g.fillRect(w * .42 - 14, -16, 14, 13); g.restore(); }

  // ---------------------------------------------------------------- 15 days, from GeckoTerminal: the S&P vs the four, and the worst 4 hours
  async function gget(u) { for (let i = 0; i < 4; i++) { const r = await fetch(u); if (r.status === 429) { await sleep(2500 * (i + 1)); continue; } if (!r.ok) throw new Error('GeckoTerminal ' + r.status); return r.json(); } throw new Error('GeckoTerminal is busy'); }
  async function loadHistory() { const b = S.b; if (!b) return; const want = [['SPY', b.benchmark], ...M().filter(m => m.symbol !== 'USD').map(m => [m.symbol, m])]; const raw = {};
    try { for (const [k, m] of want) { if (!m.price || !m.price.pool) continue; const o = await gget(`${GT}/pools/${m.price.pool}/ohlcv/hour?aggregate=4&limit=100&currency=usd&token=${m.mint}`); raw[k] = new Map(o.data.attributes.ohlcv_list.map(r => [r[0], +r[4]])); await sleep(400); } } catch (e) { if (!raw.SPY) { setF('#fx-lvl', 'offline'); return; } }
    const from = Date.now() / 1000 - 15 * 86400, ts = [...raw.SPY.keys()].filter(t => t >= from).sort((a, c) => a - c); if (ts.length < 3) return;
    const ff = m => { let last = null; const firstT = [...m.keys()].sort((a, c) => a - c)[0]; let seed = m.get(firstT); return ts.map(t => { if (m.has(t)) last = m.get(t); return last ?? seed; }); };
    const ser = {}; for (const k of Object.keys(raw)) ser[k] = ff(raw[k]);
    const rel = a => a.map(v => (v / a[0] - 1) * 100), spy = rel(ser.SPY), parts = ['GOLD', 'SQQQ', 'VIX'].map(k => ser[k] ? rel(ser[k]) : ts.map(() => 0));
    const ndx = ts.map((_, i) => .25 * (parts[0][i] + parts[1][i] + parts[2][i]));
    S.hist = { t: ts, spy, ndx, ser }; CH.t0 = 0; const L = a => a[a.length - 1];
    setF('#fx-spy15', spct(L(spy)), cls(L(spy))); setF('#fx-ndx15', spct(L(ndx)), cls(L(ndx))); setF('#fx-lvl', (1000 * (1 + L(ndx) / 100)).toFixed(1));
    spark($('#dSpySpark'), spy, DN); spark($('#dNdxSpark'), ndx, SEG[0]); memberSparks();
    const d15 = L(ndx) - L(spy); $('#verdict15').innerHTML = `Over the last 15 days the S&amp;P&nbsp;500 moved ${spct(L(spy))} and the 1ndex four ${spct(L(ndx))}: ${d15 >= 0 ? `the four were <span class="up">${d15.toFixed(2)} points ahead</span>` : `stocks were ${(-d15).toFixed(2)} points ahead. A hedge costs something in calm weeks`}.`;
    $('#verdict100').innerHTML = `$100 in the four 15 days ago would be about <span class="${cls(L(ndx))}">${usd(100 * (1 + L(ndx) / 100), 2)}</span> now. The same $100 in the S&amp;P&nbsp;500: <span class="${cls(L(spy))}">${usd(100 * (1 + L(spy) / 100), 2)}</span>. Before fees, past moves only.`;
    // the worst 4 hours for the S&P in the window, and what each part did in those same 4 hours
    let wi = 1, wv = 0; for (let i = 1; i < ts.length; i++) { const r = ser.SPY[i] / ser.SPY[i - 1] - 1; if (r < wv) { wv = r; wi = i; } }
    const mv = k => ser[k] ? (ser[k][wi] / ser[k][wi - 1] - 1) * 100 : 0, rows = [['the S&P 500', wv * 100, DN], ['gold', mv('GOLD'), SEG[0]], ['the short Nasdaq', mv('SQQQ'), SEG[1]], ['VIX', mv('VIX'), SEG[2]], ['dollars', 0, SEG[3]]];
    const four = .25 * (mv('GOLD') + mv('SQQQ') + mv('VIX'));
    setF('#cdWhen', new Date(ts[wi - 1] * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC, 4 hours');
    $('#cdRow').innerHTML = rows.map(([n, v, c], i) => `<div class="cd ${i ? '' : 'spx'}" style="--c:${c};--d:${i}"><span>${n}</span><b class="${cls(v)}">${spct(v)}</b><i style="--h:${Math.min(100, Math.abs(v) * 4).toFixed(1)}%" class="${cls(v)}"></i></div>`).join('') + `<div class="cd four" style="--c:${SEG[0]};--d:5"><span>the 1ndex four</span><b class="${cls(four)}">${spct(four)}</b><i style="--h:${Math.min(100, Math.abs(four) * 4).toFixed(1)}%" class="${cls(four)}"></i></div>`;
  }
  function spark(c, a, col) { if (!c || !a) return; const w = c.clientWidth || 160, h = c.clientHeight || 46, g = sizeCanvas(c, w, h); g.imageSmoothingEnabled = true; const mn = Math.min(...a), mx = Math.max(...a), Y = v => h - 4 - (v - mn) / (mx - mn || 1) * (h - 8);
    g.strokeStyle = col; g.lineWidth = 2.2; g.beginPath(); a.forEach((v, i) => { const x = i / (a.length - 1) * w; i ? g.lineTo(x, Y(v)) : g.moveTo(x, Y(v)); }); g.stroke(); }
  const CH = { t0: 0, hover: -1 };
  function chartFrame(now) { requestAnimationFrame(chartFrame); const c = $('#chart'), H = S.hist; if (!c || !H) return; const bx = c.getBoundingClientRect(); if (bx.bottom < 0 || bx.top > innerHeight) return;
    if (!CH.t0) CH.t0 = now; const k = RM ? 1 : Math.min(1, (now - CH.t0) / 1700), w = c.clientWidth, h = c.clientHeight; if (c.width !== Math.round(w * DPR)) { c.width = Math.round(w * DPR); c.height = Math.round(h * DPR); }
    if (k >= 1 && CH.drawn === CH.hover && CH.w === w) return; CH.drawn = k >= 1 ? CH.hover : null; CH.w = w;
    const g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, w, h); const pl = 46, pr = 14, pt = 14, pb = 28, iw = w - pl - pr, ih = h - pt - pb;
    const all = [...H.spy, ...H.ndx, 0], mn = Math.floor(Math.min(...all)) - .5, mx = Math.ceil(Math.max(...all)) + .5, Y = v => pt + ih - (v - mn) / (mx - mn) * ih, X = i => pl + i / (H.t.length - 1) * iw;
    g.font = '500 11px JB'; g.fillStyle = 'rgba(232,236,255,.5)'; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let v = Math.ceil(mn); v <= mx; v += Math.max(1, Math.round((mx - mn) / 5))) { g.strokeStyle = v === 0 ? 'rgba(232,236,255,.35)' : 'rgba(154,166,217,.1)'; g.setLineDash(v === 0 ? [] : [3, 4]); g.beginPath(); g.moveTo(pl, Y(v)); g.lineTo(w - pr, Y(v)); g.stroke(); g.fillText((v > 0 ? '+' : '') + v + '%', pl - 8, Y(v)); }
    g.setLineDash([]); g.textAlign = 'center'; g.textBaseline = 'top'; for (let i = 0; i < H.t.length; i += Math.ceil(H.t.length / 6)) g.fillText(new Date(H.t[i] * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), X(i), h - pb + 8);
    const n = Math.max(2, Math.floor(k * H.t.length)); const gr = g.createLinearGradient(pl, 0, w - pr, 0); SEG.forEach((c2, i) => gr.addColorStop(i / 3, c2));
    [['spy', DN, 2.5], ['ndx', gr, 4]].forEach(([key, col, lw]) => { g.strokeStyle = col; g.lineWidth = lw; g.lineJoin = 'round'; if (key === 'ndx') { g.shadowColor = SEG[2]; g.shadowBlur = 12; } g.beginPath(); for (let i = 0; i < n; i++) i ? g.lineTo(X(i), Y(H[key][i])) : g.moveTo(X(i), Y(H[key][i])); g.stroke(); g.shadowBlur = 0; });
    if (k >= 1) { const Lx = H.t.length - 1; [['spy', DN], ['ndx', SEG[0]]].forEach(([key, col]) => { const v = H[key][Lx]; g.fillStyle = col; g.beginPath(); g.arc(X(Lx), Y(v), 5, 0, 7); g.fill(); g.font = '700 12px JB'; g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText(spct(v), X(Lx) - 8, Y(v) - 6); }); }
    const tip = $('#chartTip'); if (k >= 1 && CH.hover >= 0) { const i = CH.hover; g.strokeStyle = 'rgba(232,236,255,.4)'; g.beginPath(); g.moveTo(X(i), pt); g.lineTo(X(i), pt + ih); g.stroke(); tip.hidden = false;
      tip.innerHTML = `<b>${new Date(H.t[i] * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</b><span class="spy">S&amp;P ${spct(H.spy[i])}</span><span class="ndx">the four ${spct(H.ndx[i])}</span>`; tip.style.left = Math.min(w - 170, Math.max(0, X(i) + 12)) + 'px'; } else if (tip) tip.hidden = true; }
  (() => { const c = $('#chart'); c.addEventListener('pointermove', e => { if (!S.hist) return; const b = c.getBoundingClientRect(); CH.hover = Math.max(0, Math.min(S.hist.t.length - 1, Math.round((e.clientX - b.left - 46) / (b.width - 60) * (S.hist.t.length - 1)))); }); c.addEventListener('pointerleave', () => CH.hover = -1); })();

  // ---------------------------------------------------------------- the crash test
  function renderLadder() { const s = +$('#touch').value / 100; $('#touchVal').textContent = (s > 0 ? '+' : s < 0 ? '−' : '') + Math.abs(s * 100) + '%';
    const nq = s * 1.25, sq = Math.max(-1, -3 * nq), vx = Math.max(-.9, -3.5 * s), q = 25;
    const rows = [['gold', q, q, 'held flat'], ['the short Nasdaq', q, q * (1 + sq), ''], ['VIX', q, q * (1 + vx), ''], ['dollars', q, q, 'stays a dollar'], ['$100 in the four', 100, q * 2 + q * (1 + sq) + q * (1 + vx), ''], ['$100 in the S&P 500', 100, 100 * (1 + s), 'for comparison']];
    const mx = Math.max(...rows.map(r => r[2]), 100);
    $('#ladder').innerHTML = rows.map(([n, a, b2, note], i) => { const d = b2 - a; return `<div class="rung${d > .005 ? ' hit' : ''}${i === 4 ? ' total' : ''}" style="--d:${i}"><span class="lvl">${n}</span><span class="bar"><i style="width:${Math.max(1.5, b2 / mx * 100).toFixed(1)}%"></i></span><span class="pay">${usd(a, 2)} → <b>${usd(b2, 2)}</b>${Math.abs(d) > .005 ? ` <em class="${d < 0 ? 'dn' : 'up'}">${d > 0 ? '+' : '−'}${usd(Math.abs(d), 2)}</em>` : note ? ` <em>${note}</em>` : ''}</span></div>`; }).join(''); }
  $('#touch').addEventListener('input', () => { cue('tick'); renderLadder(); });

  // ---------------------------------------------------------------- the coin, the treasury, the pools
  async function loadCoin() { try { const c = S.coin = await api('coin'); const box = $('#coinBox');
    if (!c.live) { box.innerHTML = `<div class="soon"><b>not launched yet.</b><p>$1NDEX launches on its own Raydium LaunchLab launchpad. This panel shows its curve, live, from the first trade.</p></div>`; return; }
    const pr = Math.min(1, c.progress || 0);
    box.innerHTML = `<div class="clive"><div class="cp"><div><small>market cap</small><b>${(+c.mcapSol).toFixed(1)} SOL</b></div><div><small>raised</small><b>${c.raisedSol.toFixed(2)} / ${c.raiseSol} SOL</b></div><div><small>to the index so far</small><b>${c.platformFeeSol.toFixed(3)} SOL</b></div></div><div class="cbar"><i style="width:${(pr * 100).toFixed(1)}%"></i></div><p class="fine">${c.graduated ? 'graduated to Raydium' : 'on its LaunchLab curve'} · <a href="https://raydium.io/launchpad/token/?mint=${c.mint}" target="_blank" rel="noopener">trade on Raydium ↗</a> · <a href="https://solscan.io/token/${c.mint}" target="_blank" rel="noopener">${short(c.mint)} ↗</a></p></div>`;
  } catch (e) { $('#coinBox').innerHTML = `<div class="skel">couldn't read the chain (${esc(e.message)}).</div>`; } }
  async function loadTreasury() { try { const t = S.tre = await api('treasury'); const box = $('#treasuryBox');
    if (!t.live) { box.innerHTML = `<div class="trows">${M().map((m, i) => `<div class="trow"><span class="ts" style="--c:${SEG[i]}">${esc(m.symbol)}</span><span>target 25%</span><span>0</span><span>$0.00</span><span class="tb"><i style="width:0"></i></span></div>`).join('')}</div><p class="fine">Empty until $1NDEX launches. The first trade starts filling it, and every claim and buy shows up here.</p>`; setF('#fx-held', '$0.00'); setF('#fx-unclaimed', '0 SOL'); return; }
    const tot = t.basketUsd || 0; setF('#fx-held', usd(tot, 2)); setF('#fx-unclaimed', t.unclaimedSol.toFixed(3) + ' SOL');
    loadActivity();
    box.innerHTML = `<div class="trows">${t.holdings.map((h, i) => { const w = tot ? h.usd / tot * 100 : 0; return `<div class="trow"><span class="ts" style="--c:${SEG[i]}">${esc(h.symbol)}</span><span>${w.toFixed(1)}% of 25%</span><span>${h.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })}</span><span>${usd(h.usd, 2)}</span><span class="tb"><i style="width:${Math.min(100, w * 4).toFixed(1)}%"></i></span></div>`; }).join('')}</div><p class="fine">treasury wallet <a href="https://solscan.io/account/${t.wallet}" target="_blank" rel="noopener">${short(t.wallet)} ↗</a> · ${t.sol.toFixed(3)} SOL ready to spend</p>`;
  } catch (e) { $('#treasuryBox').innerHTML = `<div class="skel">couldn't read the chain (${esc(e.message)}).</div>`; } }
  async function loadActivity() { try { const a = await api('activity'); if (!a.items || !a.items.length) return; $('#activity').innerHTML = a.items.map(x => `<a class="prow" href="https://solscan.io/tx/${x.sig}" target="_blank" rel="noopener"><span class="pn">${esc(x.kind)} <i>${new Date(x.time * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</i></span><span>${short(x.sig)} ↗</span></a>`).join(''); } catch (e) { } }
  function renderPools() { $('#poolList').innerHTML = [['the S&P 500 (benchmark)', S.b.benchmark], ...M().map(m => [m.symbol === 'USD' ? 'dollars' : m.symbol, m])].map(([n, m]) => { const p = m.price; return p ? `<a class="prow" href="https://dexscreener.com/solana/${p.pool}" target="_blank" rel="noopener"><span class="pn">${esc(n)} <i>${esc(m.ticker || m.symbol)} · ${esc(p.dex || '')}</i></span><span>${big(p.liquidity)} <i>liquidity</i></span><span>${big(p.vol24)} <i>24h volume</i></span></a>` : ''; }).join(''); }
  function nextReb() { const n = new Date(), d = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())); d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7)); const ms = d - n; return `${Math.floor(ms / 864e5)}d ${String(Math.floor(ms % 864e5 / 36e5)).padStart(2, '0')}h`; }
  const clock = () => { setF('#fx-reb', nextReb()); setF('#fx-reb2', nextReb()); setF('#duelClock', new Date().toISOString().slice(11, 16) + ' UTC'); };

  // ---------------------------------------------------------------- reveals, nav
  function reveals() { const o = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('shown'); if (e.target.classList.contains('ladder-wrap')) setTimeout(() => e.target.classList.add('settled'), 1600); o.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' }); $$('.reveal').forEach(el => o.observe(el)); }
  function navSpy() { const links = $$('.nav-links a[href^="#"]'), secs = links.map(a => $(a.getAttribute('href'))); const y = innerHeight * .35; let on = -1; secs.forEach((s, i) => { if (s && s.getBoundingClientRect().top < y) on = i; }); links.forEach((a, i) => a.classList.toggle('on', i === on)); }

  function start() {
    MINTFX.splitHeads(); drawMarks(); renderLadder(); reveals(); MINTFX.bgInit(); MINTFX.progress(); MINTFX.tilt(); clock(); setInterval(clock, 20000);
    const snd = $('#snd'), sndUi = () => snd.classList.toggle('on', MINTSOUND.on); snd.onclick = e => { e.stopPropagation(); MINTSOUND.toggle(); }; document.addEventListener('mintsound', sndUi); sndUi();
    addEventListener('scroll', navSpy, { passive: true }); addEventListener('resize', () => { drawMarks(); ring(); CH.t0 = 0; CH.w = 0; if (S.hist) { spark($('#dSpySpark'), S.hist.spy, DN); spark($('#dNdxSpark'), S.hist.ndx, SEG[0]); } });
    requestAnimationFrame(chartFrame); loadCoin().then(loadTreasury); setInterval(loadBasket, 45000); setInterval(() => loadCoin().then(loadTreasury), 60000);
  }
  const fonts = Promise.all([document.fonts.load('700 100px ID'), document.fonts.load('700 30px PX'), document.fonts.load('600 14px JB')]).catch(() => {});
  const data = loadBasket();
  Promise.race([Promise.all([fonts, data]), new Promise(r => setTimeout(r, 1200))]).then(() => { start(); intro(() => {}); data.then(loadHistory); });
})();
