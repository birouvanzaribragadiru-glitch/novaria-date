// Străzile mai scumpe și mai ieftine din fiecare zonă, calculate automat din anunțuri.
// Pentru fiecare anunț care spune strada (sau un reper, o stație de metrou), comparăm prețul lui pe mp, adus la
// proprietatea tipică, cu mediana zonei pentru același tip (și aceeași vechime, la apartamente). Diferența e „reziduul".
// O stradă primește media reziduurilor anunțurilor de pe ea, trasă spre media anunțurilor din jur (pe o rază de câteva
// sute de metri) și spre zero când sunt puține: cu 1–2 anunțuri factorul abia se mișcă, cu 10+ urmează anunțurile.
// La București scoatem întâi efectul metroului (evaluatorul îl aplică separat), ca să nu fie numărat de două ori.
// Rezultat: { zone: { idZonă: { 'Nume stradă|Localitate': [procent, anunțuri pe stradă, anunțuri din jur] } }, ... }
// Folosit identic de aplicația internă și de exportul pentru evaluatorul public.
(function (root) {
  var KW = { adresa: 1, strada: 1, reper: 0.6, metrou: 0.35 };          // cât de sigur e locul anunțului
  var TW = { apartament: 1, casa: 1, teren: 0.5 };                        // terenurile variază și din alte motive
  var MET = { '5': 1.04, '10': 1.02, '20': 1.0, '30': 0.97 };             // aceiași factori ca în evaluator
  var DEF = { hB: 0.25, hI: 0.4, K0: 6, K1: 12, cap: 0.15, minF: 0.01, maxR: 0.6, clip: 0.3, dB: 0.7, dI: 1.0, minG: 4, minNear: 0.8, minCV: 30, tw: TW };

  function dkm(a, b) { var dx = (a[0] - b[0]) * 79.4, dy = (a[1] - b[1]) * 111.2; return Math.sqrt(dx * dx + dy * dy); }
  function wmed(rs) { var s = rs.filter(function (r) { return r.v; }).sort(function (a, b) { return a.v - b.v; }), tot = 0, c = 0, i; s.forEach(function (r) { tot += r.w; }); if (!tot) return null; for (i = 0; i < s.length; i++) { c += s[i].w; if (c >= tot / 2) return s[i].v; } return s[s.length - 1].v; }
  function wsum(rs) { var t = 0; rs.forEach(function (r) { t += r.w; }); return t; }
  function wtrim(rs) { rs = rs.filter(function (r) { return r.v; }); var m = wmed(rs); return m ? rs.filter(function (r) { return r.v >= m * 0.5 && r.v <= m * 2; }) : rs; }
  function r1(x) { return Math.round(x * 10) / 10; }

  // categoria de distanță până la metrou (ca în harta aplicației): minute pe jos ≈ distanța în linie dreaptă × 1,3 / 80 m pe minut
  function metroOpt(I, ll) {
    var m = I && I.m; if (!m || !m.length || !ll) return null;
    var bd = 1e9; for (var i = 0; i < m.length; i++) { var d = dkm([m[i].x, m[i].y], ll); if (d < bd) bd = d; }
    var min = Math.max(1, Math.round(bd * 1000 * 1.3 / 80));
    return { opt: min < 5 ? '5' : min <= 10 ? '10' : min <= 20 ? '20' : '30', min: min };
  }
  function extent(s) { var p = s.p, mx = 0; for (var i = 0; i < p.length; i++) for (var j = i + 1; j < p.length; j++) { var d = dkm(p[i], p[j]); if (d > mx) mx = d; } return mx; }
  function key(s) { return s.nm + '|' + s.loc; }
  function gk(r) { return r.zona + '|' + r.tip + '|' + (r.tip === 'apartament' ? (r.era === 'vechi' ? 'v' : r.era === 'nou' ? 'n' : 'x') : '-'); }

  // rows: rândurile din NV_MARKET.collect (zona, tip, v, w, era, a); I: indexul NV_GEO; locate(row) → poziția anunțului
  function prepare(rows, zones, I, locate, o) {
    o = Object.assign({}, DEF, o || {});
    var zmap = {}; (zones || []).forEach(function (z) { zmap[z.id] = z; });
    var G = {}, exp = {};
    rows.forEach(function (r) { if (r.v && zmap[r.zona]) (G[gk(r)] = G[gk(r)] || []).push(r); });
    Object.keys(G).forEach(function (k) { var rs = wtrim(G[k]); if (wsum(rs) >= o.minG) exp[k] = wmed(rs); });
    var P = {}, LEN = {}, nLoc = 0;
    rows.forEach(function (r) {
      var e = exp[gk(r)]; if (!e || !r.v) return;
      var loc = locate(r); if (!loc || !KW[loc.kind]) return;
      var res = Math.log(r.v / e); if (Math.abs(res) > o.maxR) return;
      var z = zmap[r.zona];
      if (z.sector && I.m) { var mo = metroOpt(I, loc.ll); if (mo) res -= Math.log(MET[mo.opt]); }
      res = Math.max(-o.clip, Math.min(o.clip, res));
      var w = (r.w || 1) * KW[loc.kind] * (o.tw[r.tip] != null ? o.tw[r.tip] : 1), wk = w; if (!w) return;
      // pe străzile lungi nu știm unde e casa pe stradă: anunțul contează mai puțin pentru vecini
      if (loc.si != null) { var L = LEN[loc.si] != null ? LEN[loc.si] : (LEN[loc.si] = extent(I.s[loc.si])); if (L > 1.2) wk = w * 1.2 / L; }
      (P[r.zona] = P[r.zona] || []).push({ ll: loc.ll, r: res, w: w, wk: wk, si: loc.si != null ? loc.si : null, tip: r.tip, mp: +r.a.mp || 0, pret: r.ppm * (+r.a.mp || 0) });
      nLoc++;
    });
    // același anunț pus de mai multe ori (alt agent, preț ușor diferit): în aceeași zonă, același tip, ±3% mp și ±5% preț,
    // la mai puțin de 1,5 km → cântăresc împreună cât unul (și la verificare se scot împreună)
    var dupId = 0;
    Object.keys(P).forEach(function (zid) {
      var g = {}; P[zid].forEach(function (p) { (g[p.tip] = g[p.tip] || []).push(p); });
      Object.keys(g).forEach(function (k) {
        var L = g[k];
        L.forEach(function (p) {
          var same = L.filter(function (q) { return q.mp && p.mp && Math.abs(q.mp / p.mp - 1) <= 0.03 && Math.abs(q.pret / p.pret - 1) <= 0.05 && dkm(q.ll, p.ll) < 1.5; });
          if (same.length > 1) { var id = null; same.forEach(function (q) { if (q.dup != null) id = q.dup; }); if (id == null) id = ++dupId; same.forEach(function (q) { q.dup = id; }); }
        });
      });
      var cnt = {}; P[zid].forEach(function (p) { if (p.dup != null) cnt[p.dup] = (cnt[p.dup] || 0) + 1; });
      P[zid].forEach(function (p) { if (p.dup != null) { p.w /= cnt[p.dup]; p.wk /= cnt[p.dup]; } });
    });
    // centrăm pe zonă: media zonei rămâne valoarea zonei din evaluator
    Object.keys(P).forEach(function (zid) { var a = 0, b = 0; P[zid].forEach(function (p) { a += p.r * p.w; b += p.w; }); var c = b ? a / b : 0; P[zid].forEach(function (p) { p.r -= c; }); });
    return { o: o, zmap: zmap, P: P, nLoc: nLoc, I: I };
  }

  // estimarea pentru o stradă din zonă; skip: un anunț scos din calcul (pentru verificarea prin eliminare)
  function streetEst(C, zid, s, skip) {
    var o = C.o, pts = C.P[zid] || [], z = C.zmap[zid], h = z && z.sector ? o.hB : o.hI, h2 = 2 * h * h;
    var Sw = 0, Swr = 0, Kw = 0, Kwr = 0, sp = s.p, np = sp.length;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i]; if (skip && (p === skip || (skip.dup != null && p.dup === skip.dup))) continue;
      if (p.si === s.i) { Sw += p.w; Swr += p.w * p.r; continue; }
      var k = 0; for (var j = 0; j < np; j++) { var d = dkm(p.ll, sp[j]); k += Math.exp(-d * d / h2); }
      k = k / np * p.wk; if (k > 1e-4) { Kw += k; Kwr += k * p.r; }
    }
    var kern = Kwr / (Kw + o.K0), f = (Swr + o.K1 * kern) / (Sw + o.K1);
    return { f: f, own: Sw, near: Kw };
  }

  function candidates(C, zid) {
    var o = C.o, I = C.I, pts = C.P[zid] || [], z = C.zmap[zid]; if (!pts.length || !z) return [];
    var ilf = !z.sector, D = ilf ? o.dI : o.dB, zl = ilf && root.NV_GEO && root.NV_GEO.zoneLoc ? root.NV_GEO.zoneLoc(I, zid) : null;
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    pts.forEach(function (p) { x0 = Math.min(x0, p.ll[0]); x1 = Math.max(x1, p.ll[0]); y0 = Math.min(y0, p.ll[1]); y1 = Math.max(y1, p.ll[1]); });
    var dx = D / 79.4, dy = D / 111.2, own = {}, out = [];
    pts.forEach(function (p) { if (p.si != null) own[p.si] = 1; });
    I.s.forEach(function (s) {
      if (own[s.i]) { out.push(s); return; }
      if (zl && s.loc !== zl) return;
      if (s.c[0] < x0 - dx - 0.02 || s.c[0] > x1 + dx + 0.02 || s.c[1] < y0 - dy - 0.015 || s.c[1] > y1 + dy + 0.015) return;
      for (var j = 0; j < s.p.length; j++) for (var i = 0; i < pts.length; i++) if (dkm(s.p[j], pts[i].ll) < D) { out.push(s); return; }
    });
    return out;
  }

  // verificare: fiecare anunț de pe o stradă cunoscută e scos pe rând (cu dublurile lui) și prezis din restul datelor.
  // castig = cu cât scade eroarea pătratică față de „media zonei"; panta ≈ 1 înseamnă că factorii au mărimea potrivită.
  function cvStats(C) {
    var o = C.o, T = {};
    Object.keys(C.P).forEach(function (zid) {
      C.P[zid].forEach(function (p) {
        if (p.si == null) return;
        var e = streetEst(C, zid, C.I.s[p.si], p), pr = Math.max(-o.cap, Math.min(o.cap, e.f)), w = p.w;
        var t = T[p.tip] = T[p.tip] || { n: 0, se0: 0, se1: 0, sxy: 0, sxx: 0, W: 0 };
        t.se0 += w * p.r * p.r; t.se1 += w * (p.r - pr) * (p.r - pr); t.sxy += w * pr * p.r; t.sxx += w * pr * pr; t.W += w; t.n++;
      });
    });
    var out = {};
    Object.keys(T).forEach(function (k) { var t = T[k]; out[k] = { n: t.n, castig: t.se0 ? Math.round((1 - t.se1 / t.se0) * 1000) / 1000 : 0, panta: t.sxx ? Math.round(t.sxy / t.sxx * 100) / 100 : null }; });
    return out;
  }
  // cât din factorul străzii se aplică la fiecare tip: doar unde verificarea arată că prezice (altfel 0 → rămâne media zonei)
  function scaleFrom(cv, o) {
    var sc = {};
    ['apartament', 'casa', 'teren'].forEach(function (k) { var c = cv[k]; sc[k] = c && c.n >= o.minCV && c.castig > 0.003 && c.panta > 0 ? Math.round(Math.max(0.25, Math.min(1, c.panta)) * 100) / 100 : 0; });
    return sc;
  }

  function compute(rows, zones, I, locate, opts) {
    var C = prepare(rows, zones, I, locate, opts), o = C.o, out = {}, nStr = 0, nOwn = 0;
    Object.keys(C.P).forEach(function (zid) {
      var zo = {};
      candidates(C, zid).forEach(function (s) {
        var e = streetEst(C, zid, s); if (!e.own && e.near < o.minNear) return;
        var F = Math.max(-o.cap, Math.min(o.cap, Math.exp(e.f) - 1)); if (Math.abs(F) < o.minF) return;
        zo[key(s)] = [r1(F * 100), r1(e.own), r1(e.near)]; nStr++; if (e.own) nOwn++;
      });
      if (Object.keys(zo).length) out[zid] = zo;
    });
    var cv = cvStats(C);
    return { zone: out, scala: scaleFrom(cv, o), cv: cv, anunturi: C.nLoc, strazi: nStr, cuAnunturi: nOwn };
  }
  function crossValidate(rows, zones, I, locate, opts) { return cvStats(prepare(rows, zones, I, locate, opts)); }

  // factorul pentru proprietatea evaluată: M = rezultatul compute (sau varianta publică), zona, tipul, cheia străzii
  function lookup(M, zona, tip, k) {
    var z = M && M.zone && M.zone[zona], e = z && k ? z[k] : null, sc = M && M.scala ? (M.scala[tip] || 0) : 0;
    if (!e || !sc) return null;
    var f = e[0] / 100 * sc; if (Math.abs(f) < 0.005) return null;
    return { f: f, pct: Math.round(f * 1000) / 10, own: e[1], near: e[2], k: k, nm: String(k).split('|')[0] };
  }

  root.NV_MICRO = { compute: compute, crossValidate: crossValidate, lookup: lookup, _prep: prepare, metroOpt: metroOpt, key: key, DEF: DEF, MET: MET };
})(typeof window !== 'undefined' ? window : globalThis);
