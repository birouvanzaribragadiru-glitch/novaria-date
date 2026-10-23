#!/usr/bin/env node
// Exportă datele publice pentru evaluatorul de pe novaria.ro.
// Intrare: un dosar cu colecțiile din aplicația internă, câte un fișier JSON pe document:
//   <dump>/piata/*.json, agentii/*.json, portaluri/*.json, lipite/*.json, referinte/imo360.json, setari/general.json (opțional)
// Ieșire: data/evaluator.json — DOAR cifre agregate pe zone (valori €/mp, mediane, numărul de anunțuri)
//         și factorii pe străzi (procent față de media zonei, calculați din mai multe anunțuri de pe stradă și din jur);
//         data/strazi.json — lista străzilor din OpenStreetMap (nume, localitate, centru), pentru câmpul „Strada” din formular.
// Nu iese niciodată din aplicație: anunțuri individuale, linkuri, titluri, telefoane, nume, dosare, lead-uri.
// Folosire: node scripts/export.js <dump> [data/evaluator.json]
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = global;
require(path.join(ROOT, 'lib/market.js'));
require(path.join(ROOT, 'lib/geo.js'));
require(path.join(ROOT, 'lib/micro.js'));
require(path.join(ROOT, 'lib/ansambluri.js'));
const CMA = require(path.join(ROOT, 'lib/engine.js'));
const Z = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib/zones.json'), 'utf8'));

const dump = process.argv[2], outFile = process.argv[3] || path.join(ROOT, 'data/evaluator.json');
if (!dump || !fs.existsSync(dump)) { console.error('Folosire: node scripts/export.js <dosar-cu-colectii> [iesire.json]'); process.exit(2); }

function readColl(name) {
  const dir = path.join(dump, name), o = {};
  if (!fs.existsSync(dir)) return o;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try { o[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch (e) { console.error('ignor', name + '/' + f, e.message); }
  }
  return o;
}
// anunțurile capturate: din 20.10.2026 stau în pachete (capturi/s000…s127, fiecare cu {a: {id: anunț}});
// colecția veche „lipite” (un document pe anunț) se citește doar dacă e în dump, iar pachetele au întâietate
function readCaptures() {
  const o = readColl('lipite'), packs = readColl('capturi');
  let n = 0;
  for (const k of Object.keys(packs)) {
    const a = packs[k] && packs[k].a;
    if (!a || typeof a !== 'object') continue;
    for (const id of Object.keys(a)) { const v = a[id]; if (v && typeof v === 'object') { o[id] = v; n++; } }
  }
  if (Object.keys(packs).length) console.log('capturi:', Object.keys(packs).length, 'pachete,', n, 'anunțuri');
  return o;
}
// anunțurile HomeZZ sunt doar pentru uz intern (acordul cu HomeZZ): nu intră în nicio cifră publică
function eHz(a) { return !!a && typeof a === 'object' && (a.sursa === 'homezz' || /homezz\.ro/.test(String(a.link || ''))); }
function faraHz(src, extra) {
  let n = 0;
  for (const id of Object.keys(src.lipite || {})) if (eHz(src.lipite[id])) { delete src.lipite[id]; n++; }
  for (const coll of [src.portaluri].concat(extra || [])) for (const k of Object.keys(coll || {})) {
    const d = coll[k]; if (!d || !Array.isArray(d.anunturi)) continue;
    const l2 = d.anunturi.filter(a => !eHz(a)); n += d.anunturi.length - l2.length; coll[k] = Object.assign({}, d, { anunturi: l2 });
  }
  if (n) console.log('HomeZZ: sărite', n, 'anunțuri (uz intern)');
}
const src = { piata: readColl('piata'), agentii: readColl('agentii'), portaluri: readColl('portaluri'), lipite: readCaptures() };
faraHz(src);
const ref = readColl('referinte').imo360 || null;
const setari = readColl('setari').general || {};
const istoric = readColl('istoric');                 // istoricul săptămânal pe zone (colectarea de luni): dinamica pieței
const tranzactii = readColl('tranzactii');           // vânzările reale (registrul din aplicație): doar cifre agregate ies de aici
// vânzările agenților (sertarele agenti/<id>/tranzactii din aplicația principală și din copia Parteneri, la <dump>/parteneri/…):
// intră în calibrarea negocierii la fel ca ale lui Lucian, fără nume și fără linkuri
let nAgSales = 0;
for (const base of [dump, path.join(dump, 'parteneri')]) {
  const ag = path.join(base, 'agenti');
  if (!fs.existsSync(ag)) continue;
  for (const uid of fs.readdirSync(ag)) {
    const dir = path.join(ag, uid, 'tranzactii');
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try { const v = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); if (v && v.id && !tranzactii[v.id]) { tranzactii['ag:' + uid.slice(-6) + ':' + v.id] = v; nAgSales++; } }
      catch (e) { console.error('ignor', dir + '/' + f, e.message); }
    }
  }
}
if (nAgSales) console.log('   vânzări ale agenților:', nAgSales);
const chirii = readColl('chirii'); faraHz({ lipite: {}, portaluri: chirii });                   // anunțuri de închiriere (din alertele portalurilor): chiria mediană pe zonă → randament brut
const now = Date.now();

const R = NV_MARKET.compute(src, Z.zone, ref, Z.imoBase, setari.overrides || null, now);

// parametrii modelului: ajustările din Setări (fără date personale) + calibrarea pe vânzările reale (doar factorul)
const params = {};
if (setari.params && typeof setari.params === 'object') for (const k of Object.keys(setari.params)) { const v = setari.params[k]; if (typeof v === 'number' || typeof v === 'boolean') params[k] = v; }
if (setari.tune && typeof setari.tune === 'object') { params.tune = {}; for (const k of Object.keys(setari.tune)) if (typeof setari.tune[k] === 'number') params.tune[k] = setari.tune[k]; }
const zonesEff = Z.zone.map(z => Object.assign({}, z, R.values[z.id] || {}));
// vânzările reale: colecția „tranzactii” + cele vechi din setări (fără dubluri)
const salesAll = (() => { const out = [], ids = {}; for (const k of Object.keys(tranzactii)) { const v = tranzactii[k]; if (v && v.id) { out.push(v); ids[v.id] = 1; } } for (const v of (Array.isArray(setari.vanzari) ? setari.vanzari : [])) if (v && v.id && !ids[v.id]) out.push(v); return out; })();
if (salesAll.length) {
  try {
    const sales = salesAll.map(v => Object.assign({}, v));
    const c = CMA.calibrate(sales, zonesEff, {}, params, new Date(now));
    const pick = x => x ? { f: Math.round(x.f * 10000) / 10000, n: x.n } : null;
    params.calib = { buc: pick(c.buc), ilf: pick(c.ilf), all: pick(c.all) };
  } catch (e) { console.error('calibrare ignorată:', e.message); }
  // negocierea măsurată (preț final / preț de listare), pe tip: intră în evaluatorul de pe site în locul marjei implicite de la 16 vânzări
  const med = xs => { const a = xs.slice().sort((x, y) => x - y), n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null; };
  const txd = {};
  for (const t of ['apartament', 'casa']) {
    const ds = salesAll.filter(v => (v.tip || 'apartament') === t).map(v => { const p = +v.pret, l = +v.pretListare; return p > 0 && l >= p * 0.7 && l <= p * 1.6 ? 1 - p / l : null; }).filter(x => x != null);
    if (ds.length >= 8) txd[t] = { d: Math.round(Math.min(0.25, Math.max(0.01, med(ds))) * 1000) / 1000, n: ds.length };
  }
  if (Object.keys(txd).length) params.txDisc = txd;
  console.log('   vânzări reale:', salesAll.length, '· negociere măsurată:', JSON.stringify(txd));
}

// statistica publică: doar anunțurile de pe portaluri (Publi24, Storia, cele lipite), fără ofertele de dezvoltator,
// și doar unde sunt destule ca să nu se poată deduce un anunț anume
const MIN_MED = 5, MIN_PCT = 8;
function pubStats(s) {
  if (!s || !s.n || s.n < MIN_MED) return null;
  const o = { n: s.n, med: s.med };
  if (s.n >= MIN_PCT && s.p25 && s.p75) { o.p25 = s.p25; o.p75 = s.p75; }
  return o;
}
// ---- străzile: factorul fiecărei străzi față de media zonei (automat, din anunțuri) ----
const STR = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib/strazi.json'), 'utf8'));
const GI = NV_GEO.build(STR, Z.zone, Z.pts, p => p);
const zmap = {}; Z.zone.forEach(z => { zmap[z.id] = z; });
const rowsM = NV_MARKET.collect(src, now, zmap).rows;
const geoCache = new Map();
const locate = r => { if (geoCache.has(r)) return geoCache.get(r); const l = NV_GEO.locateAd(GI, r.a, r.zona, null, r.a.link || r.a.titlu || ''); geoCache.set(r, l); return l; };
const MC = NV_MICRO.compute(rowsM, Z.zone, GI, locate);
// public: doar străzile cu destule anunțuri pe ele și în jur (cel puțin 2), procente întregi
const MIN_STR = 2, microZ = {};
let nPub = 0;
if (Object.keys(MC.scala).some(k => MC.scala[k] > 0)) for (const zid of Object.keys(MC.zone)) {
  const o = {};
  for (const [k, e] of Object.entries(MC.zone[zid])) { if (e[1] + e[2] < MIN_STR || Math.abs(e[0]) < 1) continue; o[k] = [Math.round(e[0]), Math.round(e[1]), Math.round(e[2])]; nPub++; }
  if (Object.keys(o).length) microZ[zid] = o;
}
// străzile notate de Lucian în aplicație (Setări → Străzile notate de tine) au întâietate față de anunțuri, la toate tipurile:
// [procent, anunțuri pe stradă, anunțuri în jur, 1 = notă manuală]
let nMan = 0;
for (const [kk, v] of Object.entries((setari && setari.strazi) || {})) {
  const p = String(kk).split('|'); if (p.length < 3 || v === '' || v == null || !isFinite(+v)) continue;
  const zid = p[0], k = p[1] + '|' + p[2], auto = MC.zone[zid] && MC.zone[zid][k];
  (microZ[zid] = microZ[zid] || {})[k] = [Math.round(+v), auto ? Math.round(auto[1]) : 0, auto ? Math.round(auto[2]) : 0, 1]; nMan++;
}
if (nMan) console.log('   străzi notate de tine:', nMan);
const micro = { scala: MC.scala, n: MC.anunturi, z: microZ };

// ansamblurile rezidențiale: diferența față de zonă (nota lui Lucian sau, altfel, din anunțurile care pomenesc ansamblul).
// Public: doar numele, zona și procentul pe tip; niciun anunț.
const ANS_REG = NV_ANS.registry((setari && setari.ansambluri) || {});
const ANS_ST = NV_ANS.stats(ANS_REG, rowsM.map(r => ({ zona: r.zona, tip: r.tip, pret: r.a.pret, mp: r.a.mp, text: [r.a.titlu, r.a.adresa, r.a.reper, r.a.rezumat].join(' ') })));
const ans = [];
for (const e of ANS_REG) {
  const p = {}; for (const t of ['apartament', 'casa']) { const f = NV_ANS.factor(e, ANS_ST, t); if (f) p[t] = f.pct; }
  if (Object.keys(p).length) ans.push({ id: e.id, n: e.nume, z: e.zona || '', p });
}
console.log('   ansambluri cu diferență față de zonă:', ans.map(a => a.n + ' ' + JSON.stringify(a.p)).join(' · ') || '—');

// lista publică a străzilor (se schimbă doar când se reface indexul OpenStreetMap)
const mo = s => { if (!/^Sector /.test(s.loc)) return 0; const m = NV_MICRO.metroOpt(GI, s.c); return m ? +m.opt : 0; };
const LOCS = [], LI = {};
const li = n => (LI[n] != null ? LI[n] : (LI[n] = LOCS.push(n) - 1));
const r4 = x => Math.round(x * 1e4) / 1e4;
const TYPED = /^(Strada|Bulevardul|Șoseaua|Soseaua|Calea|Aleea|Splaiul|Intrarea|Piața|Piata|Drumul|Drum|Prelungirea|Fundătura|Fundatura|Ulița|Pasajul|Piațeta|Cartierul)\b/i;
const strPub = { v: 1, sursa: '© colaboratorii OpenStreetMap (ODbL)', loc: LOCS, s: GI.s.filter(s => TYPED.test(s.nm)).map(s => [s.nm, li(s.loc), r4(s.c[0]), r4(s.c[1]), mo(s)]), z: {} };
for (const z of Z.zone) { if (!Z.pts[z.id]) continue; const zl = z.grup === 'Ilfov' ? NV_GEO.zoneLoc(GI, z.id) : null; strPub.z[z.id] = [Z.pts[z.id][0], Z.pts[z.id][1], zl != null ? li(zl) : -1]; }
const strFile = path.join(path.dirname(outFile), 'strazi.json'), strTxt = JSON.stringify(strPub) + '\n';
if (!fs.existsSync(strFile) || fs.readFileSync(strFile, 'utf8') !== strTxt) { fs.writeFileSync(strFile, strTxt); console.log('OK', strFile, (strTxt.length / 1024).toFixed(0) + ' KB', '·', strPub.s.length, 'străzi'); }

// La apartamente, „mp” din anunțuri include balconul, iar formularul public cere suprafața utilă fără balcon (balconul separat).
// Publicăm valorile pe mp util: un apartament tipic, 60 mp în anunț ≈ 56 mp utili + un balcon obișnuit de 4 mp.
// Conversia se face aici, o singură dată; evaluatorul de pe site primește mpCuBalcon: false, ca să n-o mai repete.
const BALC_CONV = params.mpCuBalcon === false ? 1 : 60 / 56;
params.mpCuBalcon = false;
// ---- dinamica pieței pe zonă (pentru raportul lunar de pe site): din istoricul săptămânal și din anunțurile capturate ----
const MS_D = 864e5, cap = src.lipite;
function sumLast(pts, key, days) { const L = pts[pts.length - 1]; let t = 0, any = false; for (const p of pts) if (p[key] != null && (Date.parse(L.d) - Date.parse(p.d)) / MS_D < days) { t += p[key]; any = true; } return any ? t : null; }
function dyn(zid, tip) {
  const o = {}, H = istoric[zid + '__' + tip];
  if (H && Array.isArray(H.puncte)) {
    const pts = H.puncte.filter(p => p && p.d).sort((a, b) => (a.d < b.d ? -1 : 1)), L = pts[pts.length - 1];
    if (L && L.n >= 8) {
      o.d = L.d; o.n = L.n; if (L.med) o.med = Math.round(L.med); if (L.zile != null) o.zile = Math.round(L.zile);
      const noi = sumLast(pts, 'noi', 28), ret = sumLast(pts, 'ret', 28); if (noi != null) o.noi = noi; if (ret != null) o.ret = ret;
      if (L.red != null) o.red = Math.round(100 * L.red / L.n);
      const pr = L.propCurat != null ? L.propCurat : L.prop; if (pr != null) o.prop = Math.round(100 * pr / L.n);
      let ref = null; for (let i = pts.length - 1; i >= 0; i--) if ((Date.parse(L.d) - Date.parse(pts[i].d)) / MS_D >= 26 && pts[i].med) { ref = pts[i]; break; }
      if (ref && L.med) o.t4 = Math.round((L.med / ref.med - 1) * 1000) / 10;
    }
  }
  // anunțurile capturate din alertele portalurilor (ultimele 28 de zile): câte au apărut, câte au prețul redus, câte sunt de la proprietari
  let n28 = 0, red = 0, prop = 0, tot = 0;
  for (const id of Object.keys(cap)) { const a = cap[id]; if (!a || a.zona !== zid || a.tip !== tip || !a.pret || !a.mp) continue; tot++; if (a.adaugatLa && now - a.adaugatLa <= 28 * MS_D) n28++; if (a.pretAnterior && a.pretAnterior > a.pret) red++; if (a.vanzator === 'persoana') prop++; }
  if (tot >= 8) { o.cap = tot; o.capNoi = n28; o.capRed = Math.round(100 * red / tot); o.capProp = Math.round(100 * prop / tot); }
  return Object.keys(o).length ? o : null;
}
// chiria mediană pe zonă (€/mp/lună) și randamentul brut față de prețul cerut la vânzare; doar cu cel puțin 5 anunțuri de închiriere
const MIN_CH = 5;
function rentOf(zid, tip, saleMed) {
  const d = chirii[zid + '__' + tip]; if (!d || !Array.isArray(d.anunturi)) return null;
  const xs = d.anunturi.map(a => (+a.pret > 0 && +a.mp > 0) ? +a.pret / +a.mp : null).filter(x => x && x >= 2 && x <= 60);
  if (xs.length < MIN_CH) return null;
  const med = (() => { const a = xs.slice().sort((p, q) => p - q), n = a.length; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; })();
  const o = { med: Math.round(med * 10) / 10, n: xs.length };
  if (saleMed) o.rand = Math.round(med * 12 / saleMed * 1000) / 10;   // % pe an, brut
  return o;
}
const zone = zonesEff.map(z => {
  const st = R.stats[z.id] || {}, o = { id: z.id, nume: z.nume, grup: z.grup, alias: z.alias || [], v: {}, lq: z.lichiditate || 'medie' };
  if (z.sector) o.sector = z.sector; if (z.loc) o.loc = z.loc;
  for (const k of ['apt_vechi', 'apt_nou', 'casa', 'teren']) if (z[k]) o.v[k] = k.startsWith('apt_') ? Math.round(z[k] * BALC_CONV / 10) * 10 : z[k];
  const ps = {};
  for (const t of ['apartament', 'casa', 'teren']) { const p = pubStats(st[t] && st[t].ind); if (p) ps[t] = p; }
  if (Object.keys(ps).length) o.st = ps;
  // câte anunțuri au intrat efectiv în valoare (pentru marja de incertitudine afișată)
  const u = {}; for (const t of ['apartament', 'casa', 'teren']) if (st[t] && st[t].folosite) u[t] = Math.round(st[t].folosite);
  if (Object.keys(u).length) o.u = u;
  const din = {}; for (const t of ['apartament', 'casa']) { const d = dyn(z.id, t); if (d) din[t] = d; }
  if (Object.keys(din).length) o.din = din;
  const ch = {}; for (const t of ['apartament', 'casa']) { const r = rentOf(z.id, t, o.st && o.st[t] && o.st[t].med); if (r) ch[t] = r; }
  if (Object.keys(ch).length) o.ch = ch;
  return o;
});
console.log('   zone cu chirii (randament):', zone.filter(z => z.ch).length);
console.log('   zone cu dinamică (raport lunar):', zone.filter(z => z.din).length);

// factorii de ajustare calibrați din anunțuri (lib/calib.json, scris de scripts/calibrare.js): doar cei aplicați, fără altceva
let calib = null;
try {
  const cj = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib/calib.json'), 'utf8'));
  if (cj && cj.factors && Object.keys(cj.factors).length) calib = { generatLa: cj.generatLa || null, n: cj.n || null, factors: cj.factors };
} catch (e) { /* fără calibrare */ }
const out = {
  v: 1,
  actualizat: new Date(now).toISOString(),
  surse: R.surse,
  anunturi: R.n,
  imo360: ref ? { luna: ref.luna || null, trendOras: R.trendOras } : null,
  params,
  calib,
  zone,
  micro,
  ans
};
// verificare de siguranță: nimic care să arate a link, telefon sau email
const txt = JSON.stringify(out);
if (/https?:\/\/|www\.|@[a-z0-9-]+\.[a-z]{2,}|(?:\+?40|0)7\d{8}/i.test(txt)) { console.error('OPRIT: exportul conține ceva ce arată a link/email/telefon.'); process.exit(3); }
// dacă s-a schimbat doar data, lăsăm fișierul cum e (fără commit inutil)
if (fs.existsSync(outFile)) {
  try {
    const old = JSON.parse(fs.readFileSync(outFile, 'utf8')), strip = o => JSON.stringify(Object.assign({}, o, { actualizat: null }));
    if (strip(old) === strip(out)) { console.log('NESCHIMBAT', outFile, '·', R.n, 'anunțuri', JSON.stringify(R.surse)); process.exit(0); }
  } catch (e) { }
}
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out, null, 0) + '\n');
console.log('OK', outFile, (txt.length / 1024).toFixed(1) + ' KB', '·', zone.length, 'zone ·', R.n, 'anunțuri', JSON.stringify(R.surse));
console.log('   străzi cu factor public:', nPub, '· anunțuri localizate:', MC.anunturi, '· cât se aplică pe tip:', JSON.stringify(MC.scala), '· verificare:', JSON.stringify(MC.cv));
