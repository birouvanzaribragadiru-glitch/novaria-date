// Plasarea anunțurilor pe hartă: caută în textul anunțului (titlu, zonă, rezumat, link) o stradă, un număr, o stație de metrou
// sau un reper cu nume (ansamblu, parc, mall) din indexul nostru OpenStreetMap, aproape de centrul zonei anunțului.
(function (root) {
  var TYPE = { strada: 1, bulevardul: 1, soseaua: 1, calea: 1, aleea: 1, splaiul: 1, intrarea: 1, piata: 1, drumul: 1, prelungirea: 1, fundatura: 1, ulita: 1, pasajul: 1, piateta: 1, drum: 1, cartierul: 1 };
  var AB = { str: 'strada', strd: 'strada', bd: 'bulevardul', bdul: 'bulevardul', blvd: 'bulevardul', bul: 'bulevardul', bulevard: 'bulevardul', bulevardului: 'bulevardul', sos: 'soseaua', sosea: 'soseaua', soselei: 'soseaua', cal: 'calea', caii: 'calea', al: 'aleea', alee: 'aleea', aleii: 'aleea', spl: 'splaiul', splai: 'splaiul', int: 'intrarea', intr: 'intrarea', pta: 'piata', prel: 'prelungirea', fdt: 'fundatura', strazii: 'strada', strazi: 'strada' };
  var STOP = {};
  ('apartament apartamente camere camera decomandat semidecomandat vanzare vand vindem proprietar direct comision comisioane mobilat utilat renovat renovata centrala parcare balcon balcoane terasa curte teren terenuri intravilan extravilan casa case vila vile duplex constructie constructii noua nou noi bloc blocuri etaj etaje parter mansarda garsoniera studio zona zonei langa aproape metrou parc parcul pret preturi oferta lux premium finisaje investitie investitii liniste linistita linistit vedere panoramica familie spatios spatioasa luminos luminoasa modern moderna superba superb frumoasa ideal ideala exclusivitate dezvoltare dezvoltator proiect autorizat imobil ansamblu complex rezidential residence city park garden gardens scoala scolii gradinita piata pietei centru centrului central principala asfalt asfaltat utilitati canalizare curent fosa septica nord vest mare mica lunga scurta unirii victoriei pacii libertatii independentei republicii garii parcului lacului lacul padurii padure bisericii florilor trandafirilor teilor salcamilor plopilor castanilor livezii viilor morii campului dealului izvorului soarelui primaverii luminii sperantei fericirii muncii progresului industriilor fabricii gradinii postei agricultori pensionari eroilor tineretului sportului stadionului spitalului salcamului nucului marului cireselor cimitirului crinului salciei plopului magurele bucuresti ilfov sector sectorul comuna oras orasul judet jud strada bulevardul soseaua calea aleea intrarea drumul doua trei patru cinci sase dormitoare dormitor living bucatarie baie bai dressing boxa garaj pivnita podea incalzire pardoseala clima aer conditionat izolat izolatie termen intabulat intabulata cadastru acte disponibil disponibila imediat urgent negociabil credit ipotecar prima bancar tranzactie schimb rate dezvoltatorului termica termic boutique tip stoc limitat finalizat finalizata predare cheie gata mutat locatie zona excelenta oportunitate').split(' ').forEach(function (w) { STOP[w] = 1; });
  function strip(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function prep(s) { return strip(s).replace(/\bb-dul\b/ig, 'bulevardul').replace(/\bp-?\s?ta\b/ig, 'piata').replace(/\bnr\.?\s*(?=\d)/ig, ' nr ').replace(/(\d)\s*(?=mp\b|m2\b|m\b)/ig, '$1 '); }
  function toks(s) { var raw = prep(s).split(/[^A-Za-z0-9]+/).filter(Boolean); return { raw: raw, t: raw.map(function (w) { var l = w.toLowerCase(); return AB[l] || l; }) }; }
  function norm(s) { return toks(s).t.join(' '); }
  function core(t) { var i = 0; while (i < t.length - 1 && TYPE[t[i]]) i++; return t.slice(i); }
  var GEN = { residence: 1, residences: 1, rezidential: 1, residential: 1, ansamblul: 1, ansamblu: 1, complexul: 1, complex: 1, parcul: 1, parc: 1, cartierul: 1, centrul: 1, comercial: 1, shopping: 1, center: 1, centre: 1, mall: 1, the: 1 };
  function build(js, zones, pts, unP) {
    var I = { s: [], ph: {}, r: [], rph: {}, m: [], mph: {}, mlast: {}, zw: {}, zwz: {}, zt: {}, zc: {}, zloc: {} };
    (js.s || []).forEach(function (r, i) {
      var t = toks(r[0]).t, c = core(t), p = [], f = r[8] || [];
      for (var j = 0; j + 1 < f.length; j += 2) p.push([f[j], f[j + 1]]);
      I.s.push({ i: i, nm: r[0], loc: r[1], c: [r[6], r[7]], p: p.length ? p : [[r[6], r[7]]], type: t[0], n1: c.length === 1 });
      var k = c.join(' '); (I.ph[k] = I.ph[k] || []).push(i);
    });
    var ZT = {}; (zones || []).forEach(function (z) { norm(z.nume).split(' ').forEach(function (w) { if (w.length >= 4) ZT[w] = 1; }); }); I.zt = ZT;
    (js.r || []).forEach(function (r, i) {
      var t = toks(r[0]).t, keys = {};
      keys[t.join(' ')] = 1;
      var nn = t.filter(function (w) { return !/^\d+[a-z]?$/.test(w); }); keys[nn.join(' ')] = 1;
      var ng = nn.filter(function (w) { return !GEN[w]; }); if (ng.length) keys[ng.join(' ')] = 1;
      if (!t.some(function (w) { return w.length >= 4 && !STOP[w] && !GEN[w] && !/^\d/.test(w) && !ZT[w]; })) return;
      I.r.push({ nm: r[0], x: r[1], y: r[2], kd: r[3] }); i = I.r.length - 1;
      Object.keys(keys).forEach(function (k) { if (k.length >= 4) (I.rph[k] = I.rph[k] || []).push(i); });
    });
    (js.m || []).forEach(function (m, i) { var k = norm(m[0]).replace(/ [12]$/, ''), lw = k.split(' ').pop(); I.m.push({ nm: m[0].replace(/ [12]$/, ''), x: m[1], y: m[2] }); (I.mph[k] = I.mph[k] || []).push(i); if (lw.length >= 5) (I.mlast[lw] = I.mlast[lw] || []).push(i); });
    (zones || []).forEach(function (z) {
      var own = I.zwz[z.id] = {};
      [z.nume].concat(z.alias || []).forEach(function (a) { String(a).split(/ \/ |\(|\)/).forEach(function (b) { var k = norm(b); if (k) { I.zw[k] = own[k] = 1; var c = core(k.split(' ')).join(' '); if (c) I.zw[c] = own[c] = 1; } }); });
      if (pts && pts[z.id]) I.zc[z.id] = { ll: unP(pts[z.id]), ilf: z.grup === 'Ilfov' };
    });
    return I;
  }
  function dkm(a, b) { var dx = (a[0] - b[0]) * 79.4, dy = (a[1] - b[1]) * 111.2; return Math.sqrt(dx * dx + dy * dy); }
  function zoneLoc(I, z) {
    if (I.zloc[z] !== undefined) return I.zloc[z];
    var c = I.zc[z], cnt = {}; if (!c) return (I.zloc[z] = null);
    I.s.forEach(function (s) { if (dkm(s.c, c.ll) < 1.5) cnt[s.loc] = (cnt[s.loc] || 0) + 1; });
    var best = null; Object.keys(cnt).forEach(function (k) { if (!best || cnt[k] > cnt[best]) best = k; });
    return (I.zloc[z] = best);
  }
  function hash(s) { var h = 2166136261; s = String(s || ''); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  // text: ce știm despre anunț; zona: id-ul zonei din aplicație; addr: indexul de numere (opțional)
  // texts: listă în ordinea încrederii (titlu și descriere întâi, apoi zona declarată, apoi linkul); primul text care dă o poziție câștigă
  function locate(I, texts, zona, addr, key) {
    if (!Array.isArray(texts)) texts = [texts];
    for (var q = 0; q < texts.length; q++) { var r = texts[q] ? locate1(I, texts[q], zona, addr, key) : null; if (r) { r.src = q; return r; } }
    return null;
  }
  function locate1(I, text, zona, addr, key) {
    var zc = I.zc[zona]; if (!zc || !text) return null;
    var R = zc.ilf ? 7 : 3.5, zl = zc.ilf ? zoneLoc(I, zona) : null;
    var T = toks(text), t = T.t, raw = T.raw, n = t.length, best = null;
    var mixed = /[a-z]/.test(text) && /[A-Z]/.test(text);
    function okSt(i) { var s = I.s[i], d = dkm(s.c, zc.ll); return zc.ilf ? (s.loc === zl ? d < 12 : d < 2.5) : d < R; }
    function near(list, ok) { var b = null, bd = 1e9; list.forEach(function (i) { if (!ok(i)) return; var p = ok === okSt ? I.s[i].c : [I.r[i].x, I.r[i].y], d = dkm(p, zc.ll); if (d < bd) { bd = d; b = i; } }); return b; }
    function take(c) { if (!best || c.sc > best.sc || (c.sc === best.sc && c.len > best.len)) best = c; }
    function num(j) { if (t[j] === 'nr') j++; var w = t[j]; if (!w || !/^\d{1,4}[a-z]?$/.test(w) || /^(camere|cam|mp|m|m2|etaj|et|min|minute|km|metri|ari|ha|bai|locuri)$/.test(t[j + 1] || '')) return null; return w; }
    for (var i = 0; i < n; i++) {
      var w = t[i];
      if (TYPE[w] && w !== 'cartierul') {
        for (var k = 4; k >= 1; k--) {
          if (i + k >= n) continue;
          var ph = t.slice(i + 1, i + 1 + k).join(' '); if (!I.ph[ph]) continue;
          var own = I.zwz[zona] || {}, nr0 = num(i + 1 + k);
          if (!nr0 && ((w === 'drumul' && (I.zw[ph] || I.zw[w + ' ' + ph])) || own[w + ' ' + ph] || (own[ph] && w === 'prelungirea'))) break;
          var same = I.ph[ph].filter(function (j) { return I.s[j].type === w; }), si = near(same, okSt); if (si == null) si = near(I.ph[ph], okSt); if (si == null) continue;
          take({ kind: 'strada', sc: 3, len: k, st: si, nr: nr0 }); break;
        }
      }
      if ((w === 'metrou' || w === 'metroul' || w === 'metro') && i + 1 < n) {
        var mfound = null;
        for (var k2 = 4; k2 >= 1 && !mfound; k2--) { var mp = t.slice(i + 1, i + 1 + k2).join(' '); if (I.mph[mp]) mfound = [I.mph[mp], k2]; }
        for (var k5 = 1; k5 <= 3 && !mfound; k5++) { var lw2 = t[i + k5]; if (lw2 && I.mlast[lw2]) mfound = [I.mlast[lw2], 1]; }
        if (mfound) { var mi = mfound[0].map(function (j) { return I.m[j]; }).sort(function (a, b) { return dkm([a.x, a.y], zc.ll) - dkm([b.x, b.y], zc.ll); })[0]; if (dkm([mi.x, mi.y], zc.ll) < R + 1) take({ kind: 'metrou', sc: 2.6, len: mfound[1], m: mi }); }
      }
      if ((w === 'parc' || w === 'parcul') && i + 1 < n) {
        for (var k3 = 4; k3 >= 1; k3--) { var pp = t.slice(i + 1, i + 1 + k3).join(' '); if (I.rph[pp]) { var ri = near(I.rph[pp].filter(function (j) { return I.r[j].kd === 'parc'; }), function (j) { return dkm([I.r[j].x, I.r[j].y], zc.ll) < R; }); if (ri != null) { take({ kind: 'reper', sc: 2.3, len: k3, r: ri }); break; } } }
      }
      for (var k4 = 5; k4 >= 1; k4--) {
        if (i + k4 > n) continue;
        var seg = t.slice(i, i + k4), rp = seg.join(' ');
        if (k4 === 1 && (rp.length < 6 || STOP[rp] || I.zw[rp] || I.zt[rp] || /^\d/.test(rp))) continue;
        if (k4 >= 2 && (STOP[seg[0]] && STOP[seg[k4 - 1]])) continue;
        if (I.rph[rp] && !I.zw[rp]) {
          var rj = near(I.rph[rp], function (j) { return dkm([I.r[j].x, I.r[j].y], zc.ll) < R && I.r[j].kd !== 'parc'; });
          if (rj != null) { var kd = I.r[rj].kd; take({ kind: 'reper', sc: kd === 'ansamblu' ? (k4 >= 2 ? 3.2 : 2.4) : kd === 'mall' ? 2.2 : k4 >= 2 ? 1.6 : 1.2, len: k4, r: rj }); break; }
        }
        if (I.ph[rp] && !I.zw[rp] && !(i > 0 && TYPE[t[i - 1]])) {
          if (k4 === 1 && !(mixed && /^[A-Z]/.test(raw[i]))) continue;
          var sj = near(I.ph[rp].filter(function (j) { return k4 > 1 || I.s[j].n1; }), okSt);
          if (sj != null) { take({ kind: 'strada', sc: k4 >= 2 ? 2 : 1, len: k4, st: sj, nr: num(i + k4) }); break; }
        }
      }
    }
    if (!best) return null;
    var h = hash(key || text), jit = function (r) { var a = (h % 360) * Math.PI / 180, d = r * (0.35 + ((h >> 9) % 100) / 154); return [Math.cos(a) * d / 0.713, Math.sin(a) * d]; };
    if (best.kind === 'strada') {
      var s = I.s[best.st], A = addr && addr[s.i], hit = null;
      if (best.nr && A) A.forEach(function (a) { if (!hit && String(a[0]).toLowerCase() === best.nr) hit = a; });
      if (hit) return { kind: 'adresa', ll: [hit[1], hit[2]], label: s.nm + ' nr. ' + hit[0], loc: s.loc, sc: 4, si: s.i, nm: s.nm };
      var p = s.p[h % s.p.length], j = jit(0.00012);
      return { kind: 'strada', ll: [p[0] + j[0], p[1] + j[1]], label: s.nm, loc: s.loc, sc: best.sc, nr: best.nr, si: s.i, nm: s.nm };
    }
    if (best.kind === 'metrou') { var jm = jit(0.0035); return { kind: 'metrou', ll: [best.m.x + jm[0], best.m.y + jm[1]], label: 'Metrou ' + best.m.nm, sc: best.sc }; }
    var r = I.r[best.r], jr = jit(r.kd === 'cartier' ? 0.004 : r.kd === 'parc' ? 0.002 : 0.0009);
    return { kind: 'reper', ll: [r.x + jr[0], r.y + jr[1]], label: (r.kd === 'parc' && !/^parc/i.test(r.nm) ? 'Parcul ' : '') + r.nm, rk: r.kd, sc: best.sc };
  }
  // strada cea mai apropiată de un punct (coordonatele anunțului), pe segmentele dintre punctele străzii; null peste maxKm
  var GC = 0.004;
  function grid(I) {
    if (I.grid) return I.grid;
    var g = {};
    function put(cx, cy, v) { var k = cx + ',' + cy; (g[k] = g[k] || []).push(v); }
    I.s.forEach(function (s) {
      if (!TYPE[s.type]) return; // autostrăzi, poduri, intrări de metrou: nu sunt adrese
      var p = s.p, segs = [];
      for (var j = 0; j < p.length; j++) { if (j + 1 < p.length && dkm(p[j], p[j + 1]) < 1.2) segs.push([p[j], p[j + 1]]); else segs.push([p[j], p[j]]); }
      segs.forEach(function (sg) {
        var x0 = Math.floor(Math.min(sg[0][0], sg[1][0]) / GC), x1 = Math.floor(Math.max(sg[0][0], sg[1][0]) / GC), y0 = Math.floor(Math.min(sg[0][1], sg[1][1]) / GC), y1 = Math.floor(Math.max(sg[0][1], sg[1][1]) / GC);
        for (var cx = x0; cx <= x1; cx++) for (var cy = y0; cy <= y1; cy++) put(cx, cy, [s.i, sg[0], sg[1]]);
      });
    });
    return (I.grid = g);
  }
  function segKm(q, a, b) {
    var ax = (a[0] - q[0]) * 79.4, ay = (a[1] - q[1]) * 111.2, bx = (b[0] - q[0]) * 79.4, by = (b[1] - q[1]) * 111.2, dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    var t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0, x = ax + t * dx, y = ay + t * dy; return Math.sqrt(x * x + y * y);
  }
  function nearest(I, ll, maxKm) {
    var g = grid(I), cx = Math.floor(ll[0] / GC), cy = Math.floor(ll[1] / GC), best = null, bd = maxKm || 0.12;
    for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++) (g[(cx + i) + ',' + (cy + j)] || []).forEach(function (v) { var dd = segKm(ll, v[1], v[2]); if (dd < bd) { bd = dd; best = v[0]; } });
    return best == null ? null : { s: I.s[best], km: bd };
  }
  // poziția unui anunț: coordonatele lui (dacă le are și sunt exacte) → strada cea mai apropiată; altfel din text
  function locateAd(I, a, zona, addr, key) {
    var la = +a.lat, lo = +a.lon;
    if (la && lo && !(+a.rad > 0.3)) {
      var nb = nearest(I, [lo, la], 0.12);
      if (nb) return { kind: 'adresa', ll: [lo, la], label: nb.s.nm, loc: nb.s.loc, sc: 5, si: nb.s.i, nm: nb.s.nm, src: 'coord' };
    }
    return locate(I, adTexts(a), zona, addr, key);
  }
  // textele unui anunț, în ordinea încrederii: strada/numărul/reperul colectate, apoi titlul și descrierea, zona declarată, linkul
  var TYPEW = /^(str|strada|bd|b-dul|bdul|bulevardul|sos|șos|soseaua|șoseaua|calea|cal|al|aleea|intr|intrarea|spl|splaiul|piata|piața|p-ta|p-ța|drumul|prel|prelungirea|fundatura|fundătura)\b/i;
  function adTexts(a) {
    var st = a.strada ? (TYPEW.test(String(a.strada).trim()) ? a.strada : 'Strada ' + a.strada) + (a.nr ? ' nr ' + a.nr : '') : '';
    return [[st, a.reper].filter(Boolean).join(' · '), [a.titlu, a.rezumat, a.adresa].filter(Boolean).join(' · '), a.zonaText, (a.link || '').replace(/^https?:\/\/[^\/]+/, '').replace(/[?#].*$/, '').replace(/[-_\/.]+/g, ' ')];
  }
  root.NV_GEO = { build: build, locate: locate, norm: norm, zoneLoc: zoneLoc, dkm: dkm, adTexts: adTexts, nearest: nearest, locateAd: locateAd };
})(typeof window !== 'undefined' ? window : globalThis);
