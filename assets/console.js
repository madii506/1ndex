// 1ndex console: create the launchpad, launch $1NDEX, claim, buy the four. Every transaction is signed in the visitor's wallet.
(() => {
  const $ = s => document.querySelector(s); const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = { wallet: null, p: null, plan: null }; const short = a => a ? a.slice(0, 4) + '…' + a.slice(-4) : '';
  const JUP = 'https://lite-api.jup.ag', SOL = 'So11111111111111111111111111111111111111112';
  const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200); };
  const stat = id => (m, c = '') => { const el = $(id); el.className = 'stat ' + c; el.innerHTML = m; };
  async function api(a, body, q = '') { const r = await fetch('/api/ndx?a=' + a + q, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}); const j = await r.json().catch(() => ({ error: 'bad response' })); if (!r.ok || j.error) throw new Error(j.error || r.statusText); return j; }
  const providers = () => [['Phantom', window.phantom && window.phantom.solana], ['Solflare', window.solflare && window.solflare.isSolflare && window.solflare], ['Backpack', window.backpack]].filter(([, p]) => p);
  async function connect() { if (S.wallet) return S.wallet; const ps = providers(); if (!ps.length) { toast('no Solana wallet found: open this page in Phantom, Solflare or Backpack'); throw new Error('no wallet'); }
    const [name, p] = ps[0]; const r = await p.connect(); S.wallet = ((r && r.publicKey) || p.publicKey).toString(); S.p = p; $('#connect').textContent = name + ' · ' + short(S.wallet); refresh(); return S.wallet; }
  $('#connect').onclick = () => connect().catch(() => {});
  const b64 = u => { let s = ''; u.forEach(c => s += String.fromCharCode(c)); return btoa(s); }, unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function signSend(list, st, versioned) { const W = solanaWeb3; const txs = list.map(t => versioned ? W.VersionedTransaction.deserialize(unb64(t)) : W.Transaction.from(unb64(t)));
    st('check your wallet…'); const signed = S.p.signAllTransactions ? await S.p.signAllTransactions(txs) : [await S.p.signTransaction(txs[0])];
    st('sending…'); return api('send', { txs: signed.map(t => b64(t.serialize())) }); }
  const tx = sig => `<a href="https://solscan.io/tx/${sig}" target="_blank" rel="noopener">${short(sig)} ↗</a>`;
  async function refresh() { if (!S.wallet) return; try { const p = await api('pad', null, '&admin=' + S.wallet);
      $('#padInfo').textContent = p.exists ? `launchpad ${short(p.id)} · ${p.feePct}% fee · LP ${p.lp.burn}% burned` : 'no launchpad on this wallet yet';
      $('#vaultInfo').textContent = p.exists ? `${p.unclaimedSol.toFixed(4)} SOL waiting in LaunchLab's vault` : ''; S.pad = p.exists ? p.id : null; } catch (e) { $('#padInfo').textContent = e.message; } }
  $('#padBtn').onclick = async () => { const st = stat('#padStat'); try { await connect(); st('building the LaunchLab transaction…');
      const r = await api('buildPad', { wallet: S.wallet, feePct: 1, burnPct: 50, web: location.origin, img: location.origin + '/coin.png' }); const s = await signSend(r.txs, st);
      st(`the 1ndex launchpad is live: <b>${esc(r.pad)}</b>\ntransaction ${tx(s.sigs[0])}\nsend this launchpad address over so the site can pin it.`, 'ok'); setTimeout(refresh, 2500); } catch (e) { st(esc(e.message), 'err'); } };
  $('#launchBtn').onclick = async () => { const st = stat('#launchStat'); try { await connect(); st('building $1NDEX…');
      const r = await api('buildLaunch', { wallet: S.wallet, buySol: +$('#buySol').value || 0, image: location.origin + '/coin.png' }); const s = await signSend(r.txs, st);
      st(`$1NDEX is live on Raydium LaunchLab.\nmint <b>${esc(r.mint)}</b>\npool ${esc(r.pool)}\ntransaction ${tx(s.sigs[0])}\n<a href="https://raydium.io/launchpad/token/?mint=${r.mint}" target="_blank" rel="noopener">open it on Raydium ↗</a>`, 'ok'); } catch (e) { st(esc(e.message), 'err'); } };
  $('#claimBtn').onclick = async () => { const st = stat('#claimStat'); try { await connect(); st('building the claim…'); const r = await api('claim', { wallet: S.wallet }); const s = await signSend(r.txs, st); st(`claimed. ${tx(s.sigs[0])}`, 'ok'); setTimeout(refresh, 2500); } catch (e) { st(esc(e.message), 'err'); } };
  // buy the four: spend SOL on whichever is furthest under a quarter
  $('#planBtn').onclick = async () => { const st = stat('#buyStat'); try { await connect(); st('reading the treasury and prices…');
      const [b, h] = await Promise.all([api('basket'), api('holdings', null, '&wallet=' + S.wallet)]); const solUsd = b.sol && b.sol.usd; if (!solUsd) throw new Error('no SOL price right now');
      const spend = Math.min(+$('#spendSol').value || 0, Math.max(0, h.sol - .05)); if (spend < .01) throw new Error(`not enough SOL: this wallet has ${h.sol.toFixed(3)} SOL and keeps 0.05 for fees`);
      const val = h.holdings.map(x => x.usd), T = val.reduce((a, x) => a + x, 0) + spend * solUsd, gap = val.map(v => Math.max(0, T / 4 - v)), G = gap.reduce((a, x) => a + x, 0) || 1;
      S.plan = b.members.map((m, i) => ({ m, sol: spend * gap[i] / G })).filter(x => x.sol >= .01);
      $('#plan').innerHTML = b.members.map((m, i) => { const p = S.plan.find(x => x.m.mint === m.mint); return `<div><b>${esc(m.symbol)}</b><span>holds $${val[i].toFixed(2)}</span><span>target $${(T / 4).toFixed(2)}</span><span>${p ? `buy ${p.sol.toFixed(3)} SOL` : '—'}</span></div>`; }).join('');
      $('#buyBtn').disabled = !S.plan.length; st(S.plan.length ? `ready: ${S.plan.length} swap${S.plan.length > 1 ? 's' : ''} through Jupiter.` : 'every part is at or over a quarter.'); } catch (e) { st(esc(e.message), 'err'); } };
  $('#buyBtn').onclick = async () => { const st = stat('#buyStat'); try { await connect(); if (!S.plan || !S.plan.length) throw new Error('plan first'); st('getting Jupiter routes…'); const list = [];
      for (const x of S.plan) { const lam = Math.floor(x.sol * 1e9); const q = await fetch(`${JUP}/swap/v1/quote?inputMint=${SOL}&outputMint=${x.m.mint}&amount=${lam}&slippageBps=150`).then(r => r.json()); if (!q.outAmount) throw new Error('no route for ' + x.m.symbol);
        const s = await fetch(`${JUP}/swap/v1/swap`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quoteResponse: q, userPublicKey: S.wallet, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 300000, priorityLevel: 'high' } } }) }).then(r => r.json());
        if (!s.swapTransaction) throw new Error('Jupiter returned no swap for ' + x.m.symbol); list.push(s.swapTransaction); }
      const r = await signSend(list, st, true); st(`bought the four. ${r.sigs.map(tx).join(' · ')}`, 'ok'); $('#buyBtn').disabled = true; } catch (e) { st(esc(e.message), 'err'); } };
  const ps = providers(); if (ps.length && ps[0][1].connect) ps[0][1].connect({ onlyIfTrusted: true }).then(r => { if (r && r.publicKey) { S.wallet = r.publicKey.toString(); S.p = ps[0][1]; $('#connect').textContent = ps[0][0] + ' · ' + short(S.wallet); refresh(); } }).catch(() => {});
})();
