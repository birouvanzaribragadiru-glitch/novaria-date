// Piața pe zone din TOATE sursele: Publi24 (colectarea săptămânală), Storia (căutările salvate), Sud Rezidențial,
// anunțurile lipite/capturate, referințele imo360 și prețurile de referință din aplicație.
// Cum se combină, pe scurt:
//  1. Referința zonei (prețurile verificate în oct. 2026) se mișcă odată cu imo360: dacă mediana imo360 a zonei
//     (sau a orașului, unde zona nu are destule anunțuri la ei) a crescut cu 3% față de luna de bază, referința crește cu 3%.
//  2. Anunțurile noastre din zonă trag valoarea spre mediana lor, cu o pondere egală cu numărul lor (max. 60);
//     referința cântărește cât 6 anunțuri (10 la case și terenuri, care diferă mult între ele). Cu 2–3 anunțuri valoarea abia se mișcă, cu 30 de anunțuri urmează piața.
//  3. Apartamentele se împart pe vechime (până în 1990 / după 2015 sau „bloc nou”); anunțurile fără an
//     (cele din alertele Storia, de exemplu) mută ușor ambele valori, comparate cu mediana imo360 a zonei.
//  4. Corecțiile manuale din Setări au ultimul cuvânt.
// Folosit identic de aplicația internă și de exportul pentru evaluatorul public de pe novaria.ro.
(function (root) {
  var TVA_NOU = 0.21, W_PRIOR = 6, W_PRIOR_HET = 10, CAP_OWN = 60, TREND_MIN = 0.85, TREND_MAX = 1.15, IMO_MIN_N = 50;
  function num(v) { if (v == null || v === '') return null; if (typeof v === 'number') return isFinite(v) ? v : null; var s = String(v).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'); var m = s.match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; }
  function median(xs) { var s = xs.slice().sort(function (a, b) { return a - b; }), n = s.length; if (!n) return null; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
  function pct(xs, q) { var s = xs.slice().sort(function (a, b) { return a - b; }); if (s.length < 4) return null; var k = (s.length - 1) * q, f = Math.floor(k), c = Math.min(f + 1, s.length - 1); return s[f] + (s[c] - s[f]) * (k - f); }
  function r10(x) { return x == null || !isFinite(x) ? null : Math.round(x / 10) * 10; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function trim(xs) { var m = median(xs); return m ? xs.filter(function (x) { return x >= m * 0.45 && x <= m * 2.2; }) : xs; }
  function live(d) { return (d && Array.isArray(d.anunturi) ? d.anunturi : []).filter(function (a) { return a && a.stareAnunt !== 'absent'; }); }
  function daysAgo(s, now) { var t = typeof s === 'number' ? s : Date.parse(s); return isFinite(t) ? (now - t) / 864e5 : null; }
  var RX_NOU = /\b(bloc nou|constructie noua|construcție nouă|ansamblu nou|ansamblu rezidential nou|imobil nou|finalizat 20[2-3]\d|bloc 20[12]\d|dezvoltator|comision 0)\b/i;

  // Anunțurile se aduc la proprietatea „tipică" pe care se sprijină valoarea zonei din evaluator
  // (apartament de 60 mp, casă de 130 mp utili cu lotul tipic, teren de 500 mp), cu aceleași elasticități ca evaluatorul.
  var REF_MP = { apartament: 60, casa: 130, teren: 500 }, EL = -0.10;
  var RX_NOT_CASA = /\b(hala|depozit|spatiu comercial|spațiu comercial|multifunctional|multifuncțional|pensiune|hotel|casa batraneasca|casă bătrânească|de demolat|demolare|teren cu casa)\b/i;
  var RX_NOT_TEREN = /\b(extravilan|agricol|arabil|livada|livadă|padure|pădure|hectar|ha\b)\b/i;
  function normPpm(tip, p, m, a, z) {
    if (tip === 'apartament') { if (m < 18 || m > 250) return null; return p / m / Math.pow(m / REF_MP.apartament, EL); }
    if (tip === 'casa') {
      if (m < 60 || m > 450 || RX_NOT_CASA.test(a.titlu || '')) return null;
      var tr = num(a.teren), lot0 = z && !z.sector ? 400 : 300, lp = z && z.teren;
      if (tr && lp && tr >= 80 && tr <= 3000) p = p - (tr - lot0) * lp * 0.65;
      if (p <= m * 250) return null;
      return p / m / Math.pow(m / REF_MP.casa, EL);
    }
    if (m < 200 || m > 3000 || RX_NOT_TEREN.test(a.titlu || '')) return null;
    return p / m / Math.pow(m / REF_MP.teren, EL);
  }

  // colectează anunțurile (zonă, tip, €/mp, epocă) din toate colecțiile, fără dubluri între surse
  function collect(src, now, zmap) {
    now = now || Date.now(); zmap = zmap || {};
    var rows = [], seen = {}, cnt = { publi24: 0, storia: 0, imobiliare: 0, sudrezidential: 0, lipit: 0 };
    function add(zona, tip, a, sursa, extra) {
      var p = num(a.pret), m = num(a.mp); if (!zona || !tip || !p || !m || m < 10) return;
      if (extra && extra.tva) p = p * (1 + TVA_NOU);
      var ppm = p / m; if (tip !== 'teren' && (ppm < 300 || ppm > 9000)) return; if (tip === 'teren' && (ppm < 3 || ppm > 5000)) return;
      // Storia trece „Militari, Sectorul 6” și la blocurile noi din Chiajna / Militari Residence: la un anunț capturat dintr-o zonă
      // din București, „bloc nou / dezvoltator” scris doar în titlu (fără anul construcției) nu dovedește că e în cartier
      if (sursa === 'lipit' && tip === 'apartament' && !num(a.an) && zmap[zona] && zmap[zona].sector && RX_NOU.test(a.titlu || '')) return;
      var fp = zona + '|' + tip + '|' + Math.round(m) + '|' + Math.round(p / 1000);
      if (seen[fp]) return; seen[fp] = 1;
      var an = num(a.an), era = (extra && extra.nou) ? 'nou' : an ? (an <= 1990 ? 'vechi' : an >= 2015 ? 'nou' : 'mijloc') : null;
      if (!era && tip === 'apartament' && RX_NOU.test(a.titlu || '')) era = 'nou';
      rows.push({ zona: zona, tip: tip, ppm: ppm, v: normPpm(tip, p, m, a, zmap[zona]), era: era, cam: num(a.camere), sursa: sursa, w: 1, a: a });
      cnt[sursa] = (cnt[sursa] || 0) + 1;
    }
    Object.keys(src.piata || {}).forEach(function (k) { var d = src.piata[k]; if (d && d.zona) live(d).forEach(function (a) { add(d.zona, d.tip, a, 'publi24'); }); });
    Object.keys(src.agentii || {}).forEach(function (k) { var d = src.agentii[k]; if (d && d.zona) (d.anunturi || []).forEach(function (a) { add(d.zona, d.tip, a, 'sudrezidential', { tva: !!a.plusTVA, nou: !!a.nou && d.tip === 'apartament' }); }); });
    Object.keys(src.portaluri || {}).forEach(function (k) { var d = src.portaluri[k]; if (d && d.zona) (d.anunturi || []).forEach(function (a) { var ag = daysAgo(a.venitLa || a.primaData, now); if (ag == null || ag <= 120) add(d.zona, d.tip, a, /imobiliare/i.test(a.sursa || '') ? 'imobiliare' : /olx/i.test(a.sursa || '') ? 'olx' : 'storia'); }); });
    Object.keys(src.lipite || {}).forEach(function (k) { var a = src.lipite[k]; if (a && a.zona) { var ag = daysAgo(a.adaugatLa, now); if (ag == null || ag <= 365) add(a.zona, a.tip, a, 'lipit'); } });
    // unitățile listate de o agenție/dezvoltator în aceeași zonă sunt de obicei din 1–3 proiecte, nu zeci de proprietăți
    // independente: împreună cântăresc cât 1+√n anunțuri, cel mult 4
    var g = {}; rows.forEach(function (r) { if (r.sursa === 'sudrezidential') { var k = r.zona + '|' + r.tip + '|' + (r.era === 'nou' ? 1 : 0); g[k] = (g[k] || 0) + 1; } });
    rows.forEach(function (r) { if (r.sursa === 'sudrezidential') { var n = g[r.zona + '|' + r.tip + '|' + (r.era === 'nou' ? 1 : 0)]; r.w = Math.min(n, 1 + Math.sqrt(n), 4) / n; } });
    return { rows: rows, cnt: cnt };
  }

  function wmed(rs) { var s = rs.filter(function (r) { return r.v; }).sort(function (a, b) { return a.v - b.v; }), tot = 0, c = 0, i; s.forEach(function (r) { tot += r.w; }); if (!tot) return null; for (i = 0; i < s.length; i++) { c += s[i].w; if (c >= tot / 2) return s[i].v; } return s[s.length - 1].v; }
  function wq(rs, q) { var s = rs.slice().sort(function (a, b) { return a.ppm - b.ppm; }), tot = 0, c = 0, i; s.forEach(function (r) { tot += r.w; }); if (!tot) return null; for (i = 0; i < s.length; i++) { c += s[i].w; if (c >= tot * q - 1e-9) return s[i].ppm; } return s[s.length - 1].ppm; }
  function rawTrim(rs) { var m = wq(rs, 0.5); return m ? rs.filter(function (r) { return r.ppm >= m * 0.45 && r.ppm <= m * 2.2; }) : rs; }
  function wsum(rs) { var t = 0; rs.forEach(function (r) { t += r.w; }); return t; }
  function wtrim(rs) { rs = rs.filter(function (r) { return r.v; }); var m = wmed(rs); return m ? rs.filter(function (r) { return r.v >= m * 0.5 && r.v <= m * 2; }) : rs; }
  // mediana anunțurilor proprii, cântărită cu numărul lor (max. 60), față de referință (cât 6–8 anunțuri)
  function post(rs, prior, wp) { var n = Math.min(wsum(rs), CAP_OWN), m = rs.length ? wmed(rs) : null, s = 0, w = 0; if (m != null && n) { s += m * n; w += n; } if (prior) { s += prior * wp; w += wp; } return w ? { v: s / w, w: w } : null; }

  // Cât s-a mișcat imo360 față de luna în care am fixat referințele (zona, sau orașul dacă zona are puține anunțuri la ei)
  function trendOf(cur, base, k, kn) {
    var city = cur && cur.oras && base && base.oras && cur.oras[k] && base.oras[k] ? cur.oras[k] / base.oras[k] : 1;
    return function (zid, isBuc) {
      var c = cur && cur.zone && cur.zone[zid], b = base && base.zone && base.zone[zid];
      if (c && b && c[k] && b[k] && (c[kn] || 0) >= IMO_MIN_N && !c.doarIndex) return { f: clamp(c[k] / b[k], TREND_MIN, TREND_MAX), src: 'zona' };
      return { f: clamp(isBuc ? city : 1 + (city - 1) / 2, TREND_MIN, TREND_MAX), src: isBuc ? 'oras' : 'oras/2' };
    };
  }

  // src: {piata, agentii, portaluri, lipite}; zones: lista din aplicație; ref: documentul imo360 curent;
  // base: imo360 din luna de bază a referințelor {zone:{id:{apt_med,casa_med}}, oras:{...}}; man: corecțiile din Setări
  function compute(src, zones, ref, base, man, now) {
    var zmap = {}; (zones || []).forEach(function (z) { zmap[z.id] = z; });
    var C = collect(src, now, zmap), by = {}, values = {}, stats = {}, R = (ref && ref.zone) || {};
    var tA = trendOf(ref, base, 'apt_med', 'apt_n'), tC = trendOf(ref, base, 'casa_med', 'casa_n');
    C.rows.forEach(function (r) { (by[r.zona + '__' + r.tip] = by[r.zona + '__' + r.tip] || []).push(r); });
    (zones || []).forEach(function (z) {
      var o = {}, st = {}, rf = R[z.id], isBuc = !!z.sector;
      ['apartament', 'casa', 'teren'].forEach(function (tip) {
        var rows = by[z.id + '__' + tip] || [], use = wtrim(rows), raw = rawTrim(rows);
        // statistica afișată: prețul cerut pe mp, cu proiectele dezvoltatorilor cântărite la fel ca în valoare
        var s = { n: rows.length, med: r10(wq(raw, 0.5)), p25: raw.length >= 4 ? r10(wq(raw, 0.25)) : null, p75: raw.length >= 4 ? r10(wq(raw, 0.75)) : null, folosite: Math.round(wsum(use) * 10) / 10, surse: {} };
        rows.forEach(function (r) { s.surse[r.sursa] = (s.surse[r.sursa] || 0) + 1; });
        // aceeași statistică doar pe anunțurile de pe portaluri (fără ofertele de dezvoltator), pentru afișarea publică
        var ind = rawTrim(rows.filter(function (r) { return r.sursa !== 'sudrezidential'; }));
        if (ind.length) s.ind = { n: ind.length, med: r10(wq(ind, 0.5)), p25: ind.length >= 4 ? r10(wq(ind, 0.25)) : null, p75: ind.length >= 4 ? r10(wq(ind, 0.75)) : null };
        if (tip === 'apartament') {
          var T = tA(z.id, isBuc), pv = z.apt_vechi ? z.apt_vechi * T.f : null, pn = z.apt_nou ? z.apt_nou * T.f : null;
          var old = wtrim(use.filter(function (r) { return r.era === 'vechi'; })), neu = wtrim(use.filter(function (r) { return r.era === 'nou'; }));
          var unk = wtrim(use.filter(function (r) { return !r.era || r.era === 'mijloc'; }));
          var PO = post(old, pv, W_PRIOR), PN = post(neu, pn, W_PRIOR);
          // anunțurile fără an: le comparăm cu amestecul vechi/nou așteptat în zonă (din imo360 sau din anunțurile cu an)
          if (PO && PN && wsum(unk) >= 5) {
            var s0 = rf && rf.apt_med && PN.v > PO.v ? clamp((rf.apt_med - PO.v) / (PN.v - PO.v), 0.05, 0.95) : (isBuc ? 0.35 : 0.75);
            var sh = (wsum(neu) + 10 * s0) / (wsum(neu) + wsum(old) + 10), mix = PO.v * (1 - sh) + PN.v * sh;
            var uf = clamp(wmed(unk) / mix, 0.75, 1.3), uw = Math.min(8, wsum(unk) / 4);
            s.faraAn = { n: unk.length, factor: Math.round(uf * 1000) / 1000, pondere: Math.round(sh * 100) / 100 };
            PO = { v: (PO.v * PO.w + PO.v * uf * uw * (1 - sh)) / (PO.w + uw * (1 - sh)) }; PN = { v: (PN.v * PN.w + PN.v * uf * uw * sh) / (PN.w + uw * sh) };
          }
          if (PO) o.apt_vechi = r10(PO.v); if (PN) o.apt_nou = r10(PN.v);
          s.nVechi = old.length; s.nNou = neu.length; s.trend = Math.round((T.f - 1) * 1000) / 10; s.trendSrc = T.src;
          if (rf && rf.apt_med) s.imo360 = { med: rf.apt_med, n: rf.apt_n || null, zile: rf.zile != null ? rf.zile : null, randament: rf.randament != null ? rf.randament : null };
          var seg = {}; [1, 2, 3, 4].forEach(function (c) { var xs = trim(rows.filter(function (r) { return r.cam && Math.min(4, r.cam) === c; }).map(function (r) { return r.ppm; })); if (xs.length >= 4) seg[c === 4 ? '4+' : String(c)] = { n: xs.length, med: r10(median(xs)) }; });
          if (Object.keys(seg).length) s.camere = seg;
        } else {
          var Tc = tip === 'casa' ? tC(z.id, isBuc) : { f: 1, src: null }, pr = z[tip] ? z[tip] * Tc.f : null, P = post(use, pr, W_PRIOR_HET);
          if (P) o[tip] = r10(P.v);
          if (tip === 'casa') { s.trend = Math.round((Tc.f - 1) * 1000) / 10; s.trendSrc = Tc.src; if (rf && rf.casa_med) s.imo360 = { med: rf.casa_med, n: rf.casa_n || null }; }
        }
        if (rows.length || s.imo360) st[tip] = s;
      });
      var mz = (man || {})[z.id]; if (mz) Object.keys(mz).forEach(function (k) { if (mz[k] != null && mz[k] !== '') o[k] = mz[k]; });
      if (Object.keys(o).length) values[z.id] = o;
      if (Object.keys(st).length) stats[z.id] = st;
    });
    return { values: values, stats: stats, surse: C.cnt, n: C.rows.length, trendOras: ref && ref.oras && base && base.oras && base.oras.apt_med ? Math.round((ref.oras.apt_med / base.oras.apt_med - 1) * 1000) / 10 : 0 };
  }
  root.NV_MARKET = { compute: compute, collect: collect, TVA_NOU: TVA_NOU, W_PRIOR: W_PRIOR };
})(typeof window !== 'undefined' ? window : globalThis);
