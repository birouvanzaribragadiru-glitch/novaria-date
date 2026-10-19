#!/usr/bin/env node
// Exportă datele publice pentru evaluatorul de pe novaria.ro.
// Intrare: un dosar cu colecțiile din aplicația internă, câte un fișier JSON pe document:
//   <dump>/piata/*.json, agentii/*.json, portaluri/*.json, lipite/*.json, referinte/imo360.json, setari/general.json (opțional)
// Ieșire: data/evaluator.json — DOAR cifre agregate pe zone (valori €/mp, mediane, numărul de anunțuri).
// Nu iese niciodată din aplicație: anunțuri individuale, linkuri, titluri, telefoane, nume, dosare, lead-uri.
// Folosire: node scripts/export.js <dump> [data/evaluator.json]
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = global;
require(path.join(ROOT, 'lib/market.js'));
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
  zone
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
