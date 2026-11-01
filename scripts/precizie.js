#!/usr/bin/env node
// Testul zilnic de precizie al evaluatorului (leave-one-out pe anunțurile din bază).
// Fiecare anunț e tratat ca „proprietatea de evaluat” (cu câmpurile pe care le are) și estimat:
//   A) doar din media zonei + factori (fără comparabile),
//   B) cu comparabile alese automat din aceeași zonă și același tip (fără el însuși și fără gemenii lui),
//   C) reper naiv: mediana €/mp a zonei × suprafața.
// Măsurăm raportul preț cerut / estimare: biasul (mediana), eroarea mediană după scoaterea biasului,
// cât la sută cad în ±10% și ±20%. Ieșire: DOAR cifre agregate (fără anunțuri, linkuri sau titluri).
// Folosire: node scripts/precizie.js <dump-dir> [data/precizie]   (dump-dir = dosarul cu colecția capturi/)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = global;
require(path.join(ROOT, 'lib/market.js'));
const CMA = require(path.join(ROOT, 'lib/engine.js'));
const EV = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/evaluator.json'), 'utf8'));
if (CMA.setCalib && EV.calib && EV.calib.factors) CMA.setCalib(EV.calib);
const DUMP = process.argv[2], OUT = process.argv[3] || path.join(ROOT, 'data/precizie');
if (!DUMP || !fs.existsSync(path.join(DUMP, 'capturi'))) { console.error('Folosire: node scripts/precizie.js <dump-dir> [data/precizie]'); process.exit(2); }
const MAXZ = +(process.env.NV_PRECIZIE_MAXZ || 60);
const TODAY = (process.env.NV_TODAY || new Date().toISOString().slice(0, 10));

const zones = EV.zone.map(z => { const o = { id: z.id, nume: z.nume, grup: z.grup, lichiditate: z.lq || 'medie', st: z.st || {} }; ['apt_vechi', 'apt_nou', 'casa', 'teren'].forEach(k => { if (z.v && z.v[k]) o[k] = z.v[k]; }); return o; });
const zmap = {}; zones.forEach(z => zmap[z.id] = z);
function num(v) { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; }
const ads = [];
for (const f of fs.readdirSync(path.join(DUMP, 'capturi'))) {
  if (!f.endsWith('.json')) continue;
  let d; try { d = JSON.parse(fs.readFileSync(path.join(DUMP, 'capturi', f), 'utf8')); } catch (e) { continue; }
  if (d && d.data && d.data.a) d = d.data;
  for (const id of Object.keys((d && d.a) || {})) { const v = d.a[id]; if (v && typeof v === 'object') ads.push(v); }
}
const good = ads.filter(a => zmap[a.zona] && num(a.pret) > 5000 && num(a.mp) > 10 && (a.tip === 'apartament' || a.tip === 'casa'))
  .map(a => Object.assign({}, a, { _ppm: num(a.pret) / num(a.mp) })).filter(a => a._ppm >= 300 && a._ppm <= 8000);
const byZT = {}; good.forEach(a => (byZT[a.zona + '|' + a.tip] = byZT[a.zona + '|' + a.tip] || []).push(a));
function subj(a) { return { tip: a.tip, zona: a.zona, mp: num(a.mp), camere: a.camere || '', etaj: a.etaj || '', etajeTotal: a.etajeTotal || '', an: a.an || '', stare: a.stare || '', compart: a.compart || '', incalzire: a.incalzire || '', teren: a.teren || '' }; }
function comp(a) { return { id: a.id, pret: num(a.pret), mp: num(a.mp), camere: a.camere || '', etaj: a.etaj || '', etajeTotal: a.etajeTotal || '', an: a.an || '', stare: a.stare || '', zona: a.zona, status: 'activ', sursa: a.sursa }; }
function pickComps(a, pool) {
  const m = num(a.mp), c = num(a.camere);
  let cand = pool.filter(b => b !== a && b.id !== a.id && Math.abs(num(b.mp) - m) <= 0.25 * m && (a.tip !== 'apartament' || !c || !num(b.camere) || num(b.camere) === c));
  cand = cand.filter(b => Math.abs(num(b.pret) - num(a.pret)) >= 1);   // fără gemeni: același preț cerut = de obicei același anunț repostat sau aceeași unitate dintr-un ansamblu
  cand.sort((x, y) => Math.abs(num(x.mp) - m) - Math.abs(num(y.mp) - m));
  return cand.slice(0, 8).map(comp);
}
function median(xs) { const s = xs.slice().sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; }
function stats(rows) {
  if (!rows.length) return { n: 0 };
  const lr = rows.map(r => Math.log(r.ask / r.est)); const med = median(lr); const dev = lr.map(x => Math.abs(x - med));
  const r3 = x => Math.round(x * 1000) / 1000;
  return { n: rows.length, bias: r3(Math.exp(med)), eroare_mediana: r3(median(dev.map(x => Math.abs(Math.exp(x) - 1)))),
    in10: r3(dev.filter(x => x <= Math.log(1.10)).length / dev.length), in20: r3(dev.filter(x => x <= Math.log(1.20)).length / dev.length) };
}
const sample = {};
for (const k of Object.keys(byZT)) { const lst = byZT[k]; const step = Math.max(1, Math.floor(lst.length / MAXZ)); sample[k] = lst.filter((_, i) => i % step === 0).slice(0, MAXZ); }
const out = { apartament: { A: [], B: [], C: [] }, casa: { A: [], B: [], C: [] } };
const perZone = {};
const today = new Date();
for (const k of Object.keys(sample)) {
  const pool = byZT[k];
  for (const a of sample[k]) {
    const s = subj(a), z = zmap[a.zona], ask = num(a.pret);
    const rA = CMA.evaluate(s, [], zones, null, { useBench: true }, today);
    if (rA.ok && rA.market) out[a.tip].A.push({ ask, est: rA.market });
    const comps = pickComps(a, pool);
    if (comps.length >= 3) {
      const rB = CMA.evaluate(s, comps, zones, null, {}, today);
      if (rB.ok && rB.market) { out[a.tip].B.push({ ask, est: rB.market }); (perZone[k] = perZone[k] || []).push({ ask, est: rB.market }); }
    }
    const st = z.st && z.st[a.tip]; if (st && st.med) out[a.tip].C.push({ ask, est: st.med * num(a.mp) });
  }
}
const fields = ['an', 'etaj', 'etajeTotal', 'stare', 'compart', 'incalzire', 'camere', 'strada'];
const completare = {}; fields.forEach(f => completare[f] = Math.round(1000 * good.filter(a => a[f] != null && a[f] !== '').length / Math.max(1, good.length)) / 1000);
const zone = Object.keys(perZone).filter(k => perZone[k].length >= 10).map(k => { const [zona, tip] = k.split('|'); const s = stats(perZone[k]); return { zona, tip, n: s.n, eroare_mediana: s.eroare_mediana, in10: s.in10 }; })
  .sort((a, b) => b.eroare_mediana - a.eroare_mediana);
const rez = { data: TODAY, anunturi_utilizabile: good.length, zone_tip: Object.keys(byZT).length, esantion_pe_zona: MAXZ,
  apartament: { comparabile: stats(out.apartament.B), media_zonei: stats(out.apartament.A), reper_naiv: stats(out.apartament.C) },
  casa: { comparabile: stats(out.casa.B), media_zonei: stats(out.casa.A), reper_naiv: stats(out.casa.C) },
  completare_campuri: completare, zone_slabe: zone.slice(0, 15), zone_bune: zone.slice(-10).reverse() };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, TODAY + '.json'), JSON.stringify(rez, null, 1));
fs.writeFileSync(path.join(OUT, 'ultimul.json'), JSON.stringify(rez, null, 1));
// seria pentru panou: un rând pe zi
const serieP = path.join(OUT, 'serie.json');
let serie = []; try { serie = JSON.parse(fs.readFileSync(serieP, 'utf8')); } catch (e) { }
serie = serie.filter(r => r.data !== TODAY);
serie.push({ data: TODAY, n: good.length, ap_eroare: rez.apartament.comparabile.eroare_mediana, ap_in10: rez.apartament.comparabile.in10, casa_eroare: rez.casa.comparabile.eroare_mediana, casa_in10: rez.casa.comparabile.in10, an_completat: completare.an });
serie.sort((a, b) => a.data < b.data ? -1 : 1);
fs.writeFileSync(serieP, JSON.stringify(serie.slice(-400), null, 1));
const p = x => x == null ? '–' : (x * 100).toFixed(1) + '%';
console.log('precizie ' + TODAY + ': apartamente eroare mediană ' + p(rez.apartament.comparabile.eroare_mediana) + ' (în ±10%: ' + p(rez.apartament.comparabile.in10) + ', n=' + rez.apartament.comparabile.n + ') · case ' + p(rez.casa.comparabile.eroare_mediana) + ' (în ±10%: ' + p(rez.casa.comparabile.in10) + ', n=' + rez.casa.comparabile.n + ') · reper naiv apartamente ' + p(rez.apartament.reper_naiv.eroare_mediana) + ' · an completat la ' + p(completare.an));
