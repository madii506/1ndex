// 1ndex v2, "the other side". Live data from /api/ndx (Dexscreener prices, the coin, the treasury) and GeckoTerminal
// (4-hour history, straight from the browser). Every number on the page is read live; nothing is simulated except
// where a control says "rules of thumb" (the seesaw while you drag it, and the crash test).
(function () {
  'use strict';
  const A = window.MINTART || {}, $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const DPR = Math.min(2, window.devicePixelRatio || 1), RM = matchMedia('(prefers-reduced-motion: reduce)').matches, COARSE = matchMedia('(pointer: coarse)').matches;
  const NAVY = '#070b1c', LAV = '#e8ecff', MUTE = '#8f9ac8', DIM = '#59639a', LINE = '#1d2656', LINE2 = '#2c3776', SH = '#251c66', SH2 = '#3b2a9a', UP = '#3fe6a6', DN = '#ff5a7a';
  const SEG = ['#22d1f8', '#5b8cff', '#9b63ff', '#c200fb'];
  const NAMES = { GOLD: 'gold', SQQQ: 'the short Nasdaq', VIX: 'VIX', USD: 'dollars' };
  const GT = 'https://api.geckoterminal.com/api/v2/networks/solana';
  const S = { b: null, hist: null, coin: null, tre: null, cd: null };
  const usd = (x, d) => x == null || !isFinite(x) ? '—' : (x < 0 ? '−' : '') + '$' + Math.abs(+x).toLocaleString('en-US', { minimumFractionDigits: d ?? (Math.abs(x) >= 1 ? 2 : 4), maximumFractionDigits: d ?? (Math.abs(x) >= 1 ? 2 : 4) });
  const big = x => x == null || !isFinite(x) ? '—' : x >= 1e9 ? '$' + (x / 1e9).toFixed(2) + 'B' : x >= 1e6 ? '$' + (x / 1e6).toFixed(2) + 'M' : x >= 1e3 ? '$' + (x / 1e3).toFixed(1) + 'K' : usd(x, 0);
  const pct = x => x == null || !isFinite(x) ? '—' : (x < 0 ? '▼' : '▲') + Math.abs(x).toFixed(2) + '%';
  const spct = x => x == null || !isFinite(x) ? '—' : (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2) + '%';
  const cls = x => x == null ? '' : x < 0 ? 'dn' : 'up';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const short = a => a ? a.slice(0, 4) + '…' + a.slice(-4) : '';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cue = n => { try { window.MINTSOUND && MINTSOUND.cue(n); } catch (e) { } };
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), io = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, out = t => 1 - Math.pow(1 - t, 3), sm = t => t * t * (3 - 2 * t);
  const M = () => (S.b && S.b.members) || [];
  async function api(a) { const r = await fetch('/api/ndx?a=' + a); const j = await r.json().catch(() => ({ error: 'bad response' })); if (!r.ok || j.error) throw new Error(j.error || 'request failed'); return j; }
  function fit(c) { const w = c.clientWidth || 1, h = c.clientHeight || 1; if (c._w !== w || c._h !== h) { c.width = Math.round(w * DPR); c.height = Math.round(h * DPR); c._w = w; c._h = h; } const g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); return [g, w, h]; }
  function sized(c, w, h) { c.width = Math.round(w * DPR); c.height = Math.round(h * DPR); c.style.width = w + 'px'; c.style.height = h + 'px'; const g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.imageSmoothingEnabled = false; return g; }
  const setT = (sel, v, c) => { const el = $(sel); if (!el) return; el.textContent = v; if (c !== undefined) el.className = c; };
  const grad = (g, x0, y0, x1, y1) => { const gr = g.createLinearGradient(x0, y0, x1, y1); SEG.forEach((c, i) => gr.addColorStop(i / 3, c)); return gr; };
  const AR = ['XXXXX', '.XXX.', '..X..'];
  function arrow(g, x, y, s, col, up) { const p = s / 5; g.fillStyle = col; for (let j = 0; j < 3; j++) { const row = AR[up ? 2 - j : j]; for (let i = 0; i < 5; i++) if (row[i] === 'X') g.fillRect(x + i * p, y + j * p, p + .3, p + .3); } }
  const rng = A.rng || (s => () => (s = (s * 16807) % 2147483647) / 2147483647);
  const vis = {}; // which canvases are on screen
  function watch(el, key) { if (!el) return; new IntersectionObserver(es => es.forEach(e => vis[key] = e.isIntersecting), { rootMargin: '120px 0px' }).observe(el); }

  // ---------------------------------------------------------------- the mark: a pixel ring in four slices, a pixel 1 in the hole
  const N = 22, ONE = ['.XX.', 'XXX.', '.XX.', '.XX.', '.XX.', '.XX.', 'XXXX'];
  const CELLS = (() => { const c = (N - 1) / 2, o = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const dx = x - c, dy = y - c, r = Math.hypot(dx, dy); if (r < 5.6 || r > 10.4) continue;
      let a = Math.atan2(dy, dx) + Math.PI / 2; if (a < 0) a += Math.PI * 2; const f = a / (Math.PI * 2) * 4, k = Math.floor(f), off = (f - k) * (Math.PI / 2) * r; if (off < .8 || (Math.PI / 2) * r - off < .55) continue; o.push([x, y, k]); }
    const ox = Math.round(c - 1.5), oy = Math.round(c - 3); ONE.forEach((row, j) => [...row].forEach((q, i) => { if (q === 'X') o.push([ox + i, oy + j, -1]); })); return o; })();
  function mark(g, x0, y0, size, o = {}) { const p = size / N;
    if (o.shadow !== false) { g.fillStyle = SH; for (const [x, y] of CELLS) g.fillRect(x0 + (x + 1) * p, y0 + (y + 1) * p, p + .4, p + .4); }
    for (const [x, y, k] of CELLS) { g.fillStyle = k < 0 ? LAV : SEG[k]; g.fillRect(x0 + x * p, y0 + y * p, p + .4, p + .4); } }
  function drawMarks() { $$('canvas.ringmark').forEach(c => { const wm = c.parentElement.querySelector('.wm'); const css = wm ? Math.round(parseFloat(getComputedStyle(wm).fontSize) * .8) : +c.dataset.size || 22;
    const g = sized(c, css * 1.06, css * 1.06); mark(g, 0, 0, css, { shadow: css > 30 }); }); }

  // ---------------------------------------------------------------- the background: a live, fluid marble (WebGL), steered by the mouse and the scroll
  const BG = { gl: null, mx: .5, my: .6, tx: .5, ty: .6 };
  function bgInit() { const c = $('#bg'); if (!c) return; const gl = c.getContext('webgl', { antialias: false, premultipliedAlpha: false }); if (!gl) { c.remove(); return; }
    const vs = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
    const fs = `precision highp float;uniform vec2 r;uniform float t;uniform vec2 m;uniform float s;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}
      float fbm(vec2 p){float v=0.,a=.5;mat2 R=mat2(.8,-.6,.6,.8);for(int i=0;i<5;i++){v+=a*n(p);p=R*p*2.02;a*=.5;}return v;}
      void main(){vec2 uv=gl_FragCoord.xy/r.y;vec2 p=uv*1.15+vec2(0.,s*.18);vec2 mm=m-.5;float tt=t*.03;
        vec2 q=vec2(fbm(p+tt),fbm(p+vec2(5.2,1.3)-tt));
        vec2 w=vec2(fbm(p+3.2*q+vec2(1.7,9.2)+mm*.7+tt*1.4),fbm(p+3.2*q+vec2(8.3,2.8)-mm*.7));
        float f=fbm(p+3.*w);
        vec3 col=mix(vec3(.026,.04,.115),vec3(.075,.095,.25),smoothstep(.2,.9,f));
        vec3 tint=mix(mix(vec3(.133,.82,.973),vec3(.357,.55,1.),w.x),mix(vec3(.608,.388,1.),vec3(.76,0.,.984),w.y),clamp(q.x*1.2,0.,1.));
        float vein=smoothstep(.45,1.,f);col+=tint*pow(vein,1.8)*.62;
        vec3 cy=mix(vec3(.133,.82,.973),tint,.45);col+=cy*.3*smoothstep(.045,.0,abs(f-.6))+cy*.14*smoothstep(.035,.0,abs(f-.44));
        vec2 mp=vec2(m.x*r.x/r.y,m.y);float d=length(uv-mp);col+=tint*.07*exp(-d*d*5.);
        vec2 c=gl_FragCoord.xy/r-.5;col*=1.-dot(c,c)*.55;gl_FragColor=vec4(col,1.);}`;
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { c.remove(); return; } gl.useProgram(pr);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    BG.gl = gl; BG.u = { r: gl.getUniformLocation(pr, 'r'), t: gl.getUniformLocation(pr, 't'), m: gl.getUniformLocation(pr, 'm'), s: gl.getUniformLocation(pr, 's') }; BG.c = c; BG.t0 = performance.now();
    addEventListener('pointermove', e => { BG.tx = e.clientX / innerWidth; BG.ty = 1 - e.clientY / innerHeight; }, { passive: true });
    requestAnimationFrame(bgFrame); }
  function bgFrame(now) { requestAnimationFrame(bgFrame); if (document.hidden) return; if (BG.skip = !BG.skip) return; // ~30 fps
    const gl = BG.gl, c = BG.c, sc = innerWidth < 700 ? .38 : .5, w = Math.round(innerWidth * sc), h = Math.round(innerHeight * sc);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
    BG.mx += (BG.tx - BG.mx) * .06; BG.my += (BG.ty - BG.my) * .06;
    gl.uniform2f(BG.u.r, w, h); gl.uniform1f(BG.u.t, RM ? 20 : (now - BG.t0) / 1000); gl.uniform2f(BG.u.m, BG.mx, BG.my); gl.uniform1f(BG.u.s, scrollY / innerHeight); gl.drawArrays(gl.TRIANGLES, 0, 3); }

  // ---------------------------------------------------------------- the hero: floating live asset cards that drift with the mouse
  const MONO = { GOLD: 'Au', SQQQ: 'SQ', VIX: 'VX', USD: '$' };
  const badge = (sym, i, cls2) => `<span class="mb${cls2 ? ' ' + cls2 : ''}" style="--c:${SEG[i]}">${MONO[sym] || sym.slice(0, 2)}</span>`;
  function renderFloats() { M().forEach((m, i) => { const el = $(`.fcard[data-k="${m.symbol}"]`); if (!el) return; if (!el.dataset.on) { el.dataset.on = 1; el.innerHTML = `${badge(m.symbol, i)}<div><b>${esc(m.ticker)}</b><small>${esc(NAMES[m.symbol])}</small></div><em></em><canvas></canvas>`; }
    const p = m.price || {}, em = $('em', el); em.textContent = pct(p.ch24); em.className = cls(p.ch24);
    if (S.hist) { const c = $('canvas', el); smooth(c, m.symbol === 'USD' ? S.hist.t.map(() => 1) : S.hist.ser[m.symbol], SEG[i]); } }); }
  function heroParallax() { const h = $('#hero'); if (!h || COARSE || RM) return; h.addEventListener('pointermove', e => { const b = h.getBoundingClientRect(); h.style.setProperty('--mx', ((e.clientX - b.left) / b.width - .5).toFixed(3)); h.style.setProperty('--my', ((e.clientY - b.top) / b.height - .5).toFixed(3)); }); }
  // a smooth sparkline with a soft area under it
  function smooth(c, a, col) { if (!c || !a || a.length < 2) return; const [g, w, h] = fit(c); g.clearRect(0, 0, w, h); const mn = Math.min(...a), mx = Math.max(...a), Y = v => h - 3 - (v - mn) / (mx - mn || 1) * (h - 8), X = i => i / (a.length - 1) * w;
    const fill = g.createLinearGradient(0, 0, 0, h); fill.addColorStop(0, col + '55'); fill.addColorStop(1, col + '00');
    g.beginPath(); a.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))); g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fillStyle = fill; g.fill();
    g.beginPath(); a.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))); g.lineJoin = 'round'; g.lineWidth = 2; g.strokeStyle = col; g.stroke(); }
  // cards lean toward the cursor
  function tiltInit() { if (COARSE || RM) return; let cur = null;
    document.addEventListener('pointermove', e => { const el = e.target.closest && e.target.closest('.hcard, .rcard, a.tile, .vault, .bsum'); if (cur && cur !== el) { cur.style.transform = ''; } cur = el; if (!el) return;
      const b = el.getBoundingClientRect(), x = (e.clientX - b.left) / b.width - .5, y = (e.clientY - b.top) / b.height - .5; el.style.transform = `perspective(900px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg) translateY(-3px)`; }, { passive: true }); }

  // ---------------------------------------------------------------- the four: a smooth donut, one segment per asset
  function donutFrame(now) { requestAnimationFrame(donutFrame); if (!vis.ring || document.hidden) return; const c = $('#ringCv'); if (!c) return; const [g, W] = fit(c);
    if (RP.auto && M().length && now - RP.lastAuto > 3600) { if (RP.lastAuto) pick((RP.sel + 1) % 4, false); RP.lastAuto = now; }
    let moving = false; RP.pop = RP.pop.map((v, k) => { const t = k === RP.sel ? 1 : k === RP.hover ? .5 : 0, n = RM ? t : v + (t - v) * .14; if (Math.abs(n - t) > .002) moving = true; return n; });
    const key = RP.sel + ':' + RP.hover + ':' + (S.b ? S.b.at : 0); if (!moving && RP.drawn === key && RP.w === W) return; RP.drawn = moving ? null : key; RP.w = W;
    g.clearRect(0, 0, W, W); const cx = W / 2, cy = W / 2, R = W * .37, th = W * .1, gap = .07;
    g.lineWidth = th; g.strokeStyle = 'rgba(255,255,255,.04)'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    for (let k = 0; k < 4; k++) { const p = RP.pop[k], a0 = -Math.PI / 2 + k * Math.PI / 2 + gap, a1 = a0 + Math.PI / 2 - 2 * gap, rr = R + p * W * .022;
      const gr = g.createLinearGradient(cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr, cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr); gr.addColorStop(0, SEG[k]); gr.addColorStop(1, SEG[(k + 1) % 4]);
      g.save(); g.globalAlpha = .38 + .62 * Math.max(p, 0); g.shadowColor = SEG[k]; g.shadowBlur = 34 * p; g.lineCap = 'round'; g.lineWidth = th * (1 + p * .28); g.strokeStyle = gr; g.beginPath(); g.arc(cx, cy, rr, a0, a1); g.stroke(); g.restore(); }
    const m = M()[RP.sel]; if (m) { const pc = m.price || {}; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = MUTE; g.font = `600 ${Math.round(W * .042)}px IN, sans-serif`; g.fillText(NAMES[m.symbol], cx, cy - W * .1);
      g.fillStyle = LAV; g.font = `700 ${Math.round(W * .14)}px ID, sans-serif`; g.fillText('25%', cx, cy + W * .005);
      if (pc.ch24 != null) { g.fillStyle = pc.ch24 < 0 ? DN : UP; g.font = `700 ${Math.round(W * .045)}px IN, sans-serif`; g.fillText(pct(pc.ch24) + ' 24h', cx, cy + W * .1); } } }

  // ---------------------------------------------------------------- the intro (~3.6 s), no charts and no words: pixels spiral in from the edges and build the ring,
  // a shockwave pulses out, the ring glides into the menu and the background comes up
  function intro(done) {
    const cv = $('#intro'); const end = () => { cv.remove(); document.body.classList.remove('intro-on', 'handoff'); };
    if (RM || location.hash || scrollY > 10 || document.hidden) { end(); return done(); }
    setTimeout(() => { if (document.body.contains(cv)) end(); }, 9000);
    history.scrollRestoration = 'manual'; scrollTo(0, 0);
    const W = innerWidth, H = innerHeight, g = sized(cv, W, H), r = rng(11), L = Math.round(Math.min(W * .22, H * .3) / N) * N, ox0 = (W - L) / 2, oy0 = (H - L) / 2, p0 = L / N, R0 = Math.hypot(W, H) * .6;
    const px = CELLS.map(([x, y, k]) => { const a = r() * Math.PI * 2, d = k < 0 ? 900 + r() * 260 : r() * 650; return { x, y, k, a, R: R0 * (.75 + r() * .5), d, sp: (r() < .5 ? -1 : 1) * (1.4 + r() * 1.2) }; });
    const T_FORM = 2050, T_PULSE = 2150, T_GO = 2700;
    let t0 = performance.now(), handoff = null, finished = false; const said = {}; const once = (k, n) => { if (!said[k]) { said[k] = 1; cue(n); } };
    const skip = () => { if (!handoff && performance.now() - t0 < T_GO - 200) t0 = performance.now() - (T_GO - 200); }; addEventListener('pointerdown', skip, { once: true }); addEventListener('keydown', skip, { once: true });
    function frame(now) {
      const t = now - t0; g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
      if (t > T_GO && !handoff) { const tl = ($('#heroMark') || $('.nav-brand canvas')).getBoundingClientRect(); handoff = { t: now, x: tl.left, y: tl.top, s: (tl.width / 1.06) / L }; document.body.classList.add('handoff'); document.body.classList.remove('intro-on'); }
      let veil = .94, X0 = ox0, Y0 = oy0, sc = 1;
      if (handoff) { const k = clamp((now - handoff.t) / 950), e = io(k); veil = .94 * (1 - sm(clamp(k * 1.4))); X0 = ox0 + (handoff.x - ox0) * e; Y0 = oy0 + (handoff.y - oy0) * e; sc = 1 + (handoff.s - 1) * e; if (k >= 1 && !finished) { finished = true; end(); return done(); } }
      g.fillStyle = `rgba(4,7,22,${veil})`; g.fillRect(0, 0, W, H);
      const pulse = handoff ? 0 : Math.max(0, 1 - Math.abs(t - T_PULSE - 120) / 140) * .05, S1 = sc * (1 + pulse), pp = p0 * S1, ox = X0 - L * (S1 - sc) / 2, oy = Y0 - L * (S1 - sc) / 2;
      // the shockwave
      if (!handoff && t > T_PULSE) { const k = clamp((t - T_PULSE) / 900); if (k < 1) { const cx = ox0 + L / 2, cy = oy0 + L / 2, rad = L * (.55 + k * 1.6); g.save(); g.globalAlpha = (1 - k) * .7; g.lineWidth = 2 + (1 - k) * 4; g.strokeStyle = grad(g, cx - rad, cy, cx + rad, cy); g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.stroke(); g.restore(); once('pulse', 'chime'); } }
      // the pixels
      let all = true;
      for (const q of px) { const k = handoff ? 1 : clamp((t - q.d) / 1150); if (k < 1) all = false; if (k <= 0) continue; const e = io(k), tx = ox + q.x * pp, ty = oy + q.y * pp, ang = q.a + q.sp * (1 - e), rad = q.R * (1 - e) * (1 - e);
        const x = tx + Math.cos(ang) * rad, y = ty + Math.sin(ang) * rad, sz = (pp + .4) * (.5 + .5 * e);
        if (k >= 1) { g.fillStyle = SH; g.fillRect(tx + pp * .6, ty + pp * .6, pp + .4, pp + .4); }
        g.globalAlpha = Math.min(1, k * 3); g.fillStyle = q.k < 0 ? LAV : SEG[q.k]; g.fillRect(x, y, sz, sz); g.globalAlpha = 1; }
      if (all && !handoff) once('lock', 'pop'); if (t > 300) once('start', 'tick');
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- live prices
  async function loadBasket() { try { S.b = await api('basket'); onBasket(); } catch (e) { if (!S.b) { $('#tape').innerHTML = '<span>prices are busy right now, retrying</span>'; setT('#liveTxt', 'prices are busy, retrying…'); setT('#say', 'prices are busy right now. the seesaw moves as soon as they answer.'); } } }
  function onBasket() { renderTape(); renderLive(); renderWin(); renderFloats(); renderBoard(); renderPicker(); renderPools(); stageData(); renderVaults(); }
  function renderTape() { if (!$('#tape')) return; const b = S.b, spy = b.benchmark && b.benchmark.price, items = [];
    if (spy) items.push(`S&amp;P 500 (SPYx) <em>${usd(spy.usd)}</em> <span class="${cls(spy.ch24)}">${pct(spy.ch24)}</span>`);
    M().forEach(m => { const p = m.price; if (p) items.push(`${esc(NAMES[m.symbol] || m.symbol)} (${esc(m.ticker)}) <em>${usd(p.usd)}</em> <span class="${cls(p.ch24)}">${pct(p.ch24)}</span>`); });
    if (b.ch24 != null) items.push(`the 1ndex four <span class="${cls(b.ch24)}">${pct(b.ch24)}</span>`); if (b.sol) items.push(`SOL <em>${usd(b.sol.usd)}</em>`);
    const one = items.map(x => `<span>${x}</span>`).join(''); $('#tape').innerHTML = one + one; }
  function renderLive() { const spy = S.b.benchmark && S.b.benchmark.price; if (!spy) return; const wl = $('#whyLive'); if (wl && S.b.sol) wl.innerHTML = `right now, over 24h: the S&amp;P 500 <span class="${cls(spy.ch24)}">${pct(spy.ch24)}</span> · SOL <span class="${cls(S.b.sol.ch24)}">${pct(S.b.sol.ch24)}</span>`; const red = spy.ch24 < 0, el = $('#live'); el.classList.toggle('red', red); el.classList.toggle('green', !red);
    $('#liveTxt').innerHTML = `<b>live</b> · stocks ${red ? 'down' : 'up'} 24h · launching on Raydium LaunchLab`; }



  // ---------------------------------------------------------------- the live window under the headline: the four against the S&P, today and over 15 days
  const HW = { t0: 0, w: 0 };
  function renderWin() { const b = S.b; if (!b || !$('#win')) return; const spy = b.benchmark && b.benchmark.price, hf = $('#hwFour');
    if (b.ch24 != null) { hf.textContent = spct(b.ch24); hf.className = 'wb-big ' + (b.ch24 >= 0 ? 'g' : 'dn'); }
    if (spy) setT('#hwSpy', spct(spy.ch24), cls(spy.ch24));
    const st = (b.stocks || []).filter(x => x.price && x.price.ch24 != null); if (st.length) setT('#hwDn', `${st.filter(x => x.price.ch24 < 0).length} of ${st.length}`);
    const L = $('#hwList'); if (!L.querySelector('.hrow')) { L.innerHTML = M().map((m, i) => `<div class="hrow" style="--c:${SEG[i]}" data-k="${m.symbol}">${badge(m.symbol, i)}<div><b>${esc(NAMES[m.symbol])}</b><small>${esc(m.ticker)} · a quarter</small></div><div class="r"><b class="p"></b><small class="c"></small></div><span class="w"><i></i></span></div>`).join(''); }
    M().forEach(m => { const r = $(`.hrow[data-k="${m.symbol}"]`, L); if (!r) return; const p = m.price || {}; $('.p', r).textContent = usd(p.usd); const c = $('.c', r); c.textContent = pct(p.ch24); c.className = 'c ' + cls(p.ch24); }); }
  function winFrame(now) { requestAnimationFrame(winFrame); const c = $('#hwChart'), H = S.hist; if (!c || !H || !vis.win || document.hidden) return;
    if (!HW.t0) HW.t0 = now; const k = RM ? 1 : Math.min(1, (now - HW.t0) / 1800), [g, w, h] = fit(c); if (k >= 1 && HW.w === w) return; HW.w = k >= 1 ? w : 0;
    g.clearRect(0, 0, w, h); const all = [...H.spy, ...H.ndx, 0], mn = Math.min(...all) - .6, mx = Math.max(...all) + .6, pr = 64, Y = v => 8 + (h - 16) * (1 - (v - mn) / (mx - mn)), X = i => i / (H.t.length - 1) * (w - pr), n = Math.max(2, Math.floor(k * H.t.length));
    g.strokeStyle = 'rgba(232,236,255,.22)'; g.setLineDash([3, 5]); g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(w - pr, Y(0)); g.stroke(); g.setLineDash([]);
    g.globalAlpha = .12; g.fillStyle = grad(g, 0, 0, w, 0); g.beginPath(); for (let i = 0; i < n; i++) i ? g.lineTo(X(i), Y(H.ndx[i])) : g.moveTo(X(i), Y(H.ndx[i])); for (let i = n - 1; i >= 0; i--) g.lineTo(X(i), Y(H.spy[i])); g.closePath(); g.fill(); g.globalAlpha = 1;
    const path = (a, ox, oy) => { g.beginPath(); for (let i = 0; i < n; i++) i ? g.lineTo(X(i) + ox, Y(a[i]) + oy) : g.moveTo(X(i) + ox, Y(a[i]) + oy); g.stroke(); };
    g.lineJoin = 'round'; g.lineWidth = 2.5; g.strokeStyle = 'rgba(0,0,0,.5)'; path(H.spy, 3, 3); g.strokeStyle = DN; path(H.spy, 0, 0);
    g.lineWidth = 3.5; g.strokeStyle = SH; path(H.ndx, 3, 3); g.strokeStyle = grad(g, 0, 0, w, 0); path(H.ndx, 0, 0);
    if (k >= 1) { const Lx = H.t.length - 1; [[H.spy, DN], [H.ndx, SEG[0]]].forEach(([a, col]) => { g.fillStyle = col; g.fillRect(X(Lx) - 4, Y(a[Lx]) - 4, 8, 8); g.font = '700 12.5px IN, JB'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(spct(a[Lx]), X(Lx) + 10, Y(a[Lx])); }); } }
  // ---------------------------------------------------------------- the stock market, live: real stocks on Solana (tokenized), red and green
  function renderBoard() { const el = $('#tiles'); if (!el || !S.b) return; const st = (S.b.stocks || []).filter(s => s.price && s.price.ch24 != null);
    if (!st.length) { el.innerHTML = '<div class="empty">stock prices are busy, retrying</div>'; return; }
    const prev = S.prevSt || {};
    el.innerHTML = st.map(s => { const c = s.price.ch24, a = clamp(Math.abs(c) / 2.2), fl = prev[s.symbol] != null && prev[s.symbol] !== s.price.usd ? ' flash' : '', tag = s.price.pool ? 'a' : 'div', href = s.price.pool ? ` href="https://dexscreener.com/solana/${s.price.pool}" target="_blank" rel="noopener"` : '';
      return `<${tag} class="tile ${c < 0 ? 'dn' : 'up'}${fl}" style="--a:${a.toFixed(2)}"${href}><b>${esc(s.symbol)}</b><small>${esc(s.name)}</small><span class="px">${usd(s.price.usd)}</span><span class="ch">${spct(c)}</span></${tag}>`; }).join('');
    S.prevSt = Object.fromEntries(st.map(s => [s.symbol, s.price.usd]));
    const dn = st.filter(s => s.price.ch24 < 0).length, avg = st.reduce((a, s) => a + s.price.ch24, 0) / st.length;
    setT('#bsN', `${dn}/${st.length}`, dn > st.length / 2 ? 'dn' : 'up'); setT('#bsT', dn > st.length / 2 ? 'stocks down over 24h' : dn ? 'stocks mostly up over 24h' : 'every stock here is up over 24h');
    setT('#bsA', spct(avg), cls(avg)); if (S.b.ch24 != null) setT('#bsF', spct(S.b.ch24), S.b.ch24 >= 0 ? 'g' : 'dn'); }
  // ---------------------------------------------------------------- the hero: a seesaw with stocks on one end and the four on the other
  const ST = { a: 0, v: 0, live: null, sim: null, drag: null, anim: null, parts: [], lt0: 0, shake: 0, lastInt: null };
  const ruleFour = s => { const x = s / 100, nq = x * 1.25, sq = Math.max(-1, -3 * nq), vx = Math.max(-.9, -3.5 * x), q = 25; return (q * 2 + q * (1 + sq) + q * (1 + vx)) - 100; };
  const cur = () => ST.sim != null ? { spy: ST.sim, four: ruleFour(ST.sim), sim: true } : ST.live;
  function stageData() { const spy = S.b.benchmark && S.b.benchmark.price; if (!spy || S.b.ch24 == null) return; ST.live = { spy: spy.ch24, four: S.b.ch24, sim: false }; stageLabels(); }
  function stageLabels() { const c = cur(); if (!c) return; const sp = $('#endSpy');
    sp.classList.toggle('green', c.spy >= 0);
    setT('#eSpyK', c.sim ? 'if the S&P moved' : 'S&P 500'); setT('#eNdxK', c.sim ? 'the four, rule of thumb' : 'the four');
    const d = c.four - c.spy, say = $('#say'); if (!say) return;
    if (c.sim) say.innerHTML = `If the S&amp;P 500 moved ${spct(c.spy)} in a day, simple rules of thumb put the four near <b>${spct(c.four)}</b>. ${COARSE ? '' : 'It snaps back to live on its own.'}`;
    else say.innerHTML = c.spy < 0 ? (d >= 0 ? `Stocks are down over 24h. <b>The four are ${d.toFixed(2)} points ahead.</b>` : `Stocks are down over 24h, and the four are ${(-d).toFixed(2)} points behind so far.`) : (d >= 0 ? `Stocks are up over 24h, and <b>the four are still ${d.toFixed(2)} points ahead.</b>` : `Stocks are up over 24h. <b>A hedge costs a little on days like this.</b>`); }
  function stageInit() {
    const st = $('#stage'); if (!st) return; watch(st, 'stage'); if (COARSE) setT('#grab', 'tap ↓');
    st.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') return; ST.anim = null; ST.drag = { y: e.clientY, s0: ST.sim ?? (ST.live ? ST.live.spy : 0) }; st.setPointerCapture(e.pointerId); st.classList.add('drag', 'used'); cue('tick'); });
    st.addEventListener('pointermove', e => { if (!ST.drag) return; ST.sim = clamp(Math.round(ST.drag.s0 - (e.clientY - ST.drag.y) / 13), -15, 5); const i = ST.sim; if (i !== ST.lastInt) { ST.lastInt = i; cue('tick'); } stageLabels(); });
    const up = () => { if (!ST.drag) return; ST.drag = null; st.classList.remove('drag'); setTimeout(() => { if (!ST.drag) { ST.sim = null; stageLabels(); cue('pop'); } }, 650); };
    st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
    st.addEventListener('keydown', e => { const k = { ArrowDown: -1, ArrowUp: 1, PageDown: -5, PageUp: 5 }[e.key]; if (e.key === 'Escape' || e.key === 'Home') { ST.sim = null; stageLabels(); return; } if (!k) return; e.preventDefault(); st.classList.add('used'); ST.sim = clamp(Math.round(ST.sim ?? (ST.live ? ST.live.spy : 0)) + k, -15, 5); cue('tick'); stageLabels(); clearTimeout(ST.kt); ST.kt = setTimeout(() => { if (!ST.drag) { ST.sim = null; stageLabels(); } }, 4000); });
    st.addEventListener('click', e => { if (!COARSE || ST.anim) return; st.classList.add('used'); ST.anim = { t: performance.now() }; cue('thud'); });
  }
  function stageFrame(now) {
    if (!$('#stageCv')) return; requestAnimationFrame(stageFrame); if (!vis.stage || document.hidden) return;
    const c = $('#stageCv'), [g, W, H] = fit(c), mob = W < 700;
    if (ST.anim) { const k = (now - ST.anim.t) / 1000; if (k < .9) ST.sim = -10 * out(k / .9); else if (k < 3.4) ST.sim = -10; else { ST.anim = null; ST.sim = null; cue('pop'); } stageLabels(); if (k < .3) ST.shake = 6; }
    const cv = cur(), d = cv ? cv.four - cv.spy : 0;
    if (cv) { const sh = ST.show || (ST.show = { spy: 0, four: 0 }); for (const k of ['spy', 'four']) { sh[k] += (cv[k] - sh[k]) * (RM ? 1 : .12); if (Math.abs(cv[k] - sh[k]) < .004) sh[k] = cv[k]; } const a1 = spct(sh.spy), a2 = spct(sh.four); if (a1 !== ST.t1) { ST.t1 = a1; setT('#eSpy', a1); } if (a2 !== ST.t2) { ST.t2 = a2; setT('#eNdx', a2); } }
    const target = !cv || Math.abs(d) < .02 ? 0 : -Math.sign(d) * Math.min(.2, .04 + .007 * Math.abs(d));
    ST.v += (target - ST.a) * .055; ST.v *= .86; ST.a += ST.v; if (RM) ST.a = target;
    g.clearRect(0, 0, W, H); ST.shake *= .9; g.save(); if (ST.shake > .3) g.translate((Math.random() - .5) * ST.shake, (Math.random() - .5) * ST.shake);
    // 15 days behind it, faint: the S&P (coral) and the four
    const Hs = null; if (Hs) { if (!ST.lt0) ST.lt0 = now; const k = RM ? 1 : out(clamp((now - ST.lt0) / 2200)), all = [...Hs.spy, ...Hs.ndx], mn = Math.min(...all), mx = Math.max(...all), n = Math.max(2, Math.floor(k * Hs.t.length));
      const X = i => i / (Hs.t.length - 1) * W, Y = v => H * .78 - (v - mn) / (mx - mn || 1) * H * .62;
      g.globalAlpha = .13; g.lineWidth = 3; g.lineJoin = 'round';
      [[Hs.spy, DN], [Hs.ndx, grad(g, 0, 0, W, 0)]].forEach(([a, col]) => { g.strokeStyle = col; g.beginPath(); for (let i = 0; i < n; i++) i ? g.lineTo(X(i), Y(a[i])) : g.moveTo(X(i), Y(a[i])); g.stroke(); });
      g.globalAlpha = 1; }
    // weather: each side rains or rises with its own live (or dragged) move
    if (cv && !RM) { const max = mob ? 22 : 40, sides = [[cv.spy, 0], [cv.four, 1]];
      for (const [val, side] of sides) { const inten = clamp(Math.abs(val) / 3, .12, 1), upw = val >= 0;
        if (ST.parts.filter(p => p.side === side).length < max * inten && Math.random() < .5 * inten + .1) {
          const x0 = side ? W / 2 + 30 : 0, x1 = side ? W : W / 2 - 30, s = (mob ? 6 : 8) + Math.floor(Math.random() * 3) * 3;
          ST.parts.push({ side, x: x0 + Math.random() * (x1 - x0), y: upw ? H + 10 : -20, v: (upw ? -1 : 1) * (side === 0 && !upw ? 2.4 + Math.random() * 3.2 : .7 + Math.random() * 1.4) * (1 + inten * .6), s, up: upw, c: side ? (upw ? SEG[Math.floor(Math.random() * 4)] : MUTE) : (upw ? UP : DN) }); } }
      g.globalAlpha = .55; ST.parts = ST.parts.filter(p => { p.y += p.v; const alive = p.y > -30 && p.y < H + 30; if (alive) arrow(g, p.x, p.y, p.s, p.c, p.up); return alive; }); g.globalAlpha = 1; }
    // the fulcrum, the ground
    const px = W / 2, py = H * (mob ? .56 : .5), Lb = Math.min(W * (mob ? .38 : .36), 540), bt = mob ? 10 : 14, base = py + Math.max(mob ? 50 : 64, Lb * .2 + 10);
    g.strokeStyle = LINE2; g.setLineDash([4, 6]); g.lineWidth = 1; g.beginPath(); g.moveTo(0, base + .5); g.lineTo(W, base + .5); g.stroke(); g.setLineDash([]);
    const step = mob ? 6 : 8, rows = Math.ceil((base - py) / step); for (let i = 0; i < rows; i++) { const w = 10 + i * step * 1.15; g.fillStyle = i % 2 ? '#222c66' : LINE2; g.fillRect(Math.round(px - w / 2), Math.round(py + i * step), Math.round(w), step); }
    g.fillStyle = LAV; g.fillRect(px - 6, py - 6, 12, 12);
    // the beam
    g.save(); g.translate(px, py); g.rotate(ST.a);
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(-Lb + 5, -bt / 2 + 5, Lb * 2, bt);
    g.fillStyle = LAV; g.fillRect(-Lb, -bt / 2, Lb * 2, bt); g.fillStyle = '#b9c2f0'; g.fillRect(-Lb, bt / 2 - 3, Lb * 2, 3);
    for (let x = -Lb + 24; x < Lb - 20; x += 24) { g.fillStyle = 'rgba(7,11,28,.18)'; g.fillRect(x, -bt / 2 + 3, 2, bt - 6); }
    // the weights
    const ws = mob ? 46 : 70, red = cv ? cv.spy < 0 : true;
    g.save(); g.translate(-Lb + ws / 2 + 6, -bt / 2 - ws / 2);
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(-ws / 2 + 5, -ws / 2 + 5, ws, ws); g.fillStyle = red ? DN : UP; g.fillRect(-ws / 2, -ws / 2, ws, ws);
    g.fillStyle = red ? '#b8314f' : '#1f9a6c'; g.fillRect(-ws / 2, ws / 2 - ws * .14, ws, ws * .14);
    arrow(g, -ws * .28, -ws * .2, ws * .56, NAVY, !red); g.restore();
    const ms = ws * 1.24; g.save(); g.translate(Lb - ms / 2 - 6, -bt / 2 - ms - 2); mark(g, -ms / 2, 0, ms); g.restore();
    g.restore(); g.restore();
    // labels follow the ends of the beam
    const ca = Math.cos(ST.a), sa = Math.sin(ST.a), lxE = px - (Lb - ws / 2 - 6) * ca, lyE = py - (Lb - ws / 2 - 6) * sa, rxE = px + (Lb - ws * .62 - 6) * ca, ryE = py + (Lb - ws * .62 - 6) * sa;
    const eS = $('#endSpy'), eN = $('#endNdx'), wS = eS.offsetWidth / 2 + 8, wN = eN.offsetWidth / 2 + 8;
    eS.style.transform = `translate(${clamp(lxE, wS, W - wS)}px, ${lyE - ws - bt - 14}px) translate(-50%, -100%)`;
    eN.style.transform = `translate(${clamp(rxE, wN, W - wN)}px, ${ryE - ws * 1.24 - bt - 12}px) translate(-50%, -100%)`;
    const gr = $('#grab'); gr.style.left = lxE + 'px'; gr.style.top = (lyE + 24) + 'px';
  }

  // ---------------------------------------------------------------- the marquee: two rows, opposite ways, faster while you scroll
  const MQ = { a: 0, b: 0, vy: 0, last: scrollY };
  function marqInit() { if (!$('#mA')) return; const ua = '<span>when stocks fall ▼</span><span class="o">when stocks fall ▼</span>', ub = '<span>the four rise ▲</span><span class="o">the four rise ▲</span>'; $('#mA').innerHTML = ua.repeat(6); $('#mB').innerHTML = ub.repeat(6); watch($('.marq'), 'marq'); }
  function marqFrame() { if (!$('#mA')) return; requestAnimationFrame(marqFrame); const dy = scrollY - MQ.last; MQ.last = scrollY; MQ.vy = MQ.vy * .9 + Math.abs(dy) * .1; if (!vis.marq || document.hidden || RM) return;
    const sp = .6 + Math.min(14, MQ.vy * .5), a = $('#mA'), b = $('#mB'), wa = a.scrollWidth / 2, wb = b.scrollWidth / 2;
    MQ.a = (MQ.a - sp) % wa; MQ.b = (MQ.b + sp) % wb; if (MQ.b > 0) MQ.b -= wb; a.style.transform = `translate3d(${MQ.a}px,0,0)`; b.style.transform = `translate3d(${MQ.b}px,0,0)`; }

  // ---------------------------------------------------------------- 15 days from GeckoTerminal: the S&P vs the four, and the worst 4 hours
  async function gget(u) { for (let i = 0; i < 4; i++) { const r = await fetch(u); if (r.status === 429) { await sleep(2500 * (i + 1)); continue; } if (!r.ok) throw new Error('GeckoTerminal ' + r.status); return r.json(); } throw new Error('GeckoTerminal is busy'); }
  async function loadHistory() { const b = S.b; if (!b) return histFail(); const want = [['SPY', b.benchmark], ...M().filter(m => m.symbol !== 'USD').map(m => [m.symbol, m])], raw = {}; if (b.sol && b.sol.pool) want.push(['SOL', { mint: 'So11111111111111111111111111111111111111112', price: b.sol }]);
    try { for (const [k, m] of want) { if (!m.price || !m.price.pool) continue; const o = await gget(`${GT}/pools/${m.price.pool}/ohlcv/hour?aggregate=4&limit=100&currency=usd&token=${m.mint}`); raw[k] = new Map(o.data.attributes.ohlcv_list.map(r => [r[0], +r[4]])); await sleep(400); } } catch (e) { if (!raw.SPY) return histFail(); }
    const from = Date.now() / 1000 - 15 * 86400, ts = [...raw.SPY.keys()].filter(t => t >= from).sort((a, c) => a - c); if (ts.length < 3) return histFail();
    const ff = m => { let last = null; const seed = m.get([...m.keys()].sort((a, c) => a - c)[0]); return ts.map(t => { if (m.has(t)) last = m.get(t); return last ?? seed; }); };
    const ser = {}; for (const k of Object.keys(raw)) ser[k] = ff(raw[k]);
    const rel = a => a.map(v => (v / a[0] - 1) * 100), spy = rel(ser.SPY), parts = ['GOLD', 'SQQQ', 'VIX'].map(k => ser[k] ? rel(ser[k]) : ts.map(() => 0));
    const ndx = ts.map((_, i) => .25 * (parts[0][i] + parts[1][i] + parts[2][i]));
    S.hist = { t: ts, spy, ndx, ser }; onHist(); }
  function histFail() { setT('#cdWhen', 'GeckoTerminal is busy');  setT('#vsSay', "GeckoTerminal didn't answer, so the 15-day chart is offline for now."); setT('#lvl', 'offline'); }
  function onHist() { const H = S.hist, L = a => a[a.length - 1], s15 = L(H.spy), n15 = L(H.ndx);
    setT('#lvl', (1000 * (1 + n15 / 100)).toFixed(1)); setT('#hwLvl', 'index level ' + (1000 * (1 + n15 / 100)).toFixed(1)); HW.t0 = 0; HW.w = 0;
    if ($('#vsSay')) $('#vsSay').innerHTML = `15 days: stocks <span class="${cls(s15)}">${spct(s15)}</span>, the four <span class="${n15 >= 0 ? 'g' : 'dn'}">${spct(n15)}</span>.`;
    void `$100 in the four 15 days ago would be about <span class="${cls(n15)}">${usd(100 * (1 + n15 / 100), 2)}</span> now; the same $100 in the S&amp;P 500, <span class="${cls(s15)}">${usd(100 * (1 + s15 / 100), 2)}</span>. Before fees, past moves only.`;
    renderDetail(false); renderFloats(); CH.t0 = 0;
    // the worst 4 hours for the S&P in the window, and what each part did in those same 4 hours
    let wi = 1, wv = 0; for (let i = 1; i < H.t.length; i++) { const r = H.ser.SPY[i] / H.ser.SPY[i - 1] - 1; if (r < wv) { wv = r; wi = i; } }
    const mv = k => H.ser[k] ? (H.ser[k][wi] / H.ser[k][wi - 1] - 1) * 100 : 0;
    const rows = [{ k: 'SPY', n: 'the S&P 500', v: wv * 100, c: DN }, { k: 'GOLD', n: 'gold', v: mv('GOLD'), c: SEG[0] }, { k: 'SQQQ', n: 'the short Nasdaq', v: mv('SQQQ'), c: SEG[1] }, { k: 'VIX', n: 'VIX', v: mv('VIX'), c: SEG[2] }, { k: 'USD', n: 'dollars', v: 0, c: SEG[3] }];
    const four = .25 * (rows[1].v + rows[2].v + rows[3].v); rows.push({ k: 'FOUR', n: 'the 1ndex four', v: four, c: 'grad' });
    const t0 = new Date(H.t[wi - 1] * 1000), f = d => d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
    if (!$('#cdLabs')) { S.cd = { rows, when: '' }; return; } S.cd = { rows, when: f(t0) + '–' + new Date(H.t[wi - 1] * 1000 + 4 * 36e5).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC' };
    whyBars([rows[0], ...(H.ser.SOL ? [{ n: 'SOL', v: mv('SOL'), c: H.ser.SOL && mv('SOL') < 0 ? DN : UP }] : []), { n: 'the 1ndex four', v: four, c: 'grad' }]); setT('#cdWhen', S.cd.when); $('#cdLabs').innerHTML = rows.map((r, i) => `<div class="cd-lab" data-i="${i}"><b>—</b>${esc(r.n)}</div>`).join(''); CD.phase = -1; }

  // ---------------------------------------------------------------- the crash, replayed as you scroll
  const CD = { phase: -1, rain: [] };
  const PH = [[.06, .26], [.30, .40], [.42, .52], [.54, .64], [.66, .72], [.76, .9]];
  function cdSay(i, rows) { const [s, gd, sq, vx, , four] = rows.map(r => r.v), a = x => Math.abs(x).toFixed(2) + '%';
    return [`${S.cd.when.split(',')[0]}. the S&amp;P 500 ${s < 0 ? 'loses' : 'moves'} <span class="dn">${a(s)}</span> in four hours.`,
      `gold ${gd < 0 ? 'slips' : 'gains'} <span class="${cls(gd)}">${a(gd)}</span>. it doesn't always help.`,
      `the short Nasdaq ${sq >= 0 ? 'jumps' : 'falls'} <span class="${cls(sq)}">${a(sq)}</span>.`,
      `VIX, the fear gauge, ${vx >= 0 ? 'spikes' : 'falls'} <span class="${cls(vx)}">${a(vx)}</span>.`,
      `dollars stay a dollar.`,
      four >= 0 ? `a quarter in each: the four <span class="g">made ${a(four)}</span> while stocks lost ${a(s)}.` : `a quarter in each: the four lost ${a(four)}, against ${a(s)} for stocks.`][i]; }
  function cdFrame() {
    if (!$('#crashday')) return; requestAnimationFrame(cdFrame); const sec = $('#crashday'), r = sec.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight || document.hidden) return;
    const p = clamp(-r.top / (r.height - innerHeight)), c = $('#cdCanvas'), [g, W, H] = fit(c), mob = W < 760, stick = $('#cdStick');
    const ks = PH.map(([a, b]) => RM ? (p > a ? 1 : 0) : out(clamp((p - a) / (b - a)))), phase = ks.reduce((n, k, i) => k > 0 ? i : n, -1);
    $$('#cdSteps i').forEach((el, i) => el.classList.toggle('on', i === phase));
    g.clearRect(0, 0, W, H); if (!S.cd) return;
    const rows = S.cd.rows; if (phase !== CD.phase) { if (phase >= 0) cue(phase === 0 ? 'thud' : phase === 5 ? 'chime' : 'tick'); CD.phase = phase; }
    stick.style.setProperty('--tint', (ks[0] * (1 - ks[5])).toFixed(3)); stick.style.setProperty('--gl', ks[5].toFixed(3));
    const shake = ks[0] > 0 && ks[0] < 1 && !RM ? 5 * (1 - ks[0]) : 0; $('#cdMid').style.transform = shake ? `translate(${(Math.random() - .5) * shake}px, ${(Math.random() - .5) * shake}px)` : '';
    // the big number
    const four = ks[5] > .05, bv = four ? rows[5].v * ks[5] : rows[0].v * ks[0], big = $('#cdBig');
    big.classList.toggle('four', four); setT('#cdBigK', four ? 'the 1ndex four · same four hours' : 'the S&P 500'); setT('#cdBigV', spct(bv)); $('#cdBigV').style.color = four ? '' : (ks[0] > 0 ? DN : MUTE);
    // the bars, built from pixel cells, hanging from one zero line
    const padL = 28, x0 = mob ? padL : W * .5, x1 = W - (mob ? 28 : 64), top = mob ? H * .36 : H * .08, bot = H - (mob ? 54 : 58);
    const ups = Math.max(1, ...rows.map(r => Math.max(0, r.v))), dns = Math.max(1, ...rows.map(r => Math.max(0, -r.v)));
    const y0 = top + (bot - top) * clamp(ups / (ups + dns), .55, .82), sc = Math.min((y0 - top - 40) / ups, (bot - y0) / dns);
    const cw = (x1 - x0) / (rows.length + .4), bw0 = Math.min(84, cw * .62), cell = mob ? 6 : 9, gapc = 3;
    g.strokeStyle = LINE2; g.lineWidth = 1; g.beginPath(); g.moveTo(x0 - 10, y0 + .5); g.lineTo(x1 + 10, y0 + .5); g.stroke();
    g.font = '500 11px JB'; g.fillStyle = DIM; g.textAlign = 'left'; g.fillText('0%', x1 + 14 > W - 20 ? x0 - 10 : x1 + 14, y0 + 4);
    const order = [0, 1, 2, 3, 4, 5];
    order.forEach(i => { const row = rows[i], k = ks[i], cx = x0 + cw * (i + .5 + (i === 5 ? .4 : 0)), bw = i === 5 ? Math.min(118, cw * .9) : bw0, lab = $(`.cd-lab[data-i="${i}"]`);
      if (i === 5 && k > 0) { g.strokeStyle = LINE2; g.setLineDash([3, 5]); g.beginPath(); g.moveTo(x0 + cw * 5.2, top + 20); g.lineTo(x0 + cw * 5.2, bot); g.stroke(); g.setLineDash([]); }
      const hgt = Math.abs(row.v) * sc * k, upv = row.v >= 0, n = Math.floor(hgt / (cell + gapc)), rem = hgt - n * (cell + gapc);
      const fill = row.c === 'grad' ? grad(g, 0, y0, 0, y0 - Math.max(40, Math.abs(row.v) * sc)) : row.c;
      if (k > 0) { g.fillStyle = 'rgba(0,0,0,.4)'; for (let j = 0; j < n; j++) { const y = upv ? y0 - (j + 1) * (cell + gapc) + gapc : y0 + j * (cell + gapc) + 2; g.fillRect(cx - bw / 2 + 4, y + 4, bw, cell); }
        g.fillStyle = fill; for (let j = 0; j < n; j++) { const y = upv ? y0 - (j + 1) * (cell + gapc) + gapc : y0 + j * (cell + gapc) + 2; g.fillRect(cx - bw / 2, y, bw, cell); }
        if (rem > 1) { const y = upv ? y0 - n * (cell + gapc) - rem + gapc : y0 + n * (cell + gapc) + 2; g.fillRect(cx - bw / 2, y, bw, Math.max(1, rem - gapc)); }
        if (Math.abs(row.v) < .05) { g.fillStyle = row.c; g.fillRect(cx - bw / 2, y0 - 3, bw, 6); } }
      if (lab) { lab.classList.toggle('on', k > .02); const lb = lab.firstChild; lb.textContent = spct(row.v * k); lb.style.color = row.c === 'grad' ? SEG[0] : row.v < 0 ? DN : row.v > 0 ? UP : LAV;
        const ly = upv ? y0 - hgt - 62 : y0 + hgt + 12; lab.style.left = clamp(cx, 56, W - 56) + 'px'; lab.style.top = clamp(ly, 0, H - 40) + 'px'; } });
    // the arrows rain while stocks fall
    if (!RM && ks[0] > 0 && ks[0] < 1 && CD.rain.length < 50) CD.rain.push({ x: Math.random() * W, y: -20, v: 3 + Math.random() * 5, s: 6 + Math.floor(Math.random() * 3) * 3 });
    g.globalAlpha = .5; CD.rain = CD.rain.filter(d => { d.y += d.v; if (d.y > H) return false; arrow(g, d.x, d.y, d.s, DN, false); return true; }); g.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- the four: the ring is the picker
  const RP = { sel: 0, hover: -1, auto: true, pop: [0, 0, 0, 0], lastAuto: 0, built: false };
  const ARTK = ['gold', 'short', 'vol', 'cash'];
  function drawArt(c, k, s) { const g = sized(c, s, s); g.scale(s / 88, s / 88); g.fillStyle = '#141c47'; g.fillRect(0, 0, 88, 88);
    if (k === 'gold' && A.goldBar) A.goldBar(g, 9, 34, 5);
    else if (k === 'short' && A.bear) { A.bear(g, 10, 12, 4, A.bearSpec(rng(9))); arrow(g, 62, 10, 16, DN, false); }
    else if (k === 'vol') { const P = [[8, 62], [20, 58], [31, 64], [42, 55], [51, 20], [60, 46], [70, 38], [80, 50]]; g.lineWidth = 5; g.lineJoin = 'round'; g.strokeStyle = 'rgba(0,0,0,.5)'; g.beginPath(); P.forEach(([x, y], i) => i ? g.lineTo(x + 3, y + 3) : g.moveTo(x + 3, y + 3)); g.stroke(); g.strokeStyle = SEG[2]; g.beginPath(); P.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); }
    else { g.fillStyle = '#060917'; g.fillRect(20, 30, 52, 34); g.fillStyle = '#c9f2e2'; g.fillRect(15, 25, 52, 34); g.fillStyle = '#16a874'; g.fillRect(15, 25, 52, 5); g.fillRect(15, 54, 52, 5); g.font = '700 24px PX'; g.fillStyle = '#060917'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 41, 43); } }
  function spark(c, a, col) { if (!c || !a) return; const [g, w, h] = fit(c); g.clearRect(0, 0, w, h); const mn = Math.min(...a), mx = Math.max(...a), Y = v => h - 6 - (v - mn) / (mx - mn || 1) * (h - 12), X = i => i / (a.length - 1) * (w - 4);
    g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.45)'; g.beginPath(); a.forEach((v, i) => i ? g.lineTo(X(i) + 3, Y(v) + 3) : g.moveTo(X(i) + 3, Y(v) + 3)); g.stroke();
    g.strokeStyle = col; g.beginPath(); a.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))); g.stroke(); }
  function renderPicker() { if (!M().length) return; const ch = $('#chips4');
    if (!RP.built) { RP.built = true; ch.innerHTML = M().map((m, i) => `<button role="tab" style="--c:${SEG[i]}" data-i="${i}"><i></i>${esc(NAMES[m.symbol])}</button>`).join('');
      $$('#chips4 button').forEach(b => b.addEventListener('click', () => pick(+b.dataset.i, true))); renderDetail(true); }
    else renderDetail(false); }
  function pick(i, user) { if (user) RP.auto = false; if (i === RP.sel && !user) return; RP.sel = i; cue('pop'); renderDetail(true); }
  function renderDetail(swap) { const m = M()[RP.sel]; if (!m) return; const i = RP.sel, p = m.price || {}, d = $('#detail'), note = String(m.note || '');
    d.style.setProperty('--c', SEG[i]); $$('#chips4 button').forEach((b, j) => { b.classList.toggle('on', j === i); b.setAttribute('aria-selected', j === i); });
    d.innerHTML = `<div class="dt-top">${badge(m.symbol, i, 'lg')}<div><div class="dt-k">0${i + 1} · a quarter of the index</div><div class="dt-tk">${esc(m.ticker)} · ${esc(m.name)}</div></div></div>`
      + `<h3 class="dt-name">${esc(NAMES[m.symbol])}</h3><div class="dt-px"><b>${usd(p.usd)}</b><span class="${cls(p.ch24)}">${pct(p.ch24)} 24h</span></div><canvas class="dt-spark" aria-label="15 days"></canvas>`
      + `<p class="dt-note">${esc(note.charAt(0).toUpperCase() + note.slice(1))}</p><div class="dt-meta"><span>liquidity <b>${big(p.liquidity)}</b></span><span>24h volume <b>${big(p.vol24)}</b></span>${p.pool ? `<a href="https://dexscreener.com/solana/${p.pool}" target="_blank" rel="noopener">${esc(p.dex || 'pool')} pool ↗</a>` : ''}</div>`;
    if (swap) { d.classList.remove('swap'); void d.offsetWidth; d.classList.add('swap'); }
    RP.drawn = null; const sp = $('.dt-spark', d);
    if (S.hist) { if (m.symbol === 'USD') smooth(sp, S.hist.t.map(() => 1), SEG[i]); else if (S.hist.ser[m.symbol]) smooth(sp, S.hist.ser[m.symbol], SEG[i]); } }
  function ringInit() { const c = $('#ringCv'); watch(c, 'ring');
    const at = e => { const b = c.getBoundingClientRect(), x = (e.clientX - b.left) / b.width - .5, y = (e.clientY - b.top) / b.height - .5, r = Math.hypot(x, y); if (r < .2 || r > .52) return -1; let a = Math.atan2(y, x) + Math.PI / 2; if (a < 0) a += Math.PI * 2; return Math.floor(a / (Math.PI / 2)) % 4; };
    c.addEventListener('pointermove', e => { const k = at(e); RP.hover = k; c.style.cursor = k >= 0 ? 'pointer' : 'default'; });
    c.addEventListener('pointerleave', () => RP.hover = -1);
    c.addEventListener('click', e => { const k = at(e); if (k >= 0) pick(k, true); }); }
  function ringFrame(now) { requestAnimationFrame(ringFrame); if (!vis.ring || document.hidden) return; const c = $('#ringCv'), [g, W] = fit(c);
    if (RP.auto && M().length && now - RP.lastAuto > 3600) { if (RP.lastAuto) pick((RP.sel + 1) % 4, false); RP.lastAuto = now; }
    let moving = false; RP.pop = RP.pop.map((v, k) => { const t = k === RP.sel ? 1 : k === RP.hover ? .55 : 0, n = RM ? t : v + (t - v) * .16; if (Math.abs(n - t) > .002) moving = true; return n; });
    if (!moving && RP.drawn === RP.sel + ':' + RP.hover && RP.w === W) return; RP.drawn = moving ? null : RP.sel + ':' + RP.hover; RP.w = W;
    g.clearRect(0, 0, W, W); const size = W * .84, p = size / N, x0 = (W - size) / 2, y0 = (W - size) / 2;
    for (const pass of [0, 1]) for (let k = -1; k < 4; k++) { const ang = (k + .5) * Math.PI / 2, off = k < 0 ? 0 : RP.pop[k] * size * .045, dx = Math.sin(ang) * off, dy = -Math.cos(ang) * off;
      g.globalAlpha = k < 0 || pass === 0 ? 1 : .5 + .5 * Math.max(RP.pop[k], RP.sel === k ? 1 : 0);
      g.fillStyle = pass === 0 ? SH : k < 0 ? LAV : SEG[k]; const sh = pass === 0 ? p * (1 + (k >= 0 ? RP.pop[k] * .8 : 0)) : 0;
      for (const [x, y, s] of CELLS) if (s === k) g.fillRect(x0 + x * p + dx + sh, y0 + y * p + dy + sh, p + .4, p + .4); }
    g.globalAlpha = 1; }
  const CH = { t0: 0, hover: -1 };
  function chartFrame(now) { if (!$('#chart')) return; requestAnimationFrame(chartFrame); const c = $('#chart'), H = S.hist; if (!c || !H || !vis.chart || document.hidden) return;
    if (!CH.t0) CH.t0 = now; const k = RM ? 1 : Math.min(1, (now - CH.t0) / 1800), [g, w, h] = fit(c);
    if (k >= 1 && CH.drawn === CH.hover && CH.w === w) return; CH.drawn = k >= 1 ? CH.hover : null; CH.w = w;
    g.clearRect(0, 0, w, h); const pl = 54, pr = 20, pt = 22, pb = 34, iw = w - pl - pr, ih = h - pt - pb;
    const all = [...H.spy, ...H.ndx, 0], mn = Math.floor(Math.min(...all)) - .5, mx = Math.ceil(Math.max(...all)) + .5, Y = v => pt + ih - (v - mn) / (mx - mn) * ih, X = i => pl + i / (H.t.length - 1) * iw;
    g.font = '500 11px JB'; g.fillStyle = 'rgba(232,236,255,.45)'; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let v = Math.ceil(mn); v <= mx; v += Math.max(1, Math.round((mx - mn) / 6))) { g.strokeStyle = v === 0 ? 'rgba(232,236,255,.3)' : 'rgba(154,166,217,.08)'; g.setLineDash(v === 0 ? [] : [3, 5]); g.beginPath(); g.moveTo(pl, Y(v)); g.lineTo(w - pr, Y(v)); g.stroke(); g.fillText((v > 0 ? '+' : '') + v + '%', pl - 10, Y(v)); }
    g.setLineDash([]); g.textAlign = 'center'; g.textBaseline = 'top'; for (let i = 0; i < H.t.length; i += Math.ceil(H.t.length / (w < 600 ? 4 : 7))) g.fillText(new Date(H.t[i] * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), X(i), h - pb + 10);
    const n = Math.max(2, Math.floor(k * H.t.length)), path = (key, ox, oy) => { g.beginPath(); for (let i = 0; i < n; i++) i ? g.lineTo(X(i) + ox, Y(H[key][i]) + oy) : g.moveTo(X(i) + ox, Y(H[key][i]) + oy); g.stroke(); };
    // the gap between them, filled where the four are ahead
    if (n > 2) { g.globalAlpha = .1; g.fillStyle = grad(g, pl, 0, w - pr, 0); g.beginPath(); for (let i = 0; i < n; i++) i ? g.lineTo(X(i), Y(H.ndx[i])) : g.moveTo(X(i), Y(H.ndx[i])); for (let i = n - 1; i >= 0; i--) g.lineTo(X(i), Y(H.spy[i])); g.closePath(); g.fill(); g.globalAlpha = 1; }
    g.lineJoin = 'round'; g.lineWidth = 2.5; g.strokeStyle = 'rgba(0,0,0,.5)'; path('spy', 3, 3); g.strokeStyle = DN; path('spy', 0, 0);
    g.lineWidth = 4; g.strokeStyle = SH; path('ndx', 4, 4); g.strokeStyle = grad(g, pl, 0, w - pr, 0); path('ndx', 0, 0);
    if (k >= 1) { const Lx = H.t.length - 1; [['spy', DN], ['ndx', SEG[0]]].forEach(([key, col]) => { const v = H[key][Lx]; g.fillStyle = col; g.fillRect(X(Lx) - 5, Y(v) - 5, 10, 10); g.font = '700 13px JB'; g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText(spct(v), X(Lx) - 10, Y(v) - 8); }); }
    const tip = $('#tip'); if (k >= 1 && CH.hover >= 0) { const i = CH.hover; g.strokeStyle = 'rgba(232,236,255,.35)'; g.beginPath(); g.moveTo(X(i), pt); g.lineTo(X(i), pt + ih); g.stroke(); tip.hidden = false;
      tip.innerHTML = `<b>${new Date(H.t[i] * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</b><span class="s">S&amp;P ${spct(H.spy[i])}</span><span class="n">the four ${spct(H.ndx[i])}</span>`; tip.style.left = Math.min(w - 180, Math.max(8, X(i) + 14)) + 'px'; } else tip.hidden = true; }
  function chartInit() { const c = $('#chart'); if (!c) return; watch(c, 'chart'); c.addEventListener('pointermove', e => { if (!S.hist) return; const b = c.getBoundingClientRect(); CH.hover = clamp(Math.round((e.clientX - b.left - 54) / (b.width - 74) * (S.hist.t.length - 1)), 0, S.hist.t.length - 1); }); c.addEventListener('pointerleave', () => CH.hover = -1); }

  // ---------------------------------------------------------------- push the market: a dial and four columns
  const EQ = { cur: [25, 25, 25, 25], tgt: [25, 25, 25, 25] };
  const pushVals = s => { const x = s / 100, nq = x * 1.25, sq = Math.max(-1, -3 * nq), vx = Math.max(-.9, -3.5 * x), q = 25; return [q, q * (1 + sq), q * (1 + vx), q]; };
  const PNOTE = ['GLDx tracks gold, held flat here. Some sell-offs it rises, some it dips.', 'SQQQ aims for −3× the Nasdaq-100 each day, and bleeds in calm or choppy weeks.', 'UVXY follows short-term VIX futures. It spikes on crashes and decays the rest of the time.', 'USDC stays a dollar, and the treasury rebalances with it.'];
  function renderPush() { const s = +$('#touch').value, x = s / 100, v = EQ.tgt = pushVals(s), four = v.reduce((a, b) => a + b, 0), spy = 100 * (1 + x);
    const mv = $('#mv'); mv.textContent = (s > 0 ? '+' : s < 0 ? '−' : '') + Math.abs(s) + '%'; mv.classList.toggle('green', s > 0);
    setT('#tFour', usd(four, 2)); $('#tFourD').innerHTML = `<span class="${cls(four - 100)}">${four >= 100 ? '+' : '−'}${usd(Math.abs(four - 100), 2)}</span>`;
    setT('#tSpy', usd(spy, 2)); $('#tSpyD').innerHTML = `<span class="${cls(spy - 100)}">${spy >= 100 ? '+' : '−'}${usd(Math.abs(spy - 100), 2)}</span>`;
    $$('#presets button').forEach(b => b.classList.toggle('on', +b.dataset.v === s));
    const lab = $('#eqLab'); if (!lab.children.length) lab.innerHTML = ['gold', 'the short Nasdaq', 'VIX', 'dollars'].map((n, i) => `<div style="--c:${SEG[i]}"><b>${n}</b><span></span></div>`).join('');
    $$('#eqLab span').forEach((el, i) => { const d = v[i] - 25; el.innerHTML = `$25 → ${usd(v[i], 2)}${Math.abs(d) > .005 ? ` <em class="${cls(d)}" style="font-style:normal">${d > 0 ? '+' : '−'}${usd(Math.abs(d), 2)}</em>` : ''}`; }); }
  function pushInit() { const t = $('#touch'); if (!t) return; t.addEventListener('input', () => { cue('tick'); renderPush(); }); $$('#presets button').forEach(b => b.addEventListener('click', () => { t.value = b.dataset.v; cue('pop'); renderPush(); })); watch($('#eqCv'), 'eq'); renderPush(); }
  function eqFrame() { if (!$('#eqCv')) return; requestAnimationFrame(eqFrame); if (!vis.eq || document.hidden) return; const c = $('#eqCv'), [g, W, H] = fit(c);
    let moving = false; EQ.cur = EQ.cur.map((v, i) => { const n = RM ? EQ.tgt[i] : v + (EQ.tgt[i] - v) * .14; if (Math.abs(n - EQ.tgt[i]) > .01) moving = true; return n; });
    if (!moving && EQ.drawn === EQ.tgt.join() && EQ.w === W) return; EQ.drawn = moving ? null : EQ.tgt.join(); EQ.w = W;
    g.clearRect(0, 0, W, H); const top = 34, bot = H - 6, maxV = Math.max(52, ...EQ.cur) * 1.04, Y = v => bot - v / maxV * (bot - top), cw = W / 4, bw = Math.min(120, cw * .66), cell = 10, gp = 3;
    g.strokeStyle = LINE2; g.setLineDash([5, 6]); g.beginPath(); g.moveTo(0, Y(25) + .5); g.lineTo(W, Y(25) + .5); g.stroke(); g.setLineDash([]);
    g.font = '500 11px JB'; g.fillStyle = DIM; g.textAlign = 'left'; g.fillText('$25 each', 4, Y(25) - 8);
    EQ.cur.forEach((v, i) => { const cx = cw * (i + .5), hgt = bot - Y(v), n = Math.floor(hgt / (cell + gp)), y25 = Y(25);
      if (v < 25) { g.strokeStyle = 'rgba(255,90,122,.6)'; g.setLineDash([4, 4]); g.strokeRect(cx - bw / 2 + .5, y25 + .5, bw - 1, Y(v) - y25); g.setLineDash([]); }
      for (let j = 0; j < n; j++) { const y = bot - (j + 1) * (cell + gp) + gp; g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(cx - bw / 2 + 4, y + 4, bw, cell); g.fillStyle = y < y25 ? SEG[i] : SEG[i] + 'aa'; g.fillRect(cx - bw / 2, y, bw, cell); }
      g.font = '700 14px JB'; g.textAlign = 'center'; g.fillStyle = LAV; g.fillText(usd(v, 2), cx, Y(v) - 12); }); }

  // ---------------------------------------------------------------- the coin: how a trade turns into the four
  const PP = { coins: [], last: 0, nodes: null, mob: null, flash: {} };
  function pipeLayout(W, H) { const mob = W < 760; if (PP.mob === mob && PP.nodes) return; PP.mob = mob;
    const OUT = ['gold', 'the short Nasdaq', 'VIX', 'dollars'];
    const n = mob ? { t: [.5, .09], f: [.5, .29], r: [.5, .5], o: [[.26, .73], [.74, .73], [.26, .91], [.74, .91]], g: null }
      : { t: [.11, .5], f: [.34, .5], r: [.58, .5], o: [[.875, .14], [.875, .38], [.875, .62], [.875, .86]], g: [.34, .86] };
    PP.nodes = n;
    $('#pipeLabs').innerHTML = `<div class="pn pill" style="left:${n.t[0] * 100}%;top:${n.t[1] * 100}%"><b>someone trades $1NDEX</b><span>on its LaunchLab curve</span><em id="pe0"></em></div>`
      + `<div class="pn pill" style="left:${n.f[0] * 100}%;top:${n.f[1] * 100}%"><b class="g">1% to the index</b><span>the launchpad's fee</span><em id="pe1"></em></div>`
      + `<div class="pn pill hot" id="pnR" style="left:${n.r[0] * 100}%;top:${n.r[1] * 100}%"><b>the treasury</b><span>tops up whatever is under 25%</span><em id="pe2"></em></div>`
      + n.o.map(([x, y], i) => `<div class="pn pill" id="pnO${i}" style="left:${x * 100}%;top:${y * 100}%;border-color:${SEG[i]}"><b style="color:${SEG[i]}">${OUT[i]}</b><span>25%</span><em id="peo${i}"></em></div>`).join('')
      + (n.g ? `<div class="pn pill" style="left:${n.g[0] * 100}%;top:${n.g[1] * 100}%;border-style:dashed"><b>graduation at 85 SOL</b><span>half the LP burned, half a fee key</span></div>` : ''); simLabels(); }
  function route(a, b, W, H, vert) { const ax = a[0] * W, ay = a[1] * H, bx = b[0] * W, by = b[1] * H; if (vert) { const my = (ay + by) / 2; return [[ax, ay], [ax, my], [bx, my], [bx, by]]; } const mx = (ax + bx) / 2; return [[ax, ay], [mx, ay], [mx, by], [bx, by]]; }
  function along(pts, t) { const seg = []; let L = 0; for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); L += l; } let d = t * L; for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) { const k = seg[i] ? d / seg[i] : 0; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k]; } d -= seg[i]; } return pts[pts.length - 1]; }
  function pipeFrame(now) { requestAnimationFrame(pipeFrame); if (!vis.pipe || document.hidden) return; const c = $('#pipeCv'), [g, W, H] = fit(c); pipeLayout(W, H); const n = PP.nodes, mob = PP.mob;
    const P = { tf: route(n.t, n.f, W, H, mob), fr: route(n.f, n.r, W, H, mob), ro: n.o.map(o => route(n.r, o, W, H, mob)), gr: n.g ? route(n.g, n.r, W, H, false) : null };
    if (n.g) P.gr = [[n.g[0] * W, n.g[1] * H], [n.r[0] * W, n.g[1] * H], [n.r[0] * W, n.r[1] * H]];
    g.clearRect(0, 0, W, H); g.lineWidth = 2; g.strokeStyle = LINE2;
    const line = (pts, dash) => { g.setLineDash(dash ? [6, 6] : []); g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); }; line(P.tf); line(P.fr); P.ro.forEach((p, i) => { g.strokeStyle = SEG[i] + '66'; line(p); }); if (P.gr) { g.strokeStyle = LINE2; line(P.gr, true); } g.setLineDash([]);
    if (PP.burst > 0 && now - (PP.lb || 0) > 60) { PP.lb = now; PP.burst--; PP.coins.push({ s: 0, t: 0, k: PP.burst % 4, big: 1 }); }
    if (!RM && now - PP.last > 300) { PP.last = now; PP.coins.push({ s: 0, t: 0, k: Math.floor(Math.random() * 4) }); if (P.gr && Math.random() < .08) PP.coins.push({ s: 9, t: 0, k: 0 }); }
    PP.coins = PP.coins.filter(co => { co.t += co.s === 9 ? .006 : .012; if (co.t >= 1) { if (co.s === 0) { co.s = 1; co.t = 0; } else if (co.s === 1 || co.s === 9) { co.s = 2; co.t = 0; } else { PP.flash[co.k] = now; return false; } }
      const pts = co.s === 0 ? P.tf : co.s === 1 ? P.fr : co.s === 9 ? P.gr : P.ro[co.k], [x, y] = along(pts, co.t), sz = co.s === 9 ? 14 : co.s === 0 ? 6 : 9, col = co.s === 0 ? LAV : co.s === 2 ? SEG[co.k] : co.s === 9 ? SEG[3] : SEG[0];
      g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(x - sz / 2 + 3, y - sz / 2 + 3, sz, sz); g.fillStyle = col; g.fillRect(x - sz / 2, y - sz / 2, sz, sz); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x - sz / 2, y - sz / 2, sz / 3, sz / 3); return true; });
    for (let i = 0; i < 4; i++) { const el = $('#pnO' + i); if (el) el.style.background = now - (PP.flash[i] || 0) < 160 ? SEG[i] + '33' : ''; } }

  // ---------------------------------------------------------------- the coin, the treasury, the pools (read from the chain)
  async function loadCoin() { const box = $('#coinBox'); try { const c = S.coin = await api('coin');
    if (!c.live) { box.innerHTML = `<div class="soon"><b class="g">not launched yet.</b><div class="cbar"><i style="width:0"></i></div><p class="fine">0 / 85 SOL raised</p></div>`; return; }
    const pr = Math.min(1, c.progress || 0);
    box.innerHTML = `<div class="clive"><div class="cp"><div><small>market cap</small><b>${(+c.mcapSol).toFixed(1)} SOL</b></div><div><small>raised</small><b>${c.raisedSol.toFixed(2)} / ${c.raiseSol} SOL</b></div><div><small>to the index so far</small><b>${c.platformFeeSol.toFixed(3)} SOL</b></div></div><div class="cbar"><i style="width:${(pr * 100).toFixed(1)}%"></i></div><p class="fine">${c.graduated ? 'graduated to Raydium' : 'on its LaunchLab curve'} · <a href="https://raydium.io/launchpad/token/?mint=${c.mint}" target="_blank" rel="noopener">trade on Raydium ↗</a> · <a href="https://solscan.io/token/${c.mint}" target="_blank" rel="noopener">${short(c.mint)} ↗</a></p></div>`;
  } catch (e) { box.innerHTML = `<div class="empty">couldn't read the chain (${esc(e.message)}). retrying.</div>`; } }
  async function loadTreasury() { try { S.tre = await api('treasury'); } catch (e) { S.tre = { error: e.message }; } renderVaults(); if (S.tre && S.tre.live) loadActivity(); }
  function renderVaults() { const el = $('#vaults'); if (!el || !M().length) return; const t = S.tre, live = t && t.live, tot = live ? t.basketUsd || 0 : 0;
    el.innerHTML = M().map((m, i) => { const h = live ? (t.holdings || []).find(x => x.symbol === m.symbol) : null, share = h && tot ? h.usd / tot * 100 : 0, f = Math.min(100, share / 25 * 100);
      return `<div class="vault" style="--c:${SEG[i]};--f:${f.toFixed(1)}"><div class="vt">${badge(m.symbol, i)}<div><b>${esc(NAMES[m.symbol])}</b><small>${esc(m.ticker)}</small></div></div><div class="vring"><span><b>${live ? share.toFixed(1) + '%' : '0%'}</b><small>${t && t.error ? 'offline' : 'of 25%'}</small></span></div><div class="vn"><span>held</span><b>${h ? usd(h.usd, 2) : '$0.00'}</b></div></div>`; }).join('');
    setT('#held', live ? usd(tot, 2) : '$0.00'); setT('#unclaimed', live ? (+t.unclaimedSol).toFixed(3) + ' SOL' : '0 SOL');
    $('#treWallet').innerHTML = live && t.wallet ? `treasury <a href="https://solscan.io/account/${t.wallet}" target="_blank" rel="noopener" style="color:var(--s1)">${short(t.wallet)} ↗</a>` : ''; }
  async function loadActivity() { try { const a = await api('activity'); if (!a.items || !a.items.length) return; $('#activity').innerHTML = a.items.map(x => `<a class="row" href="https://solscan.io/tx/${x.sig}" target="_blank" rel="noopener"><span class="nmx">${esc(x.kind)}<i>${new Date(x.time * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</i></span><span>${short(x.sig)}</span><span><i>solscan</i></span><span class="ar">↗</span></a>`).join(''); } catch (e) { } }
  function renderPools() { $('#poolList').innerHTML = [['the S&P 500', S.b.benchmark, 'benchmark'], ...M().map(m => [NAMES[m.symbol] || m.symbol, m, ''])].map(([n, m, tag]) => { const p = m.price; return p ? `<a class="row" href="https://dexscreener.com/solana/${p.pool}" target="_blank" rel="noopener"><span class="nmx">${esc(n)}<i>${esc(m.ticker || m.symbol)} · ${esc(p.dex || '')}${tag ? ' · ' + tag : ''}</i></span><span>${big(p.liquidity)} <i>liquidity</i></span><span>${big(p.vol24)} <i>24h</i></span><span class="ar">↗</span></a>` : ''; }).join(''); }
  function nextReb() { const n = new Date(), d = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())); d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7)); const ms = d - n; return `${Math.floor(ms / 864e5)}d ${String(Math.floor(ms % 864e5 / 36e5)).padStart(2, '0')}h`; }
  const clock = () => { setT('#reb', nextReb()); setT('#reb2', nextReb()); if (S.b) renderLive(); };

  // ---------------------------------------------------------------- the end: the other side, rising
  const OU = { p: [] };
  function outroFrame() { if (!$('#outroCv')) return; requestAnimationFrame(outroFrame); requestAnimationFrame(winFrame); requestAnimationFrame(donutFrame); requestAnimationFrame(wv3Frame); if (!vis.outro || document.hidden || RM) return; const c = $('#outroCv'), [g, W, H] = fit(c);
    if (OU.p.length < (W < 700 ? 40 : 90) && Math.random() < .5) { const up = Math.random() < .82; OU.p.push({ x: Math.random() * W, y: up ? H + 10 : -20, v: up ? -(.5 + Math.random() * 1.3) : 1.5 + Math.random() * 2, s: 6 + Math.floor(Math.random() * 3) * 3, up, c: up ? SEG[Math.floor(Math.random() * 4)] : DN }); }
    g.clearRect(0, 0, W, H); g.globalAlpha = .35; OU.p = OU.p.filter(p => { p.y += p.v; if (p.y < -30 || p.y > H + 30) return false; arrow(g, p.x, p.y, p.s, p.c, p.up); return true; }); g.globalAlpha = 1; }

  // ---------------------------------------------------------------- why: the same four hours for SOL, and the one-ticker loop
  function whyBars(rows) { const el = $('#whyBars'); if (!el) return; const mx = Math.max(...rows.map(r => Math.abs(r.v)), .01);
    el.innerHTML = rows.map(r => `<div style="--c:${r.c === 'grad' ? 'linear-gradient(90deg,#22d1f8,#c200fb)' : r.c};--w:${(Math.abs(r.v) / mx * 100).toFixed(1)}%"><span>${esc(r.n)}</span><i style="background:${r.c === 'grad' ? 'var(--grad)' : r.c}"></i><b class="${r.c === 'grad' ? 'g' : cls(r.v)}">${spct(r.v)}</b></div>`).join('') + `<small>${esc(S.cd.when.split(',')[0])} · the S&amp;P's worst 4 hours in 15 days</small>`; }
  function wv3Frame(now) { requestAnimationFrame(wv3Frame); if (!vis.wv3 || document.hidden) return; const c = $('#wv3'), [g, W, H] = fit(c);
    const T = RM ? 3 : (now / 1000) % 4.2, k = T < 1.4 ? 1 : T < 2 ? 1 - out((T - 1.4) / .6) : 0, s = Math.min(H * .9, 118, W * .28), p = s / N, x0 = 6, y0 = (H - s) / 2;
    if (!RM && T >= 2 && T < 2.05 && !wv3Frame.c) { wv3Frame.c = 1; } if (T < 1) wv3Frame.c = 0;
    g.clearRect(0, 0, W, H);
    for (const pass of [0, 1]) for (let q = -1; q < 4; q++) { const ang = (q + .5) * Math.PI / 2, off = q < 0 ? 0 : k * s * .16, dx = Math.sin(ang) * off, dy = -Math.cos(ang) * off; g.fillStyle = pass ? (q < 0 ? LAV : SEG[q]) : SH; const o = pass ? 0 : p;
      for (const [x, y, sl] of CELLS) if (sl === q) g.fillRect(x0 + x * p + dx + o, y0 + y * p + dy + o, p + .4, p + .4); }
    const tx = x0 + s + Math.min(26, W * .05), lg = Math.min(54, (W - tx - 10) / 4); g.font = `700 ${Math.min(46, W * .11)}px ID`; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = SH2; g.fillText('$1NDEX', tx + 3, H / 2 - 12 + 3); g.fillStyle = LAV; g.fillText('$1NDEX', tx, H / 2 - 12);
    g.font = `600 ${lg < 50 ? 10.5 : 12}px JB`; ['GOLD', 'SQQQ', 'VIX', 'USD'].forEach((l, q) => { const xx = tx + q * lg; g.fillStyle = SEG[q]; g.fillRect(xx, H / 2 + 20, 8, 8); g.fillStyle = MUTE; g.fillText(l, xx + 12, H / 2 + 24.5); }); }

  // ---------------------------------------------------------------- the coin: try a trade
  const fsol = v => v >= 1 ? v.toFixed(2) : v >= .01 ? v.toFixed(3) : v.toFixed(4);
  function simLabels() { const v = PP.amt; const e = id => $('#' + id); if (!e('pe0')) return; e('pe0').textContent = fsol(v) + ' SOL'; e('pe1').textContent = fsol(v * .01) + ' SOL'; e('pe2').textContent = fsol(v * .01) + ' SOL to spend'; for (let i = 0; i < 4; i++) { const o = e('peo' + i); if (o) o.textContent = '≈' + fsol(v * .0025) + ' SOL'; } }
  function simInit() { PP.amt = 1; $$('#sim button').forEach(b => b.addEventListener('click', () => { PP.amt = +b.dataset.v; $$('#sim button').forEach(x => x.classList.toggle('on', x === b)); simLabels(); cue('pop'); PP.burst = Math.min(24, 4 + Math.round(Math.log2(PP.amt * 4) * 3)); })); }
  // the big number on the crash test is a handle too: drag it up or down
  function dialDrag() { const mv = $('#mv'), t = $('#touch'); if (!mv || !t) return; mv.style.cursor = 'ns-resize'; mv.style.touchAction = 'none'; let d = null;
    mv.addEventListener('pointerdown', e => { d = { y: e.clientY, v: +t.value }; mv.setPointerCapture(e.pointerId); });
    mv.addEventListener('pointermove', e => { if (!d) return; const v = clamp(Math.round(d.v - (e.clientY - d.y) / 12), -15, 5); if (v !== +t.value) { t.value = v; cue('tick'); renderPush(); } });
    const up = () => d = null; mv.addEventListener('pointerup', up); mv.addEventListener('pointercancel', up); }
  // ---------------------------------------------------------------- reveals, nav, progress
  function reveals() { if (RM) { $$('.rv').forEach(el => el.classList.add('vis')); return; } const o = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); o.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' }); $$('.rv').forEach(el => o.observe(el)); }
  function onScroll() { const links = $$('.nav-links a[href^="#"]'), y = innerHeight * .35; let on = -1; links.forEach((a, i) => { const s = $(a.getAttribute('href')); if (s && s.getBoundingClientRect().top < y) on = i; }); links.forEach((a, i) => a.classList.toggle('on', i === on));
    const h = document.documentElement.scrollHeight - innerHeight; $('#prog').style.transform = `scaleX(${h > 0 ? clamp(scrollY / h) : 0})`; }

  function start() {
    drawMarks(); bgInit(); heroParallax(); tiltInit(); watch($('#win'), 'win'); marqInit(); dialDrag(); stageInit(); chartInit(); pushInit(); ringInit(); simInit(); watch($('#wv3'), 'wv3'); reveals(); clock(); setInterval(clock, 20000);
    watch($('#pipe'), 'pipe'); watch($('.outro'), 'outro');
    const snd = $('#snd'), sndUi = () => snd.classList.toggle('on', !!(window.MINTSOUND && MINTSOUND.on)); snd.onclick = e => { e.stopPropagation(); window.MINTSOUND && MINTSOUND.toggle(); }; document.addEventListener('mintsound', sndUi); sndUi();
    addEventListener('scroll', onScroll, { passive: true }); onScroll(); addEventListener('resize', () => { drawMarks(); CH.t0 = 0; CH.w = 0; EQ.w = 0; PP.nodes = null; renderDetail(false); });
    requestAnimationFrame(stageFrame); requestAnimationFrame(marqFrame); requestAnimationFrame(cdFrame); requestAnimationFrame(chartFrame); requestAnimationFrame(eqFrame); requestAnimationFrame(pipeFrame); requestAnimationFrame(outroFrame); requestAnimationFrame(winFrame); requestAnimationFrame(donutFrame); requestAnimationFrame(wv3Frame);
    loadCoin(); loadTreasury(); setInterval(loadBasket, 45000); setInterval(() => { loadCoin(); loadTreasury(); }, 60000);
  }
  const fonts = Promise.all([document.fonts.load('700 100px ID'), document.fonts.load('700 30px PX'), document.fonts.load('600 14px JB'), document.fonts.load('500 16px IN')]).catch(() => { });
  const data = loadBasket();
  Promise.race([Promise.all([fonts, data]), new Promise(r => setTimeout(r, 1200))]).then(() => { start(); intro(() => { }); data.then(loadHistory); });
})();
