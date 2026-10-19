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
const src = { piata: readColl('piata'), agentii: readColl('agentii'), portaluri: readColl('portaluri'), lipite: readColl('lipite') };
const ref = readColl('referinte').imo360 || null;
const setari = readColl('setari').general || {};
const now = Date.now();

const R = NV_MARKET.compute(src, Z.zone, ref, Z.imoBase, setari.overrides || null, now);

// parametrii modelului: ajustările din Setări (fără date personale) + calibrarea pe vânzările reale (doar factorul)
const params = {};
if (setari.params && typeof setari.params === 'object') for (const k of Object.keys(setari.params)) { const v = setari.params[k]; if (typeof v === 'number' || typeof v === 'boolean') params[k] = v; }
if (setari.tune && typeof setari.tune === 'object') { params.tune = {}; for (const k of Object.keys(setari.tune)) if (typeof setari.tune[k] === 'number') params.tune[k] = setari.tune[k]; }
const zonesEff = Z.zone.map(z => Object.assign({}, z, R.values[z.id] || {}));
if (Array.isArray(setari.vanzari) && setari.vanzari.length) {
  try {
    const sales = setari.vanzari.map(v => Object.assign({}, v));
    const c = CMA.calibrate(sales, zonesEff, {}, params, new Date(now));
    const pick = x => x ? { f: Math.round(x.f * 10000) / 10000, n: x.n } : null;
    params.calib = { buc: pick(c.buc), ilf: pick(c.ilf), all: pick(c.all) };
  } catch (e) { console.error('calibrare ignorată:', e.message); }
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
const micro = { scala: MC.scala, n: MC.anunturi, z: microZ };

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

const zone = zonesEff.map(z => {
  const st = R.stats[z.id] || {}, o = { id: z.id, nume: z.nume, grup: z.grup, alias: z.alias || [], v: {}, lq: z.lichiditate || 'medie' };
  if (z.sector) o.sector = z.sector; if (z.loc) o.loc = z.loc;
  for (const k of ['apt_vechi', 'apt_nou', 'casa', 'teren']) if (z[k]) o.v[k] = z[k];
  const ps = {};
  for (const t of ['apartament', 'casa', 'teren']) { const p = pubStats(st[t] && st[t].ind); if (p) ps[t] = p; }
  if (Object.keys(ps).length) o.st = ps;
  // câte anunțuri au intrat efectiv în valoare (pentru marja de incertitudine afișată)
  const u = {}; for (const t of ['apartament', 'casa', 'teren']) if (st[t] && st[t].folosite) u[t] = Math.round(st[t].folosite);
  if (Object.keys(u).length) o.u = u;
  return o;
});

const out = {
  v: 1,
  actualizat: new Date(now).toISOString(),
  surse: R.surse,
  anunturi: R.n,
  imo360: ref ? { luna: ref.luna || null, trendOras: R.trendOras } : null,
  params,
  zone,
  micro
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
