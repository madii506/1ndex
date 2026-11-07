// 1ndex API: launch a coin whose trading fee buys a hedge against the stock market.
// Every coin launches on the 1ndex launchpad on Raydium LaunchLab; its 1% fee goes to the shared hedge treasury, which buys the hedge the creator picked.
// GET  a=basket (hedges, stocks and the S&P 500, live prices) · a=coins (coins launched on 1ndex) · a=treasury · a=activity
//      a=pad&admin= · a=t (token metadata: the hedge is part of the link, so it's on-chain) · a=m (old metadata)
// POST a=buildPad · a=buildLaunch · a=claim · a=send   (every transaction is signed in the visitor's own wallet)
const { Connection, PublicKey, Keypair, SystemProgram, Transaction } = require('@solana/web3.js');
const BN = require('bn.js');
const R = require('@raydium-io/raydium-sdk-v2');
const CFG = require('./ndx-config.json');

const RPC = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const LAUNCH_API = 'https://launch-mint-v1.raydium.io';
const WSOL = new PublicKey('So11111111111111111111111111111111111111112');
const PROGRAM = R.LAUNCHPAD_PROGRAM, RAYDIUM_PLATFORM = R.LAUNCHPAD_PLATFORM;
const CONFIG = R.getPdaLaunchpadConfigId(PROGRAM, WSOL, 0, 0).publicKey;
const TAG = new PublicKey(process.env.NDX_TAG || '933gmZTQergEUTHJjqByDCTWgeA35MaCZsu3ptihxJQK'); // every 1ndex launchpad and coin transaction sends 0 SOL here, so they can be found on-chain
const META_PROGRAM = new PublicKey('metaqbxxUerdq28cj1RJAWkYQm3ybzjb6a8bBuwy6NG');
const SUPPLY = new BN('1000000000000000'), SELL = new BN('793100000000000');
const PPM = 1e6;
const conn = new Connection(RPC, 'confirmed');
const PIN = { pad: process.env.NDX_PAD || CFG.pad, mint: process.env.NDX_MINT || CFG.mint, treasury: process.env.NDX_TREASURY || CFG.treasury };

const out = (res, code, body, cache) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', cache || 'no-store'); res.end(JSON.stringify(body)); };
const b64u = s => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
const host = req => process.env.NDX_HOST || ('https://' + (req.headers['x-forwarded-host'] || req.headers.host));
const body = req => new Promise(ok => { if (req.body) return ok(typeof req.body === 'string' ? JSON.parse(req.body) : req.body); let d = ''; req.on('data', c => d += c); req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch { ok({}); } }); });
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
const str = b => Buffer.from(b).toString('utf8').replace(/\0/g, '').trim();
const pk = (s, what) => { try { return new PublicKey(String(s)); } catch { throw new Error(what || 'bad address'); } };
const padIdOf = admin => R.getPdaPlatformId(PROGRAM, admin).publicKey;
const vaultOf = padId => R.getPdaPlatformVault(PROGRAM, padId, WSOL).publicKey;
const pct = n => +(+n.toString() / PPM * 100).toFixed(4);
const getJ = async (url, ms = 8000) => { const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { accept: 'application/json' } }); if (!r.ok) throw new Error(url.split('/')[2] + ' ' + r.status); return r.json(); };

// ---------------------------------------------------------------- the basket: the members, their live prices, their launchpads' activity
async function prices(mints) {
  const parts = []; for (let i = 0; i < mints.length; i += 30) parts.push(mints.slice(i, i + 30));
  const j = (await Promise.all(parts.map(x => getJ(`https://api.dexscreener.com/tokens/v1/solana/${x.join(',')}`)))).flat();
  const o = {};
  for (const m of mints) {
    const ps = (Array.isArray(j) ? j : []).filter(p => p.baseToken && p.baseToken.address === m).sort((a, b) => ((b.liquidity || {}).usd || 0) - ((a.liquidity || {}).usd || 0));
    const p = ps[0]; o[m] = p ? { usd: +p.priceUsd, ch24: p.priceChange ? p.priceChange.h24 : null, ch1: p.priceChange ? p.priceChange.h1 : null, mcap: p.marketCap || p.fdv || null, liquidity: ps.reduce((a, x) => a + ((x.liquidity || {}).usd || 0), 0), vol24: ps.reduce((a, x) => a + ((x.volume || {}).h24 || 0), 0), pool: p.pairAddress, dex: p.dexId } : null;
  }
  return o;
}
async function basket() {
  const SOL = 'So11111111111111111111111111111111111111112';
  const ST = CFG.stocks || [], HG = CFG.hedges || [], P = await prices([...new Set([...HG.map(h => h.mint), ...CFG.members.map(m => m.mint), CFG.benchmark.mint, SOL, ...ST.map(s => s.mint)])]);
  const w = 1 / CFG.members.length, members = CFG.members.map(m => ({ ...m, weight: w, price: P[m.mint] || null }));
  const ch = members.map(m => m.symbol === 'USD' ? 0 : m.price && m.price.ch24); const ch24 = ch.every(x => x != null) ? ch.reduce((a, x) => a + w * x, 0) : null;
  return { at: Date.now(), rule: CFG.rule, ch24, members, benchmark: { ...CFG.benchmark, price: P[CFG.benchmark.mint] || null }, sol: P[SOL] || null, stocks: ST.map(s => ({ ...s, price: P[s.mint] || null })), hedges: HG.map(h => ({ ...h, price: P[h.mint] || null })), presets: CFG.presets || [], pad: PIN.pad || null };
}

// ---------------------------------------------------------------- the coin and its treasury (pinned once $1NDEX exists)
async function coinState() {
  if (!PIN.mint) return { live: false };
  const mint = new PublicKey(PIN.mint), pool = R.getPdaLaunchpadPoolId(PROGRAM, mint, WSOL).publicKey;
  const acc = await conn.getAccountInfo(pool); if (!acc) return { live: false, mint: PIN.mint };
  const p = R.LaunchpadPool.decode(acc.data); const vA = +p.virtualA.toString(), vB = +p.virtualB.toString(), rA = +p.realA.toString(), rB = +p.realB.toString(), sup = +p.supply.toString();
  const price = (vB + rB) / (vA - rA);
  return { live: true, mint: PIN.mint, pool: pool.toBase58(), pad: p.platformId.toBase58(), graduated: p.status > 0, progress: rB / +p.totalFundRaisingB.toString(), raisedSol: rB / 1e9, raiseSol: +p.totalFundRaisingB.toString() / 1e9, priceSol: price * 1e6 / 1e9, mcapSol: price * sup / 1e9, sold: rA / 1e6, supply: sup / 1e6, platformFeeSol: +p.platformFee.toString() / 1e9 };
}
async function treasury(forWallet) {
  let who = forWallet || PIN.treasury;
  if (!who && PIN.pad) { const acc = await conn.getAccountInfo(new PublicKey(PIN.pad)); if (acc) who = decodePad(new PublicKey(PIN.pad), acc.data).claimWallet; }
  if (!who) return { live: false };
  const owner = new PublicKey(who);
  const [bal, t1, t2] = await Promise.all([conn.getBalance(owner), conn.getParsedTokenAccountsByOwner(owner, { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }), conn.getParsedTokenAccountsByOwner(owner, { programId: new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLuK7RcNNL4yuV5Tc6') }).catch(() => ({ value: [] }))]);
  const held = {}; for (const a of [...t1.value, ...t2.value]) { const i = a.account.data.parsed.info; held[i.mint] = (held[i.mint] || 0) + (+i.tokenAmount.uiAmount || 0); }
  const HG = CFG.hedges || CFG.members, px = await prices(HG.map(m => m.mint)).catch(() => ({}));
  const holdings = HG.map(m => ({ code: m.code, symbol: m.symbol, mint: m.mint, amount: held[m.mint] || 0, usd: (held[m.mint] || 0) * ((px[m.mint] || {}).usd || 0) }));
  let unclaimedSol = 0; if (PIN.pad) { try { const v = await conn.getAccountInfo(vaultOf(new PublicKey(PIN.pad))); if (v && v.data.length >= 72) unclaimedSol = Number(v.data.readBigUInt64LE(64)) / 1e9; } catch {} }
  return { live: true, wallet: who, sol: bal / 1e9, unclaimedSol, holdings, basketUsd: holdings.reduce((a, h) => a + h.usd, 0) };
}

// every transaction of the treasury wallet, newest first, labelled as a claim, a buy or other
async function activity() {
  const t = await treasury(); if (!t.live) return { items: [] };
  const sigs = (await conn.getSignaturesForAddress(new PublicKey(t.wallet), { limit: 25 })).filter(s => !s.err);
  const txs = await Promise.all(sigs.slice(0, 15).map(s => conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 }).catch(() => null)));
  const JUP6 = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
  const items = sigs.slice(0, 15).map((s, i) => { const tx = txs[i]; const keys = tx ? (tx.transaction.message.staticAccountKeys || tx.transaction.message.accountKeys || []).map(k => k.toBase58()) : [];
    const kind = keys.includes(JUP6) ? 'bought a hedge' : keys.includes(PROGRAM.toBase58()) ? 'LaunchLab: claim or launchpad' : 'other';
    return { sig: s.signature, time: s.blockTime, kind }; });
  return { items };
}

// ---------------------------------------------------------------- building the 1ndex launchpad and $1NDEX (the p4d engine)
let chainCache = null;
async function chain() {
  if (chainCache && Date.now() - chainCache.t < 60000) return chainCache.v;
  const [ca, pa] = await conn.getMultipleAccountsInfo([CONFIG, RAYDIUM_PLATFORM]);
  if (!ca) throw new Error('LaunchLab config not found');
  const v = { cfg: R.LaunchpadConfig.decode(ca.data), ray: pa ? R.PlatformConfig.decode(pa.data) : null };
  chainCache = { t: Date.now(), v }; return v;
}
function decodePad(id, data) { const p = R.PlatformConfig.decode(data); return { id: id.toBase58(), name: str(p.name), web: str(p.web), img: str(p.img), feePct: pct(p.feeRate), creatorFeePct: pct(p.creatorFeeRate), lp: { burn: pct(p.burnScale), platform: pct(p.platformScale), creator: pct(p.creatorScale) }, claimWallet: p.platformClaimFeeWallet.toBase58() }; }
async function pad(q) {
  const id = q.get('id') ? pk(q.get('id'), 'bad pad id') : padIdOf(pk(q.get('admin'), 'bad wallet'));
  const [acc, vault] = await conn.getMultipleAccountsInfo([id, vaultOf(id)]);
  if (!acc || !acc.owner.equals(PROGRAM)) return { exists: false, id: id.toBase58() };
  let unclaimedSol = 0; if (vault && vault.data.length >= 72) unclaimedSol = Number(vault.data.readBigUInt64LE(64)) / 1e9;
  return { exists: true, ...decodePad(id, acc.data), vault: vaultOf(id).toBase58(), unclaimedSol };
}
const tagIx = (from, extra) => { const ix = SystemProgram.transfer({ fromPubkey: from, toPubkey: TAG, lamports: 0 }); if (extra) ix.keys.push({ pubkey: extra, isSigner: false, isWritable: false }); return ix; };
const fits = t => { try { t.serialize({ requireAllSignatures: false, verifySignatures: false }); return true; } catch { return false; } };
async function finish(txs, wallet, signers, tagFn, simulate) {
  const { blockhash } = await conn.getLatestBlockhash('confirmed');
  const mk = ixs => { const t = new Transaction(); t.add(...ixs); t.feePayer = wallet; t.recentBlockhash = blockhash; const need = signers.filter(s => t.instructions.some(ix => ix.keys.some(k => k.isSigner && k.pubkey.equals(s.publicKey)))); if (need.length) t.partialSign(...need); return t; };
  let list = txs.map((tx, i) => mk(i === 0 && tagFn ? [...tx.instructions, tagFn(false)] : tx.instructions));
  if (tagFn && !fits(list[0])) { list = txs.map(tx => mk(tx.instructions)); list.push(mk([tagFn(true)])); }
  let sim = null;
  if (simulate) sim = await Promise.all(list.slice(0, 1).map(async t => { const r = await conn.simulateTransaction(t); return { err: r.value.err, units: r.value.unitsConsumed, logs: (r.value.logs || []).slice(-16) }; }));
  return { txs: list.map(t => Buffer.from(t.serialize({ requireAllSignatures: false, verifySignatures: false })).toString('base64')), sim };
}
const txsOf = m => m.transactions ? m.transactions : [{ instructions: m.transaction && m.transaction.instructions && m.transaction.instructions.length ? m.transaction.instructions : m.builder.allInstructions }];
async function sdk(owner) { const r = await R.Raydium.load({ connection: conn, owner, cluster: 'mainnet', disableLoadToken: true, disableFeatureCheck: true, blockhashCommitment: 'confirmed' }); if (module.exports._t && module.exports._t.onLoad) module.exports._t.onLoad(r); return r; }

// the 1ndex launchpad: 1% on every curve trade goes to the index treasury, which buys the four; half the graduation LP is burned, half is kept as a Raydium fee key
async function buildPad(req) {
  const b = await body(req); const wallet = pk(b.wallet, 'connect a wallet first');
  const id = padIdOf(wallet); if (await conn.getAccountInfo(id)) throw new Error(`this wallet already has a launchpad (${id.toBase58()}). one per wallet.`);
  const { ray } = await chain(); if (!ray) throw new Error('could not read Raydium’s platform settings');
  const feePct = Math.max(0, Math.min(5, +(b.feePct ?? 1))), burn = Math.round(Math.max(0, Math.min(100, +(b.burnPct ?? 50))) * 1e4);
  const raydium = await sdk(wallet);
  const made = await raydium.launchpad.createPlatformConfig({
    programId: PROGRAM, platformAdmin: wallet, platformClaimFeeWallet: wallet, platformLockNftWallet: wallet, platformVestingWallet: wallet,
    cpConfigId: ray.cpConfigId, migrateCpLockNftScale: { platformScale: new BN(PPM - burn), creatorScale: new BN(0), burnScale: new BN(burn) },
    transferFeeExtensionAuth: wallet, creatorFeeRate: new BN(0), feeRate: new BN(Math.round(feePct * 1e4)),
    name: CFG.name, web: clean(b.web || host(req), 120), img: clean(b.img || host(req) + '/assets/icon.png', 200), txVersion: R.TxVersion.LEGACY, feePayer: wallet,
  });
  const r = await finish(txsOf(made), wallet, [], () => tagIx(wallet), !!b.simulate);
  return { pad: id.toBase58(), ...r };
}
const HCODES = Object.fromEntries((CFG.hedges || []).map(h => [h.code, h]));
// a hedge is written like G25Q25V25U25: up to four assets by code, whole-number weights that add up to 100
function parseHedge(h) { const m = String(h || '').match(/^([A-Z]\d{1,3}){1,4}$/); if (!m) throw new Error('pick a hedge');
  const parts = [...String(h).matchAll(/([A-Z])(\d{1,3})/g)].map(x => ({ code: x[1], w: +x[2] }));
  if (parts.some(p => !HCODES[p.code] || p.w < 1)) throw new Error('unknown hedge asset'); if (new Set(parts.map(p => p.code)).size !== parts.length) throw new Error('each asset once');
  if (parts.reduce((a, p) => a + p.w, 0) !== 100) throw new Error('hedge weights must add up to 100'); return parts; }
const hedgeText = parts => parts.map(p => `${p.w}% ${HCODES[p.code].name} (${HCODES[p.code].symbol})`).join(', ');
async function buildLaunch(req) {
  const b = await body(req); const wallet = pk(b.wallet, 'connect a wallet first'), padId = pk(b.pad || PIN.pad || '', 'the 1ndex launchpad is not open yet');
  const padAcc = await conn.getAccountInfo(padId); if (!padAcc || !padAcc.owner.equals(PROGRAM)) throw new Error('the 1ndex launchpad is not open yet');
  const { cfg } = await chain(); const raise = 85;
  const name = clean(b.name, 32), symbol = String(b.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  if (name.length < 2) throw new Error('give your coin a name'); if (symbol.length < 2) throw new Error('give your coin a ticker (2 to 10 letters)');
  const hedge = parseHedge(b.hedge), hs = hedge.map(p => p.code + p.w).join('');
  let img = String(b.image || '1'); if (/^[1-6]$/.test(img)) img = img; else if (/^https:\/\/[^\s"'<>]{6,160}$/.test(img)) img = 'u' + b64u(img); else throw new Error('pick an image, or paste an https image link');
  const uri = host(req) + '/api/ndx?a=t&n=' + encodeURIComponent(name) + '&s=' + symbol + '&h=' + hs + '&i=' + img;
  if (uri.length > 200) throw new Error('name or image link too long for on-chain metadata. use a preset image or a shorter link');
  const buySol = Math.max(0, +b.buySol || 0); if (buySol > 20) throw new Error('first buy is capped at 20 SOL here');
  const mint = Keypair.generate(); const raydium = await sdk(wallet);
  const { transactions, extInfo } = await raydium.launchpad.createLaunchpad({
    programId: PROGRAM, mintA: mint.publicKey, decimals: 6, name, symbol, uri, migrateType: 'cpmm', configId: CONFIG, configInfo: cfg, mintBDecimals: 9, platformId: padId,
    txVersion: R.TxVersion.LEGACY, slippage: new BN(100), buyAmount: new BN(Math.round(buySol * 1e9)), createOnly: buySol === 0,
    supply: SUPPLY, totalSellA: SELL, totalFundRaisingB: new BN(Math.round(raise * 1e9)), totalLockedAmount: new BN(0), cliffPeriod: new BN(0), unlockPeriod: new BN(0),
    extraSigners: [mint], feePayer: wallet, computeBudgetConfig: { units: 600000, microLamports: 60000 },
  });
  const r = await finish(transactions, wallet, [mint], extra => tagIx(wallet, extra ? mint.publicKey : null), !!b.simulate);
  return { mint: mint.publicKey.toBase58(), pool: extInfo?.address?.poolId?.toBase58() || R.getPdaLaunchpadPoolId(PROGRAM, mint.publicKey, WSOL).publicKey.toBase58(), uri, hedge: hs, ...r };
}
// the token's metadata: the hedge lives in the link, so anyone can read a coin's hedge from the chain
function tokenMeta(req, q) { const name = clean(q.get('n'), 32), symbol = clean(q.get('s'), 10), hs = String(q.get('h') || ''), i = String(q.get('i') || '1');
  let hedge = []; try { hedge = parseHedge(hs); } catch { }
  const image = /^[1-6]$/.test(i) ? host(req) + '/coins/' + i + '.png' : i[0] === 'u' ? unb64u(i.slice(1)) : host(req) + '/coins/1.png';
  return { name, symbol, image, description: `Launched on 1ndex. 1% of every trade of $${symbol} buys a hedge against the stock market: ${hedgeText(hedge)}.`, external_url: host(req), attributes: hedge.map(p => ({ trait_type: HCODES[p.code].symbol, value: p.w + '%' })), createdOn: host(req) }; }
// coins launched on the 1ndex launchpad, from Raydium's launch index; each coin's hedge is read from its metadata link
async function coins() {
  if (!PIN.pad) return { open: false, coins: [] };
  const j = await getJ(`${LAUNCH_API}/get/list?sort=new&size=60&mintType=default&platformId=${PIN.pad}`).catch(() => null);
  const rows = (j && j.data && j.data.rows) || [];
  return { open: true, pad: PIN.pad, coins: rows.filter(r => !r.platformInfo || r.platformInfo.pubKey === PIN.pad).map(r => { let h = ''; try { h = new URL(r.metadataUrl).searchParams.get('h') || ''; } catch { }
    let hedge = []; try { hedge = parseHedge(h); } catch { }
    return { mint: r.mint, pool: r.poolId, name: r.name, symbol: r.symbol, image: r.imgUrl, created: r.createAt, mcapUsd: r.marketCap, progress: r.finishingRate, volumeUsd: r.volumeU, hedge: hedge.map(p => ({ code: p.code, w: p.w })) }; }) };
}
async function claim(req) {
  const b = await body(req); const wallet = pk(b.wallet, 'connect a wallet first'), id = padIdOf(wallet);
  if (!(await conn.getAccountInfo(id))) throw new Error('this wallet has no launchpad');
  const raydium = await sdk(wallet);
  const made = await raydium.launchpad.claimVaultPlatformFee({ programId: PROGRAM, platformId: id, mintB: WSOL, claimFeeWallet: wallet, txVersion: R.TxVersion.LEGACY, feePayer: wallet });
  return finish(txsOf(made), wallet, [], null, !!b.simulate);
}
async function sendTxs(req) {
  const b = await body(req); if (!Array.isArray(b.txs) || !b.txs.length || b.txs.length > 6) throw new Error('nothing to send');
  const sigs = [];
  for (const t of b.txs) { const sig = await conn.sendRawTransaction(Buffer.from(t, 'base64'), { skipPreflight: false, maxRetries: 3 }); sigs.push(sig);
    for (let k = 0; k < 30; k++) { const s = (await conn.getSignatureStatuses([sig])).value[0]; if (s && s.err) throw new Error('transaction failed: ' + JSON.stringify(s.err)); if (s && /confirmed|finalized/.test(s.confirmationStatus || '')) break; await new Promise(r => setTimeout(r, 800)); } }
  return { sigs };
}

module.exports = async (req, res) => { if (req.method === 'GET') res.setHeader('access-control-allow-origin', '*');
  const q = new URL(req.url, 'http://x').searchParams, a = q.get('a');
  try {
    if (a === 'basket') return out(res, 200, await basket(), 's-maxage=45, stale-while-revalidate=120');
    if (a === 'coin') return out(res, 200, { ...(await coinState()), pinned: PIN }, 's-maxage=15, stale-while-revalidate=60');
    if (a === 'coins') return out(res, 200, await coins(), 's-maxage=20, stale-while-revalidate=60');
    if (a === 't') return out(res, 200, tokenMeta(req, q), 'public, max-age=31536000, immutable');
    if (a === 'treasury') return out(res, 200, await treasury(), 's-maxage=30, stale-while-revalidate=120');
    if (a === 'activity') return out(res, 200, await activity(), 's-maxage=30, stale-while-revalidate=120');
    if (a === 'holdings') return out(res, 200, await treasury(pk(q.get('wallet'), 'bad wallet').toBase58()));
    if (a === 'pad') return out(res, 200, await pad(q), 's-maxage=10');
    if (req.method === 'POST' && a === 'buildPad') return out(res, 200, await buildPad(req));
    if (req.method === 'POST' && a === 'buildLaunch') return out(res, 200, await buildLaunch(req));
    if (req.method === 'POST' && a === 'claim') return out(res, 200, await claim(req));
    if (req.method === 'POST' && a === 'send') return out(res, 200, await sendTxs(req));
    if (a === 'm') { const d = JSON.parse(unb64u(q.get('d') || '')); return out(res, 200, { name: d.n, symbol: d.s, description: d.d || '', image: d.i, createdOn: host(req) }, 'public, max-age=31536000, immutable'); }
    return out(res, 404, { error: 'unknown action' });
  } catch (e) { return out(res, 400, { error: e.message || String(e) }); }
};
module.exports._t = { basket, buildPad, buildLaunch, claim, conn, setChain: v => { chainCache = { t: Date.now() + 1e9, v }; } };
