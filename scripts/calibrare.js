#!/usr/bin/env node
// Calibrarea factorilor de ajustare din anunțurile reale (regresie hedonică).
// Pentru fiecare anunț de apartament / casă din baza aplicației: log(preț/mp) = efect fix (zonă × vechime) + Σ β·caracteristică.
// Caracteristicile vin din câmpurile anunțului și din textul lui (lib/semne.js): etaj, compartimentare, încălzire, balcon, vedere,
// mobilat, reabilitat, material, băi, certificat, stadiu, TVA, orientare, tip casă, regim, structură…
// Efectele fixe se scot prin centrare pe grup (zonă × vechime), apoi se face o regresie ponderată pe caracteristici (două treceri,
// a doua fără reziduurile atipice). Un factor intră în evaluator doar dacă are destule anunțuri (n ≥ 80), e clar diferit de zero
// (|t| ≥ 2,5), nu contrazice sensul factorului din experiență și stă în ±15% față de el (clip). Restul rămân doar raportate.
// Ieșire: lib/calib.json → { factors: { 'floor.parterVechi': 0.93, ... }, features: { id: {beta, se, t, n, factor, prior, aplicat} } }.
// Nu iese nimic despre anunțuri individuale: doar coeficienți și numărători.
// Folosire: node scripts/calibrare.js <dump-dir | baza.json> [lib/calib.json]
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = global;
require(path.join(ROOT, 'lib/market.js'));
require(path.join(ROOT, 'lib/semne.js'));
const CMA = require(path.join(ROOT, 'lib/engine.js'));
const Z = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib/zones.json'), 'utf8'));
const SEM = global.NV_SEMNE;

const inp = process.argv[2], outFile = process.argv[3] || path.join(ROOT, 'lib/calib.json');
if (!inp || !fs.existsSync(inp)) { console.error('Folosire: node scripts/calibrare.js <dump-dir | baza.json> [lib/calib.json]'); process.exit(2); }

function readColl(dir, name) {
  const d = path.join(dir, name), o = {};
  if (!fs.existsSync(d)) return o;
  for (const f of fs.readdirSync(d)) { if (!f.endsWith('.json')) continue; try { o[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); } catch (e) { } }
  return o;
}
function unwrap(coll) { const o = {}; for (const k of Object.keys(coll || {})) { const d = coll[k]; o[k] = d && d.data && typeof d.data === 'object' && !d.a && !d.anunturi ? d.data : d; } return o; }
function captures(lipite, packs) {
  const o = Object.assign({}, lipite || {});
  for (const k of Object.keys(packs || {})) { const a = packs[k] && packs[k].a; if (!a) continue; for (const id of Object.keys(a)) if (a[id] && typeof a[id] === 'object') o[id] = a[id]; }
  return o;
}
let src;
if (fs.statSync(inp).isDirectory()) src = { piata: readColl(inp, 'piata'), agentii: readColl(inp, 'agentii'), portaluri: readColl(inp, 'portaluri'), lipite: captures(readColl(inp, 'lipite'), readColl(inp, 'capturi')) };
else { const db = JSON.parse(fs.readFileSync(inp, 'utf8')); src = { piata: unwrap(db.piata), agentii: unwrap(db.agentii), portaluri: unwrap(db.portaluri), lipite: captures(unwrap(db.lipite), unwrap(db.capturi)) }; }

const zmap = {}; Z.zone.forEach(z => { zmap[z.id] = z; });
const now = Date.now();
const rows = NV_MARKET.collect(src, now, zmap).rows;
console.log('anunțuri în bază:', rows.length, '— apartamente', rows.filter(r => r.tip === 'apartament').length, 'case', rows.filter(r => r.tip === 'casa').length);

function num(v) { if (v === '' || v == null) return null; const n = +String(v).replace(',', '.'); return isFinite(n) ? n : null; }
function slugOf(l) { if (!l) return ''; const m = String(l).match(/\/oferta\/([^?#]+)/) || String(l).match(/imobiliare\.ro\/[^?#]*\/([^?#\/]+?)(?:-[A-Z0-9]{6,})?$/); return m ? m[1].replace(/-ID\w+$/, '').replace(/-\d{6,}$/, '').replace(/-/g, ' ') : ''; }
function signs(a) { try { return SEM.extract([a.titlu, a.adresa, a.reper, slugOf(a.link), a.rezumat, a.nota].filter(Boolean).join('. '), { strada: a.strada, nr: a.nr }); } catch (e) { return {}; } }
function pick(a, s, k) { const v = a[k]; return (v != null && v !== '') ? v : s[k]; }

// ---------- caracteristici ----------
// fiecare caracteristică: id (din evaluator, dacă e cazul), descriere, și valoarea pe anunț (0/1 sau număr)
function featsApt(r) {
  const a = r.a, s = signs(a), f = {};
  const an = num(a.an) || s.an || null, old = an ? an <= 1990 : null, nou = an ? an >= 2006 : null;
  const era = r.era || (an ? (an <= 1990 ? 'vechi' : an >= 2015 ? 'nou' : 'mijloc') : 'x');
  const cam = num(a.camere) || s.camere || null, mp = num(a.mp);
  f['mp.log'] = Math.log(mp / 60);
  if (cam === 1) f['cam.1'] = 1; else if (cam === 3) f['cam.3'] = 1; else if (cam >= 4) f['cam.4'] = 1; else if (!cam) f['cam.unk'] = 1;
  const e = CMA.parseEtaj(pick(a, s, 'etaj')), tot = num(pick(a, s, 'etajeTotal'));
  const isNew = nou != null ? nou : era === 'nou' || era === 'mijloc' && an >= 2006;
  if (e === 0) f[isNew ? 'floor.parterNou' : 'floor.parterVechi'] = 1;
  else if (e === -1) f['floor.demisol'] = 1;
  else if (e === 'M') f['floor.mansarda'] = 1;
  else if (typeof e === 'number' && tot && e >= tot && tot >= 3) {
    if (s.penthouse) f['floor.penthouse'] = 1;
    else if (s.acoperis === 'terasa') f[isNew ? 'floor.ultimTerasaNou' : 'floor.ultimTerasaVechi'] = 1;
    else if (s.acoperis === 'sarpanta') f[isNew ? 'floor.ultimSarpantaNou' : 'floor.ultimSarpantaVechi'] = 1;
    else if (s.acoperis === 'etajTehnic') f['floor.ultimTehnic'] = 1;
    else f[isNew ? 'floor.ultimNou' : 'floor.ultimVechi'] = 1;
  } else if (e == null) f['floor.unk'] = 1;
  if (s.lift === false && typeof e === 'number' && e >= 3) f['floor.faraLift'] = 1;
  const cp = pick(a, s, 'compart'); if (cp === 'semidecomandat') f['compart.semidecomandat'] = 1; else if (cp === 'nedecomandat' || cp === 'circular') f['compart.nedecomandat'] = 1; else if (!cp) f['compart.unk'] = 1;
  const inc = pick(a, s, 'incalzire'); if (inc === 'termoficare') f['incalzire.termoficare'] = 1; else if (inc === 'pompa') f['incalzire.pompa'] = 1; else if (!inc) f['incalzire.unk'] = 1;
  const bl = pick(a, s, 'balcon'); if (bl === 'nu') f['balcon.nu'] = 1; else if (bl === 'terasa') f['balcon.terasa'] = 1; else if (!bl) f['balcon.unk'] = 1;
  const vd = pick(a, s, 'vedere'); if (vd && vd !== 'normal') f['vedere.' + vd] = 1;
  const st = pick(a, s, 'stare'); if (st === 'renovat') f['stareApt.renovat'] = 1; else if (st === 'premium') f['stareApt.premium'] = 1; else if (st === 'renovare' || st === 'imbunatatiri') f['stareApt.renovare'] = 1; else if (st === 'gri') f['stareApt.gri'] = 1;
  if (s.mobilat === true || a.mobilat === true) f['misc.mobilat'] = 1;
  if ((s.reabilitat === true || a.anvelopat === true) && (old || old == null)) f['misc.anvelopat'] = 1;
  if (s.boxa || a.boxa) f['misc.boxa'] = 1;
  if (s.parcare || num(a.parcareNr) > 0) f['misc.parcare'] = 1;
  const mt = pick(a, s, 'material'); if (mt === 'caramida') f['material.caramida'] = 1; else if (mt === 'panou') f['material.panou'] = 1; else if (mt === 'bca') f['material.bca'] = 1;
  const bai = num(pick(a, s, 'bai')); if (bai != null && cam) { if (bai >= 2 && cam === 3) f['bai.doua3cam'] = 1; else if (bai === 1 && cam >= 4) f['bai.una4cam'] = 1; else if (bai >= 2 && cam === 2) f['bai.doua2cam'] = 1; }
  const ct = pick(a, s, 'cert'); if (ct) f['cert.' + (ct === 'G' ? 'F' : String(ct).toUpperCase())] = 1;
  const sd = pick(a, s, 'stadiu'); if (sd === 'constructie') f['stadiu.constructie'] = 1;
  const tv = a.plusTVA ? 'plus' : pick(a, s, 'tva'); if (tv === 'plus' && r.sursa !== 'sudrezidential') f['tva.plus'] = 1;
  const or = pick(a, s, 'orientare'); if (or === 'S' || or === 'SE' || or === 'SV') f['orientare.S'] = 1; else if (or === 'N' || or === 'NE' || or === 'NV') f['orientare.N'] = 1;
  if (s.comision0 || a.comision0) f['info.comision0'] = 1;
  if (s.proprietar || a.vanzator === 'persoana') f['info.proprietar'] = 1;
  if (s.metrouText) f['info.metrouText'] = 1;
  if (r.sursa && r.sursa !== 'lipit') f['sursa.' + r.sursa] = 1;
  return { f: f, g: r.zona + '|' + era };
}
function featsCasa(r) {
  const a = r.a, s = signs(a), f = {};
  const an = num(a.an) || s.an || null, era = an ? (an <= 2005 ? 'vechi' : an >= 2015 ? 'nou' : 'mijloc') : 'x';
  const mp = num(a.mp), teren = num(a.teren) || s.teren || null;
  f['mp.log'] = Math.log(mp / 130);
  if (teren) f['teren.log'] = Math.log(Math.max(60, Math.min(5000, teren)) / 400); else f['teren.unk'] = 1;
  const tc = pick(a, s, 'tipCasa'); if (tc && tc !== 'individuala') f['tipCasa.' + tc] = 1; else if (!tc) f['tipCasa.unk'] = 1;
  const rg = pick(a, s, 'regim'); if (rg && rg !== 'P+1') f['regim.' + rg] = 1; else if (!rg) f['regim.unk'] = 1;
  const sr = pick(a, s, 'structura'); if (sr && sr !== 'caramida') f['structura.' + sr] = 1;
  const st = a.stare || s.stareCasa; if (st === 'rosu') f['stareCasa.rosu'] = 1; else if (st === 'gri') f['stareCasa.gri'] = 1; else if (st === 'renovat') f['stareCasa.renovat'] = 1; else if (st === 'premium') f['stareCasa.premium'] = 1; else if (st === 'renovare' || st === 'imbunatatiri') f['stareCasa.renovare'] = 1;
  const sd = pick(a, s, 'stadiu'); if (sd === 'constructie') f['stadiu.constructie'] = 1;
  if (s.garaj || a.garaj) f['casa.garaj'] = 1; if (s.piscina) f['casa.piscina'] = 1;
  if (s.asfalt === false) f['casa.neasfaltat'] = 1; if (s.utilCanal === false) f['casa.fosa'] = 1; if (s.utilGaz === false) f['casa.faraGaz'] = 1;
  if (s.mobilat === true) f['misc.mobilat'] = 1;
  const cam = num(a.camere) || s.camere; if (cam >= 6) f['cam.6'] = 1; else if (cam && cam <= 3) f['cam.3-'] = 1;
  const tv = a.plusTVA ? 'plus' : pick(a, s, 'tva'); if (tv === 'plus' && r.sursa !== 'sudrezidential') f['tva.plus'] = 1;
  if (s.comision0 || a.comision0) f['info.comision0'] = 1;
  if (s.proprietar || a.vanzator === 'persoana') f['info.proprietar'] = 1;
  if (r.sursa && r.sursa !== 'lipit') f['sursa.' + r.sursa] = 1;
  return { f: f, g: r.zona + '|' + era };
}

// ---------- regresie ponderată cu efecte fixe (centrare pe grup) ----------
function fit(obs, minGroup) {
  // obs: [{y, w, f, g}]; grupurile prea mici se scot (nu au cu ce fi comparate)
  const gc = {}; obs.forEach(o => { gc[o.g] = (gc[o.g] || 0) + o.w; });
  obs = obs.filter(o => gc[o.g] >= minGroup);
  const names = []; const idx = {}; obs.forEach(o => { for (const k of Object.keys(o.f)) if (idx[k] == null) { idx[k] = names.length; names.push(k); } });
  const p = names.length, n = obs.length;
  // numărul de anunțuri pe caracteristică (0/1 → câte au 1; continue → câte au valoare)
  const cnt = new Array(p).fill(0); obs.forEach(o => { for (const k of Object.keys(o.f)) cnt[idx[k]]++; });
  function demean(list) {
    const gs = {}; list.forEach(o => { const g = gs[o.g] = gs[o.g] || { w: 0, y: 0, x: new Float64Array(p) }; g.w += o.w; g.y += o.w * o.y; for (const k of Object.keys(o.f)) g.x[idx[k]] += o.w * o.f[k]; });
    return list.map(o => { const g = gs[o.g], x = new Float64Array(p); for (let j = 0; j < p; j++) x[j] = -g.x[j] / g.w; for (const k of Object.keys(o.f)) x[idx[k]] += o.f[k]; return { y: o.y - g.y / g.w, w: o.w, x: x, o: o }; });
  }
  function solve(list) {
    const A = []; for (let i = 0; i < p; i++) A.push(new Float64Array(p + 1));
    list.forEach(r => { const x = r.x, w = r.w; for (let i = 0; i < p; i++) { const xi = x[i]; if (!xi) continue; const Ai = A[i], wxi = w * xi; for (let j = i; j < p; j++) if (x[j]) Ai[j] += wxi * x[j]; Ai[p] += wxi * r.y; } });
    for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) A[i][j] = A[j][i];
    // ridge mic pentru coloanele aproape coliniare / foarte rare
    for (let i = 0; i < p; i++) A[i][i] += 1e-6 + 1e-3 * (cnt[i] < 3 ? 1 : 0);
    // eliminare gaussiană cu pivot (p e mic: ≤ 80)
    const M = A.map(r => Array.from(r)); const beta = new Array(p).fill(0);
    for (let c = 0; c < p; c++) { let pv = c; for (let r = c + 1; r < p; r++) if (Math.abs(M[r][c]) > Math.abs(M[pv][c])) pv = r; if (Math.abs(M[pv][c]) < 1e-12) continue; [M[c], M[pv]] = [M[pv], M[c]]; for (let r = 0; r < p; r++) { if (r === c) continue; const fct = M[r][c] / M[c][c]; if (!fct) continue; for (let k = c; k <= p; k++) M[r][k] -= fct * M[c][k]; } }
    for (let i = 0; i < p; i++) beta[i] = Math.abs(M[i][i]) > 1e-12 ? M[i][p] / M[i][i] : 0;
    // inversa (pentru erori standard): rezolvăm din nou cu identitatea; p mic → acceptabil
    const Ai = invert(A.map(r => Array.from(r).slice(0, p)));
    return { beta, Ai };
  }
  function invert(M0) {
    const m = M0.length, M = M0.map((r, i) => r.concat(Array.from({ length: m }, (_, j) => (i === j ? 1 : 0))));
    for (let c = 0; c < m; c++) { let pv = c; for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[pv][c])) pv = r; if (Math.abs(M[pv][c]) < 1e-12) continue; [M[c], M[pv]] = [M[pv], M[c]]; const d = M[c][c]; for (let k = 0; k < 2 * m; k++) M[c][k] /= d; for (let r = 0; r < m; r++) { if (r === c) continue; const fct = M[r][c]; if (!fct) continue; for (let k = 0; k < 2 * m; k++) M[r][k] -= fct * M[c][k]; } }
    return M.map(r => r.slice(m));
  }
  let list = demean(obs);
  let { beta } = solve(list);
  // a doua trecere fără reziduurile atipice (|rez| > 2,5 × MAD)
  const res = list.map(r => { let yh = 0; for (let j = 0; j < p; j++) yh += beta[j] * r.x[j]; return r.y - yh; });
  const med = median(res), mad = median(res.map(x => Math.abs(x - med))) * 1.4826 || 0.2;
  const keep = list.filter((r, i) => Math.abs(res[i] - med) <= 2.5 * mad);
  list = demean(keep.map(r => r.o));
  const sol = solve(list); beta = sol.beta;
  let rss = 0, wsum = 0; list.forEach(r => { let yh = 0; for (let j = 0; j < p; j++) yh += beta[j] * r.x[j]; rss += r.w * (r.y - yh) * (r.y - yh); wsum += r.w; });
  const groups = Object.keys(gc).filter(g => gc[g] >= minGroup).length;
  const sigma2 = rss / Math.max(1, wsum - p - groups);
  const out = {};
  names.forEach((k, j) => { const se = Math.sqrt(Math.max(0, sigma2 * sol.Ai[j][j])); out[k] = { beta: beta[j], se: se, t: se ? beta[j] / se : 0, n: cnt[j] }; });
  return { coef: out, n: obs.length, kept: keep.length, groups: groups, sigma: Math.sqrt(sigma2) };
}
function median(xs) { const s = xs.slice().sort((a, b) => a - b), n = s.length; if (!n) return 0; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }

// ---------- rulare ----------
const obsA = rows.filter(r => r.tip === 'apartament').map(r => { const x = featsApt(r); return { y: Math.log(r.ppm), w: r.w || 1, f: x.f, g: x.g }; });
const obsC = rows.filter(r => r.tip === 'casa').map(r => { const x = featsCasa(r); return { y: Math.log(r.ppm), w: r.w || 1, f: x.f, g: x.g }; });
const fitA = fit(obsA, 6), fitC = fit(obsC, 6);
console.log('apartamente: folosite', fitA.n, 'păstrate', fitA.kept, 'grupuri zonă×vechime', fitA.groups, 'σ', fitA.sigma.toFixed(3));
console.log('case: folosite', fitC.n, 'păstrate', fitC.kept, 'grupuri', fitC.groups, 'σ', fitC.sigma.toFixed(3));

// ---------- traducere în factorii evaluatorului ----------
const MIN_N = 80, MIN_T = 2.5, CLIP = 0.15, CLIP_MIC = 0.08;
const EURMP = { 'stareApt.renovat': 1, 'stareApt.premium': 1, 'stareApt.renovare': 1, 'stareApt.gri': 1, 'stareCasa.rosu': 1, 'stareCasa.gri': 1, 'stareCasa.renovat': 1, 'stareCasa.premium': 1, 'stareCasa.renovare': 1 };
const ONLY_REPORT = /^(sursa\.|info\.|cam\.|mp\.|teren\.|floor\.unk|compart\.unk|incalzire\.unk|balcon\.unk|tipCasa\.unk|regim\.unk|tva\.|bai\.doua2cam|floor\.faraLift|casa\.|misc\.boxa|misc\.parcare|cert\.[CDE]$)/;
function translate(fitR, tip) {
  const features = {}, factors = {};
  for (const id of Object.keys(fitR.coef)) {
    const c = fitR.coef[id]; const prior = CMA.baseFactor(id);
    const isEur = !!EURMP[id];
    const factor = isEur ? Math.round(c.beta * 2000) : Math.exp(c.beta);
    const rec = { tip: tip, beta: round(c.beta, 4), se: round(c.se, 4), t: round(c.t, 2), n: c.n, factor: isEur ? factor : round(factor, 4), prior: prior, aplicat: false, motiv: '' };
    if (ONLY_REPORT.test(id) || prior == null) rec.motiv = 'doar informativ';
    else if (c.n < MIN_N) rec.motiv = 'prea puține anunțuri (' + c.n + ' < ' + MIN_N + ')';
    else if (Math.abs(c.t) < MIN_T) rec.motiv = 'nu e clar diferit de zero (|t| ' + Math.abs(c.t).toFixed(1) + ' < ' + MIN_T + ')';
    else if (!isEur && prior !== 1 && Math.sign(Math.log(prior)) !== Math.sign(c.beta)) rec.motiv = 'contrazice sensul factorului din experiență';
    else if (isEur && prior !== 0 && Math.sign(prior) !== Math.sign(factor)) rec.motiv = 'contrazice sensul factorului din experiență';
    else {
      // cu puține anunțuri (sub 300) factorul se mișcă mai puțin față de experiență (±8%), altfel ±15%
      let v = factor; const clip = c.n >= 300 ? CLIP : CLIP_MIC;
      if (isEur) { const lo = Math.min(prior * (1 - clip) - 30, prior * (1 + clip) + 30), hi = Math.max(prior * (1 - clip) - 30, prior * (1 + clip) + 30); v = Math.max(lo, Math.min(hi, v)); v = Math.round(v); }
      else { const lo = prior * (1 - clip), hi = prior * (1 + clip); v = round(Math.max(lo, Math.min(hi, v)), 4); }
      rec.aplicat = true; rec.motiv = v !== rec.factor ? 'aplicat, limitat la ±' + Math.round(clip * 100) + '% față de experiență' : 'aplicat'; rec.factor = v;
      factors[id] = v;
    }
    features[id] = rec;
  }
  return { features, factors };
}
function round(x, d) { const k = Math.pow(10, d); return Math.round(x * k) / k; }
const tA = translate(fitA, 'apartament'), tC = translate(fitC, 'casa');
const features = Object.assign({}, tA.features);
for (const k of Object.keys(tC.features)) features[k in features ? 'casa:' + k : k] = tC.features[k];
const factors = Object.assign({}, tA.factors);
for (const k of Object.keys(tC.factors)) if (!(k in factors)) factors[k] = tC.factors[k];
const out = { generatLa: new Date(now).toISOString(), n: { apartament: fitA.n, casa: fitC.n }, sigma: { apartament: round(fitA.sigma, 3), casa: round(fitC.sigma, 3) },
  reguli: 'aplicat dacă n ≥ ' + MIN_N + ', |t| ≥ ' + MIN_T + ', același sens ca factorul din experiență, limitat la ±' + Math.round(CLIP_MIC * 100) + '% (sub 300 anunțuri) sau ±' + Math.round(CLIP * 100) + '%',
  factors: factors, features: features };
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
console.log('factori aplicați:', Object.keys(factors).length, '→', outFile);
const show = Object.keys(features).sort((a, b) => Math.abs(features[b].t) - Math.abs(features[a].t)).slice(0, 45);
for (const k of show) { const f = features[k]; console.log((f.aplicat ? '✓ ' : '  ') + k.padEnd(28), 'β', String(f.beta).padStart(8), 't', String(f.t).padStart(6), 'n', String(f.n).padStart(5), 'factor', String(f.factor).padStart(8), 'prior', f.prior == null ? '—' : f.prior, '·', f.motiv); }
