// Ansambluri rezidențiale (proiecte) care au alte prețuri decât zona lor: Spazio Residence și Fortuna Scandinavia în
// Bragadiru, Cortina sau proiectele One în București etc. Un ansamblu are un nume, cuvintele după care îl recunoaștem în
// anunțuri și în adresă (aliasuri) și, opțional, zona. Diferența față de zonă vine din nota agentului (Setări) sau, când
// nu e notat, din anunțurile care pomenesc ansamblul (minimum 4), comparate cu anunțurile din aceeași zonă.
// Folosit identic de aplicația internă și de exportul pentru evaluatorul public.
(function (root) {
  var SEED = [
    { id: 'spazio-residence', nume: 'Spazio Residence', zona: 'bragadiru', alias: ['spazio'] },
    { id: 'fortuna-scandinavia', nume: 'Fortuna Scandinavia', zona: 'bragadiru', alias: ['fortuna scandinavia', 'fortuna residence', 'fortuna'] },
    { id: 'cortina', nume: 'Cortina', zona: '', alias: ['cortina'] },
    { id: 'one-united', nume: 'One (One United Properties)', zona: '', alias: ['one floreasca', 'one herastrau', 'one cotroceni', 'one mircea eliade', 'one lake', 'one peninsula', 'one verdi', 'one high district', 'one modrogan', 'one charles', 'one residence', 'one city', 'one park', 'one tower'] }
  ];
  var MIN_N = 4, CAP_LO = -30, CAP_HI = 40;

  function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function num(v) { if (v === '' || v == null) return null; var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; }
  function median(xs) { var s = xs.slice().sort(function (a, b) { return a - b; }), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; }
  function slug(t) { return norm(t).replace(/ /g, '-').slice(0, 60) || 'ansamblu'; }

  // registrul efectiv: lista de bază + ce a adăugat sau a schimbat agentul. man = { id: { nume, zona, alias, pct, sters } }
  function registry(man) {
    man = man || {}; var out = [], seen = {};
    SEED.forEach(function (e) { var m = man[e.id] || {}; seen[e.id] = 1; if (m.sters) return; out.push({ id: e.id, nume: m.nume || e.nume, zona: m.zona != null ? m.zona : e.zona, alias: (m.alias && m.alias.length ? m.alias : e.alias).slice(), pct: num(m.pct), seed: true }); });
    Object.keys(man).forEach(function (id) { if (seen[id]) return; var m = man[id] || {}; if (m.sters || !m.nume) return; var al = (m.alias && m.alias.length ? m.alias : [m.nume]); out.push({ id: id, nume: m.nume, zona: m.zona || '', alias: al.slice(), pct: num(m.pct), seed: false }); });
    out.forEach(function (e) { e._al = e.alias.map(norm).filter(Boolean).sort(function (a, b) { return b.length - a.length; }); });
    return out;
  }
  // ansamblul pomenit într-un text (titlu, adresă), în zona dată (ansamblurile fără zonă se recunosc oriunde)
  function match(reg, text, zona) {
    var t = ' ' + norm(text) + ' ', best = null, bl = 0;
    if (t.length < 3) return null;
    (reg || []).forEach(function (e) {
      if (e.zona && zona && e.zona !== zona) return;
      for (var i = 0; i < e._al.length; i++) { var a = e._al[i]; if (a.length > bl && t.indexOf(' ' + a + ' ') >= 0) { best = e; bl = a.length; break; } }
    });
    return best;
  }
  // statistici din anunțuri: listings = [{ zona, tip, pret, mp, text }]. Pentru fiecare ansamblu și tip: câte anunțuri îl
  // pomenesc și cu cât e mediana lor pe mp față de mediana zonei lor (același tip), fiecare anunț față de zona lui
  function stats(reg, listings) {
    var zm = {}, by = {}, out = {};
    (listings || []).forEach(function (a) { var p = num(a.pret), m = num(a.mp); if (!p || !m || m < 15 || !a.zona || !a.tip) return; var k = a.zona + '|' + a.tip; (by[k] = by[k] || []).push(p / m); });
    Object.keys(by).forEach(function (k) { if (by[k].length >= 8) zm[k] = median(by[k]); });
    (listings || []).forEach(function (a) {
      var p = num(a.pret), m = num(a.mp); if (!p || !m || m < 15 || !a.zona || !a.tip) return;
      var e = match(reg, a.text, a.zona); if (!e) return; var z = zm[a.zona + '|' + a.tip]; if (!z) return;
      var o = (out[e.id] = out[e.id] || {}), s = (o[a.tip] = o[a.tip] || { r: [], n: 0 }); s.r.push(p / m / z); s.n++;
    });
    Object.keys(out).forEach(function (id) { Object.keys(out[id]).forEach(function (tip) { var s = out[id][tip]; s.rel = median(s.r) - 1; delete s.r; }); });
    return out;
  }
  // diferența față de zonă pentru proprietatea evaluată: nota agentului sau, altfel, anunțurile (minimum MIN_N)
  function factor(e, st, tip) {
    if (!e) return null;
    if (e.pct != null) return { pct: e.pct, src: 'nota' };
    var s = st && st[e.id] && (st[e.id][tip] || (tip === 'casa' ? null : null));
    if (s && s.n >= MIN_N && s.rel != null) { var p = Math.round(Math.max(CAP_LO, Math.min(CAP_HI, s.rel * 100))); return Math.abs(p) >= 1 ? { pct: p, src: 'anunturi', n: s.n } : null; }
    return null;
  }

  root.NV_ANS = { SEED: SEED, MIN_N: MIN_N, norm: norm, slug: slug, registry: registry, match: match, stats: stats, factor: factor };
})(typeof window !== 'undefined' ? window : globalThis);
