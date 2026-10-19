/* Novaria CMA — motor de evaluare (funcții pure, fără DOM).
   Metodă: comparație directă cu grilă de ajustări, ponderare după similaritate, eliminare outlieri,
   reconciliere cu benchmark-ul zonal, discount anunț → vânzare, calibrare pe vânzările reale ale agentului.
   Ținta principală: prețul realist de vânzare în 3–6 luni. */
var CMA = (function () {
  'use strict';

  var OPT = {
    tip: [['apartament', 'Apartament'], ['casa', 'Casă / vilă'], ['teren', 'Teren']],
    stareApt: [
      ['gri', 'La gri (dezvoltator)', -230],
      ['renovare', 'De renovat complet', -260],
      ['imbunatatiri', 'Necesită îmbunătățiri', -110],
      ['locuibil', 'Bună, locuibilă', 0],
      ['renovat', 'Renovată recent / finisaje bune', 110],
      ['premium', 'Finisaje premium / lux', 260]
    ],
    stareCasa: [
      ['rosu', 'La roșu', -560],
      ['gri', 'La gri', -300],
      ['renovare', 'De renovat complet', -320],
      ['imbunatatiri', 'Necesită îmbunătățiri', -130],
      ['locuibil', 'Bună, locuibilă', 0],
      ['renovat', 'Renovată / finisaje bune', 120],
      ['premium', 'Finisaje premium / lux', 280]
    ],
    compart: [['decomandat', 'Decomandat', 1.00], ['semidecomandat', 'Semidecomandat', 0.97], ['nedecomandat', 'Nedecomandat', 0.93], ['circular', 'Circular', 0.92]],
    incalzire: [['centrala', 'Centrală proprie', 1.00], ['termoficare', 'Termoficare (RADET)', 0.97], ['pompa', 'Pompă de căldură / pardoseală', 1.02], ['fara', 'Fără încălzire / sobe', 0.90]],
    seismic: [['nu', 'Neîncadrat', 1.00], ['consolidat', 'Consolidat', 0.98], ['rs3', 'Clasa RsIII', 0.97], ['neexpertizat', 'Neexpertizat', 0.95], ['rs2', 'Clasa RsII', 0.86], ['rs1', 'RsI — bulină roșie', 0.62]],
    vedere: [['zgomot', 'Bulevard / zgomot', 0.96], ['normal', 'Normală', 1.00], ['liniste', 'Interior, liniștit', 1.01], ['parc', 'Parc / lac', 1.03], ['panoramic', 'Panoramică', 1.02]],
    metrou: [['', 'Nu contează', 1.00], ['5', 'Sub 5 min pe jos', 1.04], ['10', '5–10 min', 1.02], ['20', '10–20 min', 1.00], ['30', 'Peste 20 min', 0.97]],
    balcon: [['nu', 'Fără balcon', 0.97], ['da', 'Balcon', 1.00], ['terasa', 'Terasă / balcoane multiple', 1.02]],
    parcareTip: [['exterior', 'Suprateran / exterior'], ['subteran', 'Subteran'], ['garaj', 'Garaj / box închis']],
    juridic: [['ok', 'Intabulat, fără probleme', 1.00], ['probleme', 'Probleme (succesiune, sarcini, neintabulat)', 0.88]],
    tipCasa: [['individuala', 'Individuală', 1.00], ['duplex', 'Duplex', 0.93], ['insiruita', 'Înșiruită', 0.88], ['curte-comuna', 'Curte comună', 0.85]],
    structura: [['caramida', 'Cărămidă / beton', 1.00], ['bca', 'BCA', 0.96], ['lemn', 'Lemn / prefabricat', 0.90], ['chirpici', 'Chirpici / paiantă', 0.65]],
    regim: [['P', 'Parter', 1.02], ['P+M', 'P+M', 1.00], ['P+1', 'P+1', 1.00], ['P+1+M', 'P+1+M', 0.98], ['P+2', 'P+2 sau mai mult', 0.96]],
    acces: [['asfalt', 'Asfalt', 1.00], ['pietruit', 'Pietruit', 0.95], ['pamant', 'Pământ', 0.88]],
    destinatie: [['casa', 'Locuințe individuale', 1.00], ['comercial', 'Comercial / mixt', 1.30], ['colectiv', 'Blocuri (CUT > 1,5)', 1.60]],
    status: [['activ', 'Anunț activ'], ['vandut', 'Vândut (preț real)'], ['retras', 'Expirat / retras']],
    sursa: [['imobiliare', 'Imobiliare.ro'], ['storia', 'Storia'], ['olx', 'OLX'], ['publi24', 'Publi24'], ['tranzactie', 'Tranzacție proprie'], ['altul', 'Altă sursă'], ['exemplu', 'Exemplu']],
    locRel: [[-2, 'Mult mai slabă'], [-1, 'Puțin mai slabă'], [0, 'Similară'], [1, 'Puțin mai bună'], [2, 'Mult mai bună']]
  };
  function optMap(list) { var m = {}; list.forEach(function (o) { m[o[0]] = o; }); return m; }
  var M = {}; Object.keys(OPT).forEach(function (k) { M[k] = optMap(OPT[k]); });

  // Factori reglabili de utilizator (Setări → „Cât contează fiecare factor")
  var TUNE_DEFAULT = {
    'floor.parterVechi': 0.93, 'floor.parterNou': 0.96, 'floor.ultimVechi': 0.95, 'floor.ultimNou': 0.99, 'floor.penthouse': 1.06,
    'floor.faraLift4': 0.93, 'floor.faraLift3': 0.98, 'floor.demisol': 0.82, 'floor.mansarda': 0.92,
    'misc.mobilat': 1.01, 'misc.anvelopat': 1.02,
    'park.extBuc': 4000, 'park.subBuc': 10000, 'park.garajBuc': 8000, 'park.extIlf': 2000, 'park.subIlf': 5000, 'park.garajIlf': 4000, 'park.boxa': 1500, 'casa.garaj': 5000
  };
  var CUR = {};
  function T(id) { return CUR[id] != null ? CUR[id] : TUNE_DEFAULT[id]; }
  function fac(list, key, dflt) { var c = CUR[list + '.' + key]; if (c != null) return c; var o = M[list][key]; return o ? o[2] : (dflt == null ? 1 : dflt); }
  function lbl(list, key) { var o = M[list][key]; return o ? o[1] : ''; }

  var DEFAULT_PARAMS = {
    benchDisc: 0.12,    // media prețurilor cerute în zonă → preț de vânzare (include anunțurile supraevaluate care nu se vând)
    negDisc: 0.08,      // un anunț comparabil activ → preț de vânzare
    staleDays: 90, staleExtra: 0.05, retrasDisc: 0.10,
    driftLunar: 0.004,
    benchWeight: 1.2, useBench: true,
    quickPct: 0.07,     // vânzare rapidă sub prețul realist
    listPct: 0.06,      // marja de listare peste prețul realist
    liqRidicata: 0.0, liqMedie: 0.02, liqScazuta: 0.05,  // corecție pentru vânzare în 3–6 luni după lichiditate
    calib: null          // {buc:{f,n}, ilf:{f,n}} — din vânzările reale
  };
  var LIQ = {
    'ridicată': { key: 'liqRidicata', dQuick: 'sub 4 săptămâni', dReal: '1–3 luni', dList: '2–4 luni' },
    'medie': { key: 'liqMedie', dQuick: 'sub 6 săptămâni', dReal: '2–4 luni', dList: '3–6 luni' },
    'scăzută': { key: 'liqScazuta', dQuick: '1–2 luni', dReal: '3–6 luni', dList: '6+ luni' }
  };
  var LIQ_ORDER = ['ridicată', 'medie', 'scăzută'];

  function num(v) { if (v === '' || v == null) return null; var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : null; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function known(v) { return !(v === '' || v == null || v === 'necunoscut'); }

  function eraT(an) {
    an = num(an); if (an == null) return null;
    if (an <= 1940) return -0.15; if (an <= 1977) return -0.25; if (an <= 1990) return 0; if (an <= 2005) return 0.35;
    if (an <= 2014) return 0.6; if (an <= 2020) return 0.88; return 1.0;
  }
  function eraLabel(an) {
    an = num(an); if (an == null) return 'an necunoscut';
    if (an <= 1940) return 'interbelic'; if (an <= 1977) return 'dinainte de 1977'; if (an <= 1990) return '1978–1990';
    if (an <= 2005) return '1991–2005'; if (an <= 2014) return '2006–2014'; if (an <= 2020) return '2015–2020'; return '2021+';
  }
  function eraCasa(an) { an = num(an); if (an == null) return null; if (an <= 1990) return 0.78; if (an <= 2005) return 0.86; if (an <= 2014) return 0.93; if (an <= 2020) return 0.97; return 1.0; }
  function isNewBlock(an) { var t = eraT(an); return t != null && t >= 0.6; }

  function parseEtaj(e) {
    if (e === '' || e == null) return null;
    var s = String(e).trim().toUpperCase();
    if (s === 'D' || s === 'S' || s === 'DEMISOL') return -1;
    if (s === 'P' || s === 'PARTER' || s === '0') return 0;
    if (s === 'M' || s === 'MANSARDA' || s === 'MANSARDĂ') return 'M';
    var n = parseInt(s, 10); return isFinite(n) ? n : null;
  }
  function floorFactor(p, an) {
    var e = parseEtaj(p.etaj); if (e == null) return null;
    var tot = num(p.etajeTotal); var nou = (num(an) || 1980) >= 2006;
    var lift = p.lift === 'da' ? true : p.lift === 'nu' ? false : (nou ? true : (tot != null ? tot > 4 : true));
    if (e === 'M') return T('floor.mansarda');
    if (e === -1) return T('floor.demisol');
    if (e === 0) return nou ? T('floor.parterNou') : T('floor.parterVechi');
    var f = 1.0;
    if (tot != null && e >= tot && tot >= 3) f = p.penthouse ? T('floor.penthouse') : (nou ? T('floor.ultimNou') : T('floor.ultimVechi'));
    if (!lift) { if (e >= 4) f *= T('floor.faraLift4'); else if (e === 3) f *= T('floor.faraLift3'); }
    return f;
  }
  function floorLabel(p) {
    var e = parseEtaj(p.etaj); if (e == null) return 'etaj necunoscut';
    var t = num(p.etajeTotal);
    var s = e === -1 ? 'demisol' : e === 0 ? 'parter' : e === 'M' ? 'mansardă' : 'etaj ' + e;
    return t ? s + '/' + t : s;
  }
  function sizeFactor(mp, ref, el) { mp = num(mp); if (!mp) return 1; return Math.pow(mp / ref, el == null ? -0.10 : el); }

  function zoneById(zones, id) { for (var i = 0; i < zones.length; i++) if (zones[i].id === id) return zones[i]; return null; }
  function zoneEff(z, overrides) {
    if (!z) return null;
    var o = (overrides && overrides[z.id]) || {};
    var r = {}; for (var k in z) r[k] = z[k];
    ['apt_vechi', 'apt_nou', 'casa', 'teren', 'lichiditate'].forEach(function (k) { if (o[k] != null && o[k] !== '') r[k] = k === 'lichiditate' ? o[k] : num(o[k]); });
    return r;
  }
  function zoneRatio(z) { if (z && z.apt_vechi && z.apt_nou) return clamp(z.apt_nou / z.apt_vechi, 1.05, 1.8); return 1.32; }
  function aptBase(z, t) {
    if (!z) return null; var r = zoneRatio(z); if (t == null) t = 0.3;
    if (z.apt_vechi) return z.apt_vechi * Math.pow(r, t);
    if (z.apt_nou) return z.apt_nou * Math.pow(r, t - 0.95);
    return null;
  }
  function isIlfov(z) { return !!(z && /ilfov/i.test(z.grup || '')); }

  // Parcare: număr de locuri × tip. Compatibil cu formatul vechi (parcare: exterior/subteran/dublu/fara)
  function parkInfo(p) {
    var n = num(p.parcareNr), t = p.parcareTip;
    if (n == null && known(p.parcare)) { n = p.parcare === 'fara' ? 0 : p.parcare === 'dublu' ? 2 : 1; t = p.parcare === 'exterior' ? 'exterior' : 'subteran'; }
    return { n: n, t: t || 'exterior' };
  }
  function parkUnit(t, ilf) {
    if (t === 'subteran') return T(ilf ? 'park.subIlf' : 'park.subBuc');
    if (t === 'garaj') return T(ilf ? 'park.garajIlf' : 'park.garajBuc');
    return T(ilf ? 'park.extIlf' : 'park.extBuc');
  }
  function extrasValue(p, tip, ilf) {
    var v = 0;
    if (tip === 'apartament') {
      var pk = parkInfo(p); if (pk.n) v += pk.n * parkUnit(pk.t, ilf);
      if (p.boxa === true || p.boxa === 'da') v += T('park.boxa');
    } else if (tip === 'casa') { if (p.garaj === true || p.garaj === 'da') v += T('casa.garaj'); }
    return v;
  }
  function extrasKnown(p, tip) {
    if (tip === 'apartament') { var pk = parkInfo(p); return pk.n != null; }
    return true;
  }

  function subjectFactors(s, z) {
    var out = [];
    function push(key, label, f, detail) { if (f != null && Math.abs(f - 1) > 0.0005) out.push({ key: key, label: label, f: f, detail: detail || '' }); }
    if (s.tip === 'apartament') {
      var tt = eraT(s.an);
      push('etaj', 'Etaj', floorFactor(s, s.an), floorLabel(s));
      if (known(s.compart) && num(s.camere) !== 1) push('compart', 'Compartimentare', fac('compart', s.compart) / 0.985, lbl('compart', s.compart));
      if (known(s.incalzire)) push('incalzire', 'Încălzire', fac('incalzire', s.incalzire) / (tt != null && tt >= 0.6 ? 1.0 : 0.985), lbl('incalzire', s.incalzire));
      if (known(s.seismic) && (tt == null || tt <= 0.35)) { var typ = (tt != null && tt < 0) ? 0.97 : 1.0; push('seismic', 'Risc seismic', fac('seismic', s.seismic) / typ, lbl('seismic', s.seismic)); }
      if (known(s.vedere)) push('vedere', 'Expunere / vedere', fac('vedere', s.vedere), lbl('vedere', s.vedere));
      if (s.metrou && z && !isIlfov(z)) push('metrou', 'Distanță metrou', fac('metrou', s.metrou), lbl('metrou', s.metrou));
      if (known(s.balcon)) push('balcon', 'Balcon', fac('balcon', s.balcon), lbl('balcon', s.balcon));
      if (s.anvelopat && tt != null && tt <= 0.35) push('anvelopat', 'Bloc reabilitat termic', T('misc.anvelopat'), 'anvelopat');
      if (s.mobilat) push('mobilat', 'Mobilat și utilat', T('misc.mobilat'), 'inclus în preț');
      push('marime', 'Suprafață', sizeFactor(s.mp, 60), num(s.mp) + ' mp');
      if (num(s.camere) === 1 && num(s.mp) > 42) push('garsonieraMare', 'O cameră pe suprafață mare', 0.96, 'cumpărătorii o compară cu 2 camere');
    } else if (s.tip === 'casa') {
      push('vechime', 'Vechime', eraCasa(s.an), eraLabel(s.an));
      if (known(s.tipCasa)) push('tipCasa', 'Tip casă', fac('tipCasa', s.tipCasa), lbl('tipCasa', s.tipCasa));
      if (known(s.structura)) push('structura', 'Structură', fac('structura', s.structura), lbl('structura', s.structura));
      if (known(s.regim)) push('regim', 'Regim de înălțime', fac('regim', s.regim), lbl('regim', s.regim));
      if (known(s.incalzire)) push('incalzire', 'Încălzire', s.incalzire === 'pompa' ? 1.03 : s.incalzire === 'fara' ? 0.9 : 1.0, lbl('incalzire', s.incalzire));
      if (s.utilCanal === false) push('canal', 'Fără canalizare', 0.96, 'fosă / bazin');
      if (s.utilGaz === false) push('gaz', 'Fără gaze', 0.97, '');
      if (s.asfalt === false) push('asfalt', 'Stradă neasfaltată', 0.95, '');
      var fr = num(s.front); if (fr != null) push('front', 'Front stradal', fr < 10 ? 0.95 : fr > 15 ? 1.02 : 1.0, fr + ' m');
      if (s.mobilat) push('mobilat', 'Mobilată', T('misc.mobilat'), '');
      push('marime', 'Suprafață', sizeFactor(s.mp, 130, -0.10), num(s.mp) + ' mp utili');
    } else {
      push('intravilan', 'Încadrare', s.intravilan === false ? 0.25 : 1.0, s.intravilan === false ? 'extravilan' : 'intravilan');
      var u = ['utilApa', 'utilCanal', 'utilGaz', 'utilCurent'].filter(function (k) { return s[k] === true; }).length;
      push('utilitati', 'Utilități la limită', 0.94 + 0.03 * u, u + ' din 4');
      var fr2 = num(s.front); if (fr2 != null) push('front', 'Front stradal', fr2 < 12 ? 0.9 : fr2 > 20 ? 1.04 : 1.0, fr2 + ' m');
      if (known(s.acces)) push('acces', 'Acces', fac('acces', s.acces), lbl('acces', s.acces));
      if (s.forma === 'neregulat') push('forma', 'Formă neregulată', 0.92, '');
      if (known(s.destinatie)) push('destinatie', 'Potențial (PUZ / CUT)', fac('destinatie', s.destinatie), lbl('destinatie', s.destinatie));
      push('marime', 'Suprafață', Math.pow(clamp(num(s.mp) || 500, 100, 20000) / 500, -0.10), num(s.mp) + ' mp');
    }
    if (s.juridic === 'probleme') push('juridic', 'Situație juridică', 0.88, lbl('juridic', s.juridic));
    return out;
  }

  // Stare: aditiv €/mp; la blocurile noi finisajele de dezvoltator sunt deja în preț → efect înjumătățit
  function condAdd(tip, stare, an) {
    if (!known(stare)) return 0;
    var v = fac(tip === 'casa' ? 'stareCasa' : 'stareApt', stare, 0);
    if (tip === 'apartament' && isNewBlock(an) && stare !== 'gri') v *= 0.5;
    return v;
  }
  function condScale(basePpm) { return clamp(Math.sqrt((basePpm || 2000) / 2000), 0.8, 1.5); }

  function benchmark(s, z) {
    if (!z) return null;
    var tip = s.tip, base;
    if (tip === 'apartament') base = aptBase(z, eraT(s.an));
    else if (tip === 'casa') base = z.casa || (z.apt_nou ? z.apt_nou * 0.85 : null);
    else base = z.teren;
    if (!base) return null;
    var factors = subjectFactors(s, z);
    var mult = factors.reduce(function (a, f) { return a * f.f; }, 1);
    var add = tip === 'teren' ? 0 : condAdd(tip, s.stare, s.an) * condScale(base);
    var landAdj = 0;
    if (tip === 'casa') { var lot0 = isIlfov(z) ? 400 : 300, tr = num(s.teren), lp = z.teren || 0; if (tr != null && lp) landAdj = (tr - lot0) * lp * 0.65; }
    return { base: base, mult: mult, add: add, ppm: base * mult + add, landAdj: landAdj, factors: factors, condLabel: lbl(tip === 'casa' ? 'stareCasa' : 'stareApt', s.stare) };
  }

  function monthsBetween(ym, today) {
    var m = /^(\d{4})-(\d{1,2})/.exec(String(ym || '')); if (!m) return 0;
    var t = today || new Date();
    return Math.max(0, (t.getFullYear() - +m[1]) * 12 + (t.getMonth() + 1 - +m[2]));
  }

  function adjustComp(c, s, z, zones, overrides, P, today) {
    var adj = [], unknown = 0, checked = 0;
    var price = num(c.pret), mp = num(c.mp);
    if (!price || !mp) return { valid: false, reason: 'Lipsește prețul sau suprafața' };
    var tip = s.tip, ilf = isIlfov(z);
    var cz = c.zona ? zoneEff(zoneById(zones, c.zona), overrides) : null;
    var ts = eraT(s.an), tc = eraT(c.an);
    var baseS = tip === 'apartament' ? aptBase(z, ts) : tip === 'casa' ? (z && z.casa) : (z && z.teren);
    baseS = baseS || price / mp;

    var exS = extrasValue(s, tip, ilf);
    var exC = extrasKnown(c, tip) ? extrasValue(c, tip, ilf) : exS;
    var core = price - exC, ppm0 = core / mp, ppm = ppm0;
    if (Math.round(exC) !== Math.round(exS)) adj.push({ k: 'Parcare / boxă / garaj', v: exS - exC, mode: 'abs', note: 'valoare separată de €/mp' });
    function mul(label, f, note) { checked++; if (f == null) { unknown++; return; } if (Math.abs(f - 1) < 0.0005) return; ppm *= f; adj.push({ k: label, f: f, mode: 'mul', note: note || '' }); }

    var st = c.status || 'activ';
    if (st === 'activ') {
      var stale = (num(c.zile) || 0) > P.staleDays;
      var d = P.negDisc + (stale ? P.staleExtra : 0);
      ppm *= (1 - d); adj.push({ k: 'Negociere (cerut → vândut)', f: 1 - d, mode: 'mul', note: stale ? 'anunț vechi de ' + num(c.zile) + ' zile' : 'marjă medie de negociere' });
    } else if (st === 'retras') {
      ppm *= (1 - P.retrasDisc); adj.push({ k: 'Anunț expirat (nu s-a vândut)', f: 1 - P.retrasDisc, mode: 'mul', note: 'prețul era prea mare' });
    } else if (st === 'vandut' && c.data) {
      var m = monthsBetween(c.data, today);
      if (m > 0.5) { var ft = Math.pow(1 + P.driftLunar, m); ppm *= ft; adj.push({ k: 'Evoluția pieței', f: ft, mode: 'mul', note: Math.round(m) + ' luni de la vânzare' }); }
    }

    if (cz && z && cz.id !== z.id) {
      var tt = ts == null ? 0.3 : ts;
      var bz = tip === 'apartament' ? aptBase(z, tt) : tip === 'casa' ? z.casa : z.teren;
      var bc = tip === 'apartament' ? aptBase(cz, tt) : tip === 'casa' ? cz.casa : cz.teren;
      if (bz && bc) mul('Zonă (' + cz.nume + ' → ' + z.nume + ')', bz / bc, 'diferența de preț între zone');
    }
    if (num(c.locRel)) mul('Micro-locație', 1 - 0.04 * num(c.locRel), lbl('locRel', num(c.locRel)));

    if (tip === 'apartament') {
      var r = zoneRatio(z);
      mul('Vechime (' + eraLabel(c.an) + ' → ' + eraLabel(s.an) + ')', (ts != null && tc != null) ? Math.pow(r, ts - tc) : null);
      var fs = floorFactor(s, s.an), fc = floorFactor(c, known(c.an) ? c.an : s.an);
      mul('Etaj (' + floorLabel(c) + ' → ' + floorLabel(s) + ')', (fs != null && fc != null) ? fs / fc : null);
      if (num(s.camere) !== 1) mul('Compartimentare', (known(s.compart) && known(c.compart)) ? fac('compart', s.compart) / fac('compart', c.compart) : null);
      mul('Încălzire', (known(s.incalzire) && known(c.incalzire)) ? fac('incalzire', s.incalzire) / fac('incalzire', c.incalzire) : null);
      if (known(c.seismic) && known(s.seismic)) mul('Risc seismic', fac('seismic', s.seismic) / fac('seismic', c.seismic));
      if (known(c.balcon) && known(s.balcon)) mul('Balcon', fac('balcon', s.balcon) / fac('balcon', c.balcon));
      mul('Suprafață (' + mp + ' → ' + num(s.mp) + ' mp)', sizeFactor(s.mp, 60) / sizeFactor(mp, 60));
    } else if (tip === 'casa') {
      var es = eraCasa(s.an), ec = eraCasa(c.an);
      mul('Vechime', (es != null && ec != null) ? es / ec : null, eraLabel(c.an) + ' → ' + eraLabel(s.an));
      if (known(c.tipCasa) && known(s.tipCasa)) mul('Tip casă', fac('tipCasa', s.tipCasa) / fac('tipCasa', c.tipCasa));
      if (known(c.structura) && known(s.structura)) mul('Structură', fac('structura', s.structura) / fac('structura', c.structura));
      mul('Suprafață (' + mp + ' → ' + num(s.mp) + ' mp)', sizeFactor(s.mp, 130, -0.10) / sizeFactor(mp, 130, -0.10));
      var tS = num(s.teren), tC = num(c.teren), lp = (z && z.teren) || 0;
      checked++;
      if (tS != null && tC != null && lp) { var la = (tS - tC) * lp * 0.65; if (Math.abs(la) > 1) { ppm += la / mp; adj.push({ k: 'Teren (' + tC + ' → ' + tS + ' mp)', v: la, mode: 'abs', note: Math.round(lp) + ' €/mp × 65%' }); } }
      else unknown++;
    } else {
      if (c.intravilan === false || s.intravilan === false) mul('Încadrare', (s.intravilan === false ? 0.25 : 1) / (c.intravilan === false ? 0.25 : 1));
      if (known(c.destinatie) && known(s.destinatie)) mul('Potențial (PUZ / CUT)', fac('destinatie', s.destinatie) / fac('destinatie', c.destinatie));
      mul('Suprafață (' + mp + ' → ' + num(s.mp) + ' mp)', Math.pow(clamp(num(s.mp) || mp, 100, 20000) / 500, -0.10) / Math.pow(clamp(mp, 100, 20000) / 500, -0.10));
    }

    if (tip !== 'teren') {
      checked++;
      if (known(s.stare) && known(c.stare)) {
        var dc = (condAdd(tip, s.stare, s.an) - condAdd(tip, c.stare, known(c.an) ? c.an : s.an)) * condScale(baseS);
        if (Math.abs(dc) > 0.5) { ppm += dc; adj.push({ k: 'Stare (' + lbl(tip === 'casa' ? 'stareCasa' : 'stareApt', c.stare) + ' → ' + lbl(tip === 'casa' ? 'stareCasa' : 'stareApt', s.stare) + ')', ppmDelta: dc, mode: 'add', note: Math.round(dc) + ' €/mp' }); }
      } else unknown++;
    }
    if (num(c.manual)) mul('Ajustare manuală', 1 + num(c.manual) / 100, c.nota || '');

    var gross = 0;
    adj.forEach(function (a) {
      if (/^(Negociere|Anunț expirat|Evoluția)/.test(a.k)) return;
      if (a.mode === 'mul') gross += Math.abs(Math.log(a.f));
      else if (a.mode === 'add') gross += Math.abs(a.ppmDelta) / ppm0;
      else if (a.mode === 'abs') gross += Math.abs(a.v) / core;
    });
    var completeness = checked ? 1 - unknown / checked : 1;
    var typeW = st === 'vandut' ? 1.6 : st === 'retras' ? 0.7 : 1.0;
    var w = typeW * (0.55 + 0.45 * completeness) / (1 + 10 * gross * gross);
    return { valid: true, ppm0: ppm0, ppm: ppm, net: ppm / ppm0 - 1, gross: gross, adj: adj, w: w, completeness: completeness, unknown: unknown, status: st };
  }

  function wMean(xs, ws) { var a = 0, b = 0; for (var i = 0; i < xs.length; i++) { a += xs[i] * ws[i]; b += ws[i]; } return b ? a / b : null; }
  function median(xs) { var s = xs.slice().sort(function (a, b) { return a - b; }); var n = s.length; if (!n) return null; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
  function roundTo(x, step) { return Math.round(x / step) * step; }
  function psych(x) { if (x < 30000) return Math.ceil(x / 500) * 500 - 100; if (x < 1000000) return Math.ceil(x / 1000) * 1000 - 100; return Math.ceil(x / 5000) * 5000; }

  function mergeParams(params) {
    var P = {}; for (var k in DEFAULT_PARAMS) P[k] = DEFAULT_PARAMS[k];
    if (params) for (var k2 in params) if (params[k2] != null && params[k2] !== '' && k2 !== 'tune') P[k2] = params[k2];
    return P;
  }

  function evaluate(s, comps, zones, overrides, params, today, opts) {
    var P = mergeParams(params);
    CUR = (params && params.tune) || {};
    today = today || new Date();
    var z = zoneEff(zoneById(zones, s.zona), overrides);
    var ilf = isIlfov(z);
    var mpS = num(s.mp);
    var res = { ok: false, zone: z, params: P, warnings: [], missing: [] };
    if (!mpS) { res.error = 'Completează suprafața proprietății.'; return res; }

    var bench = benchmark(s, z);
    res.bench = bench;
    var benchTx = bench ? bench.ppm * (1 - P.benchDisc) : null;
    res.benchTx = benchTx;

    var rows = (comps || []).map(function (c) { var r = c.exclus ? { valid: false, reason: 'Exclus manual', manualOut: true } : adjustComp(c, s, z, zones, overrides, P, today); r.id = c.id; return r; });
    var valid = rows.filter(function (r) { return r.valid; });
    if (valid.length >= 4) {
      var med = median(valid.map(function (r) { return r.ppm; }));
      var mad = median(valid.map(function (r) { return Math.abs(r.ppm - med); })) * 1.4826;
      var lim = Math.max(2.5 * mad, med * 0.12);
      valid.forEach(function (r) { if (Math.abs(r.ppm - med) > lim) { r.outlier = true; r.reason = 'Atipic: mult ' + (r.ppm > med ? 'peste' : 'sub') + ' celelalte comparabile'; } });
    }
    valid.forEach(function (r) { if (r.gross > 0.45) { r.outlier = true; r.reason = 'Prea diferit de proprietatea evaluată (ajustări ' + Math.round(r.gross * 100) + '%)'; } });
    var used = valid.filter(function (r) { return !r.outlier; });
    res.rows = rows;

    var compPpm = null, nEff = 0, cv = null, avgGross = null, cw = 0;
    if (used.length) {
      var xs = used.map(function (r) { return r.ppm; }), ws = used.map(function (r) { return r.w; });
      compPpm = wMean(xs, ws);
      cw = ws.reduce(function (a, b) { return a + b; }, 0);
      var sw2 = ws.reduce(function (a, b) { return a + b * b; }, 0);
      nEff = cw * cw / sw2;
      cv = used.length > 1 ? Math.sqrt(wMean(xs.map(function (x) { return (x - compPpm) * (x - compPpm); }), ws)) / compPpm : 0.1;
      avgGross = wMean(used.map(function (r) { return r.gross; }), ws);
    }
    res.compPpm = compPpm; res.nUsed = used.length; res.nEff = nEff; res.cv = cv; res.avgGross = avgGross;

    var bw = (P.useBench || used.length < 3) && benchTx ? (used.length >= 3 ? P.benchWeight : Math.max(P.benchWeight, 2)) : 0;
    var marketPpm;
    if (cw && bw) marketPpm = (compPpm * cw + benchTx * bw) / (cw + bw);
    else if (cw) marketPpm = compPpm;
    else if (benchTx) marketPpm = benchTx;
    else { res.error = 'Alege zona sau adaugă cel puțin un comparabil.'; return res; }
    res.benchShare = (cw + bw) ? bw / (cw + bw) : 1;
    used.forEach(function (r) { r.share = r.w / (cw + bw); });

    // Calibrare pe vânzările reale ale agentului
    var cal = P.calib && (opts && opts.noCalib ? null : (ilf ? P.calib.ilf : P.calib.buc) || P.calib.all);
    var calF = cal && cal.n ? cal.f : 1;
    res.calib = cal && cal.n ? { f: calF, n: cal.n, region: ilf ? 'Ilfov' : 'București' } : null;

    var extras = extrasValue(s, s.tip, ilf);
    var landAdj = 0;
    if (s.tip === 'casa' && bench) landAdj = bench.landAdj * res.benchShare;
    var market = (marketPpm * mpS + landAdj) * calF + extras;
    res.extras = extras; res.landAdj = landAdj; res.marketPpm = marketPpm; res.market = market;

    var liq = (z && z.lichiditate) || 'medie';
    var li = LIQ_ORDER.indexOf(liq); if (li < 0) li = 1;
    if (s.seismic === 'rs1' || s.seismic === 'rs2' || s.juridic === 'probleme' || parseEtaj(s.etaj) === -1 || (s.tip === 'teren' && s.intravilan === false)) li = Math.min(2, li + 1);
    liq = LIQ_ORDER[li]; var L = LIQ[liq];
    var liqAdj = P[L.key] || 0;
    var realist = market * (1 - liqAdj);
    res.liq = liq; res.liqAdj = liqAdj;

    var compl = completenessSubject(s);
    var agree = (compPpm && benchTx) ? Math.abs(compPpm - benchTx) / compPpm : null;
    var score;
    if (used.length) {
      score = 40 * Math.min(nEff / 5, 1) + 25 * Math.max(0, 1 - cv / 0.15) + 15 * Math.max(0, 1 - avgGross / 0.35) + 10 * compl + 10 * (agree == null ? 0.5 : Math.max(0, 1 - agree / 0.2));
    } else score = 12 + 13 * compl;
    if (res.calib && res.calib.n >= 3) score += 5;
    if (s.seismic === 'rs1') score = Math.min(score, 55);
    if (s.tip === 'teren' && s.intravilan === false) score = Math.min(score, 45);
    score = Math.round(clamp(score, 5, 98));
    var margin = 0.04 + (100 - score) * 0.0011;
    res.score = score; res.margin = margin; res.completeness = compl; res.agree = agree;
    res.scoreLabel = score >= 75 ? 'Ridicată' : score >= 50 ? 'Medie' : 'Scăzută';

    res.prices = {
      quick: roundTo(realist * (1 - P.quickPct), 500),
      realist: roundTo(realist, 500),
      list: psych(realist * (1 + P.listPct)),
      low: roundTo(realist * (1 - margin), 500),
      high: roundTo(realist * (1 + margin), 500),
      market: roundTo(market, 500),
      times: { quick: L.dQuick, realist: L.dReal, list: L.dList },
      quickPct: P.quickPct, listPct: P.listPct
    };
    res.prices.corect = res.prices.realist;
    res.ppm = { quick: res.prices.quick / mpS, realist: res.prices.realist / mpS, list: res.prices.list / mpS };
    res.ppm.corect = res.ppm.realist;

    res.drivers = [];
    if (bench) {
      bench.factors.forEach(function (f) { if (f.key === 'marime') return; res.drivers.push({ label: f.label, detail: f.detail, eur: realist * (1 - 1 / f.f) }); });
      if (bench.add) res.drivers.push({ label: 'Stare / finisaje', detail: bench.condLabel, eur: bench.add * mpS * (1 - P.benchDisc) });
      if (extras) res.drivers.push({ label: 'Parcare / boxă / garaj', detail: parkLabel(s), eur: extras });
      if (landAdj) res.drivers.push({ label: 'Teren față de lotul tipic', detail: num(s.teren) + ' mp', eur: landAdj });
      res.drivers.sort(function (a, b) { return Math.abs(b.eur) - Math.abs(a.eur); });
    }

    if (!z) res.warnings.push('Zona nu e aleasă: evaluarea se bazează doar pe comparabile.');
    if (!used.length) res.warnings.push('Fără comparabile: prețul vine doar din media zonei și poate greși cu ±10–15%. Adaugă 4–6 anunțuri similare sau vânzări reale.');
    else if (used.length < 3) res.warnings.push('Doar ' + used.length + ' comparabil(e) valid(e). Recomandat: minimum 4–6.');
    if (agree != null && agree > 0.15) res.warnings.push('Comparabilele diferă cu ' + Math.round(agree * 100) + '% de media zonei. Verifică dacă sunt reprezentative sau corectează prețul zonei în Setări.');
    if (cv != null && cv > 0.15 && used.length > 2) res.warnings.push('Comparabilele ajustate diferă mult între ele (±' + Math.round(cv * 100) + '%). Caută proprietăți mai apropiate de a ta.');
    if (s.tip === 'apartament' && num(s.an) && num(s.an) <= 1977 && !known(s.seismic)) res.warnings.push('Bloc construit înainte de 1977: verifică încadrarea seismică (lista AMCCRS). Bulina roșie scade valoarea cu 25–45%.');
    if (s.seismic === 'rs1') res.warnings.push('RsI (bulină roșie): fără credit ipotecar. Cumpărătorii sunt doar cash sau investitori.');
    if (s.juridic === 'probleme') res.warnings.push('Problemele juridice blochează creditul ipotecar până la rezolvare.');
    if (s.tip === 'apartament' && num(s.camere) === 1 && mpS > 42) res.warnings.push('O cameră pe ' + mpS + ' mp e atipic: cumpărătorii o compară și cu apartamentele de 2 camere.');

    res.missing = missingList(s, z);
    res.ok = true;
    return res;
  }

  function parkLabel(p) { var pk = parkInfo(p); if (!pk.n) return ''; return pk.n + ' ' + (pk.n > 1 ? 'locuri' : 'loc') + ' ' + lbl('parcareTip', pk.t).toLowerCase(); }

  // Calibrare: compară vânzările reale cu ce ar fi estimat modelul (fără calibrare) → factor pe regiune
  function calibrate(sales, zones, overrides, params, today) {
    var out = { rows: [] }, groups = { buc: [], ilf: [] };
    (sales || []).forEach(function (v) {
      var pret = num(v.pret); if (!pret || !num(v.mp) || !v.zona) { out.rows.push({ id: v.id, ok: false }); return; }
      var r = evaluate(v, [], zones, overrides, params, today, { noCalib: true });
      if (!r.ok) { out.rows.push({ id: v.id, ok: false }); return; }
      var model = r.market; // valoarea de piață a modelului, înainte de corecția de lichiditate
      var m = monthsBetween(v.data, today); var adjPret = pret * Math.pow(1 + mergeParams(params).driftLunar, m);
      var ratio = adjPret / model;
      var g = isIlfov(r.zone) ? 'ilf' : 'buc';
      groups[g].push(ratio);
      out.rows.push({ id: v.id, ok: true, model: model, real: pret, ratio: ratio, region: g });
    });
    function fac(rs) { if (!rs.length) return null; var md = median(rs); var n = rs.length; return { f: 1 + (md - 1) * n / (n + 1.5), n: n, raw: md }; }
    out.buc = fac(groups.buc); out.ilf = fac(groups.ilf); out.all = fac(groups.buc.concat(groups.ilf));
    return out;
  }

  function subjectFieldsFor(tip) {
    if (tip === 'apartament') return ['zona', 'mp', 'camere', 'etaj', 'etajeTotal', 'an', 'stare', 'compart', 'incalzire', 'balcon', 'parcareNr', 'juridic'];
    if (tip === 'casa') return ['zona', 'mp', 'teren', 'camere', 'an', 'stare', 'tipCasa', 'structura', 'regim', 'incalzire', 'front', 'juridic'];
    return ['zona', 'mp', 'front', 'acces', 'destinatie', 'juridic'];
  }
  function completenessSubject(s) { var f = subjectFieldsFor(s.tip), n = 0; f.forEach(function (k) { if (known(s[k])) n++; }); return n / f.length; }
  var FIELD_LABEL = { zona: 'zona', mp: 'suprafața', camere: 'numărul de camere', etaj: 'etajul', etajeTotal: 'numărul de etaje al blocului', an: 'anul construcției', stare: 'starea', compart: 'compartimentarea', incalzire: 'încălzirea', balcon: 'balconul', parcareNr: 'parcarea', juridic: 'situația juridică', teren: 'suprafața terenului', tipCasa: 'tipul casei', structura: 'structura', regim: 'regimul de înălțime', front: 'frontul stradal', acces: 'accesul', destinatie: 'potențialul urbanistic' };
  function missingList(s, z) {
    var out = [];
    subjectFieldsFor(s.tip).forEach(function (k) { if (!known(s[k])) out.push('Lipsește ' + FIELD_LABEL[k] + '.'); });
    if (s.tip === 'apartament' && num(s.an) && num(s.an) <= 1990 && !known(s.seismic)) out.push('Lipsește încadrarea seismică.');
    if (s.tip === 'apartament') out.push('Documente: extras CF, certificat energetic, adeverință de la asociație.');
    if (s.tip === 'casa') out.push('Documente: extras CF, autorizație de construire + proces verbal de recepție, certificat energetic.');
    if (s.tip === 'teren') out.push('Documente: certificat de urbanism (POT / CUT / regim de înălțime), extras CF, plan cadastral.');
    return out;
  }

  function parseListingText(t) {
    var o = {}; if (!t) return o;
    var s = t.replace(/ /g, ' ');
    var mP = s.match(/(\d{1,3}(?:[.\s]\d{3})+|\d{4,7})\s*(?:€|eur|euro)/i) || s.match(/(?:€|eur)\s*(\d{1,3}(?:[.\s]\d{3})+|\d{4,7})/i);
    if (mP) o.pret = parseInt(mP[1].replace(/[.\s]/g, ''), 10);
    var mM = s.match(/(?:suprafa[țt][ăa]\s*util[ăa][^\d]{0,20})(\d{2,4}(?:[.,]\d{1,2})?)/i) || s.match(/(\d{2,4}(?:[.,]\d{1,2})?)\s*(?:mp\b|m²|m2\b)/i);
    if (mM) o.mp = parseFloat(mM[1].replace(',', '.'));
    var mE = s.match(/etaj(?:ul)?\s*:?\s*(parter|demisol|mansard[ăa]|\d{1,2})\s*(?:\/|din)\s*(\d{1,2})/i) || s.match(/etaj(?:ul)?\s*:?\s*(parter|demisol|mansard[ăa]|\d{1,2})/i);
    if (mE) { var e = mE[1].toLowerCase(); o.etaj = e.indexOf('parter') === 0 ? 'P' : e.indexOf('demisol') === 0 ? 'D' : e.indexOf('mansard') === 0 ? 'M' : e; if (mE[2]) o.etajeTotal = parseInt(mE[2], 10); }
    var mA = s.match(/an(?:ul)?\s*(?:de\s*)?construc[țt]i(?:e|ei)?\s*:?\s*(\d{4})/i) || s.match(/(?:construit|bloc)\s*(?:în|in)?\s*(19\d{2}|20\d{2})/i);
    if (mA) o.an = parseInt(mA[1], 10);
    var mC = s.match(/(\d)\s*camer/i); if (mC) o.camere = parseInt(mC[1], 10); else if (/garsonier/i.test(s)) o.camere = 1;
    if (/semidecomandat/i.test(s)) o.compart = 'semidecomandat'; else if (/nedecomandat/i.test(s)) o.compart = 'nedecomandat'; else if (/decomandat/i.test(s)) o.compart = 'decomandat'; else if (/circular/i.test(s)) o.compart = 'circular';
    if (/central[ăa]\s*(proprie|termic)/i.test(s)) o.incalzire = 'centrala'; else if (/termoficare|radet/i.test(s)) o.incalzire = 'termoficare';
    if (/de renovat|necesit[ăa] renovare|nerenovat/i.test(s)) o.stare = 'renovare'; else if (/lux|premium/i.test(s)) o.stare = 'premium'; else if (/renovat/i.test(s)) o.stare = 'renovat';
    var mPk = s.match(/(\d)\s*locuri de parcare/i); if (mPk) o.parcareNr = parseInt(mPk[1], 10); else if (/loc de parcare/i.test(s)) o.parcareNr = 1;
    if (o.parcareNr) o.parcareTip = /subteran/i.test(s) ? 'subteran' : 'exterior';
    var mT = s.match(/teren\s*:?\s*(\d{2,5})\s*(?:mp|m²|m2)/i); if (mT) o.teren = parseInt(mT[1], 10);
    if (/olx\.ro/i.test(s)) o.sursa = 'olx'; else if (/storia\.ro/i.test(s)) o.sursa = 'storia'; else if (/imobiliare\.ro/i.test(s)) o.sursa = 'imobiliare'; else if (/publi24/i.test(s)) o.sursa = 'publi24';
    var mL = s.match(/https?:\/\/[^\s"']+/); if (mL) o.link = mL[0];
    return o;
  }

  return {
    OPT: OPT, M: M, lbl: lbl, fac: fac, DEFAULT_PARAMS: DEFAULT_PARAMS, TUNE_DEFAULT: TUNE_DEFAULT, LIQ: LIQ,
    evaluate: evaluate, calibrate: calibrate, benchmark: benchmark, adjustComp: adjustComp, zoneEff: zoneEff, zoneById: zoneById, isIlfov: isIlfov,
    aptBase: aptBase, eraT: eraT, eraLabel: eraLabel, floorLabel: floorLabel, parseEtaj: parseEtaj, isNewBlock: isNewBlock, parkInfo: parkInfo, parkLabel: parkLabel,
    parseListingText: parseListingText, num: num, known: known, psych: psych
  };
})();
if (typeof module !== 'undefined') module.exports = CMA;
