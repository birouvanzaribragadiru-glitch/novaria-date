/* Novaria Evaluator — formularul public de pe novaria.ro.
   Intervalul de preț apare imediat; raportul detaliat se deschide după ce vizitatorul lasă un număr de telefon.
   Calculul: același motor ca în aplicația internă Novaria (engine.js), pe valorile de zonă actualizate zilnic
   din anunțurile monitorizate (doar cifre agregate pe zone), plus factorul străzii față de media zonei,
   calculat automat din anunțurile de pe stradă și din jur. */
(function () {
  'use strict';
  var E = window.CMA, ZC = window.NV_ZCOMBO;
  var root = document.getElementById('novaria-ev');
  if (!root || !E) return;
  var CFG = window.NV_EVAL_CFG || {};
  try { var dc = root.getAttribute('data-cfg'); if (dc) CFG = Object.assign({}, CFG, JSON.parse(dc)); } catch (e) { }
  var shownAt = Date.now();

  // ---------- utilitare ----------
  function $(s, el) { return (el || root).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || root).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n0(x) { return x == null || !isFinite(x) ? '—' : Math.round(x).toLocaleString('ro-RO'); }
  function eur(x) { return n0(x) + ' €'; }
  function deN(n, w) { n = Math.round(n); var r = n % 100; return n0(n) + (n > 0 && (r >= 20 || r === 0) ? ' de ' : ' ') + w; }
  function round(x, step) { return Math.round(x / step) * step; }
  function num(v) { return E.num(v); }
  function anunturi(n) { n = Math.round(n); return n === 1 ? 'un anunț' : deN(n, 'anunțuri'); }
  function dkm(a, b) { var dx = (a[0] - b[0]) * 79.4, dy = (a[1] - b[1]) * 111.2; return Math.sqrt(dx * dx + dy * dy); }
  function track(name, params) { try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); else if (Array.isArray(window.dataLayer)) window.dataLayer.push(Object.assign({ event: name }, params || {})); } catch (e) { } }
  var MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  function dateRo(iso) { var d = new Date(iso); return isFinite(d) ? d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() : ''; }
  function opts(list, sel) { return list.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(sel) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join(''); }

  // ---------- opțiunile formularului ----------
  var AN_APT = [['', 'Nu știu'], ['1935', 'Interbelic (înainte de 1945)'], ['1968', '1945–1977'], ['1984', '1978–1990'], ['1998', '1991–2005'], ['2010', '2006–2014'], ['2018', '2015–2020'], ['2023', '2021 sau mai nou']];
  var AN_CASA = [['', 'Nu știu'], ['1975', 'Înainte de 1990'], ['1998', '1991–2005'], ['2010', '2006–2014'], ['2018', '2015–2020'], ['2023', '2021 sau mai nou']];
  var STARE_APT = [['', 'Alege starea'], ['renovare', 'De renovat complet'], ['imbunatatiri', 'Necesită îmbunătățiri'], ['locuibil', 'Bună, locuibilă'], ['renovat', 'Renovată recent / finisaje bune'], ['premium', 'Finisaje premium / lux'], ['gri', 'La gri (de la dezvoltator)']];
  var STARE_CASA = [['', 'Alege starea'], ['rosu', 'La roșu'], ['gri', 'La gri'], ['renovare', 'De renovat complet'], ['imbunatatiri', 'Necesită îmbunătățiri'], ['locuibil', 'Bună, locuibilă'], ['renovat', 'Renovată / finisaje bune'], ['premium', 'Finisaje premium / lux']];
  var ETAJ = [['', 'Alege'], ['D', 'Demisol'], ['P', 'Parter']].concat(Array.apply(null, Array(20)).map(function (_, i) { return [String(i + 1), String(i + 1)]; })).concat([['M', 'Mansardă']]);
  var ETAJE = [['', 'Nu știu']].concat(Array.apply(null, Array(25)).map(function (_, i) { return [String(i + 1), String(i + 1)]; }));
  var PARCARE = [['', 'Fără / nu știu'], ['1|exterior', '1 loc exterior'], ['1|subteran', '1 loc subteran'], ['1|garaj', 'Garaj / box închis'], ['2|exterior', '2 locuri exterioare'], ['2|subteran', '2 locuri subterane']];
  function engOpt(k, blank) { return [['', blank || 'Nu știu']].concat(E.OPT[k].map(function (o) { return [o[0], o[1]]; })); }
  var DA_NU = [['', 'Nu știu'], ['da', 'Da'], ['nu', 'Nu']];

  // ---------- starea ----------
  var S = { tip: 'apartament', f: {}, data: null, zones: [], zmap: {}, shown: false, unlocked: false, sending: false, res: null, sd: null, sdZ: {} };

  // ---------- date ----------
  function loadData() {
    function get(url) { return fetch(url, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) { if (!d || !Array.isArray(d.zone)) throw new Error('date'); return d; }); }
    return get(CFG.dataUrl).catch(function () { return get(CFG.ajaxUrl + '?action=novaria_ev_data'); }).catch(function () { return get(CFG.bundledUrl); });
  }
  function setData(d) {
    S.data = d;
    S.zones = d.zone.map(function (z) {
      var o = { id: z.id, nume: z.nume, grup: z.grup, alias: z.alias || [], lichiditate: z.lq || 'medie', st: z.st || {}, u: z.u || {} };
      if (z.sector) o.sector = z.sector; if (z.loc) o.loc = z.loc;
      ['apt_vechi', 'apt_nou', 'casa', 'teren'].forEach(function (k) { if (z.v && z.v[k]) o[k] = z.v[k]; });
      return o;
    });
    S.zmap = {}; S.zones.forEach(function (z) { S.zmap[z.id] = z; });
  }

  // ---------- străzile (lista din OpenStreetMap, încărcată doar când e nevoie) ----------
  function loadStreets() {
    if (!S.sdP && CFG.streetsUrl) S.sdP = fetch(CFG.streetsUrl, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { if (!d || !Array.isArray(d.s)) throw new Error('strazi'); S.sd = d; S.sdZ = {}; refreshStreets(); }, function () { S.sdErr = true; refreshStreets(); });
    return S.sdP;
  }
  // aceleași reguli ca la plasarea anunțurilor: la București pe o rază de 3,5 km de cartier, în Ilfov strada localității
  function streetsFor(zid) {
    var d = S.sd, z = S.zmap[zid]; if (!d || !z || !d.z[zid]) return [];
    if (S.sdZ[zid]) return S.sdZ[zid];
    var c = d.z[zid], ilf = !z.sector, out = [];
    d.s.forEach(function (r) { var dd = dkm([r[2], r[3]], c); if (ilf ? (r[1] === c[2] ? dd < 12 : dd < 2.5) : dd < 3.5) out.push(r); });
    return (S.sdZ[zid] = out);
  }
  function streetItems() {
    var d = S.sd; if (!d || !S.f.zona) return [];
    return streetsFor(S.f.zona).map(function (r) { return { v: r[0] + '|' + d.loc[r[1]], t: r[0], g: d.loc[r[1]], keys: [], mo: r[4] }; });
  }
  function refreshStreets() {
    var el = $('#nvev-strada'); if (!el || !el._zc) return;
    var cur = S.f.strada || '';
    if (S.sd && cur && cur.charAt(0) !== '~' && !streetItems().some(function (it) { return it.v === cur; })) { S.f.strada = ''; el.value = ''; }
    el._zc.setItems(streetItems());
    el._zc.input.placeholder = S.f.zona ? 'Scrie strada: ex. ' + (S.zmap[S.f.zona] && !S.zmap[S.f.zona].sector ? 'Safirului' : 'Fabricii') : 'Alege întâi zona';
  }
  function streetMetro(k) { var d = S.sd; if (!d || !k) return 0; var it = null; streetItems().some(function (x) { if (x.v === k) { it = x; return true; } return false; }); return it ? it.mo : 0; }
  // factorul străzii: procentul publicat × cât se aplică la tipul ales (0 unde anunțurile nu arată diferențe clare)
  function microFor(zid, tip, k) {
    var M = S.data && S.data.micro; if (!M || !M.z || !k || k.charAt(0) === '~') return null;
    // al 4-lea câmp = 1: strada e notată de agenție (se aplică la toate tipurile, nu doar unde anunțurile arată diferențe)
    var e = M.z[zid] && M.z[zid][k]; if (!e) return null;
    var man = e[3] === 1, sc = man ? 1 : ((M.scala && M.scala[tip]) || 0); if (!sc) return null;
    var f = e[0] / 100 * sc; if (Math.abs(f) < 0.005) return null;
    var pct = Math.round(f * 100), src = e[1] ? anunturi(e[1]) + ' de pe stradă' + (e[2] ? ' și ' + anunturi(e[2]) + ' din jur' : '') : anunturi(e[2]) + ' de pe străzile din jur';
    return { f: f, pct: pct, nm: k.split('|')[0], label: (pct > 0 ? '+' : '−') + Math.abs(pct) + '% față de media zonei, ' + (man ? 'după analiza Novaria a străzii' : 'din ' + src) };
  }

  // ---------- formular ----------
  function field(id, label, control, opt) {
    opt = opt || {};
    var lab = label.trim() ? '<label for="nvev-' + id + '">' + esc(label) + (opt.req ? ' <span class="nvev-req" aria-hidden="true">*</span>' : '') + (opt.hint ? ' <span class="nvev-hint">' + esc(opt.hint) + '</span>' : '') + '</label>' : '';
    return '<div class="nvev-f' + (opt.wide ? ' nvev-w' : '') + (opt.cls ? ' ' + opt.cls : '') + '" data-for="' + id + '">' + lab + control + '<div class="nvev-err" id="nvev-' + id + '-err" aria-live="polite"></div></div>';
  }
  function sel(id, list, extra) { return '<select class="nvev-inp" id="nvev-' + id + '" name="' + id + '"' + (extra || '') + '>' + opts(list, S.f[id] != null ? S.f[id] : '') + '</select>'; }
  function txt(id, ph, unit, extra) { var i = '<input class="nvev-inp' + (unit ? ' nvev-suf' : '') + '" id="nvev-' + id + '" name="' + id + '" type="text" inputmode="decimal" autocomplete="off" value="' + esc(S.f[id] || '') + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + (extra || '') + '>'; return unit ? '<div class="nvev-sufw">' + i + '<span>' + esc(unit) + '</span></div>' : i; }
  function chips(id, list, label) {
    return '<div class="nvev-chips" role="radiogroup" aria-label="' + esc(label) + '" id="nvev-' + id + '">' + list.map(function (o) { var on = String(S.f[id] || '') === String(o[0]); return '<button type="button" role="radio" class="nvev-chip" aria-checked="' + on + '" data-chip="' + id + '" data-v="' + esc(o[0]) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>';
  }
  function check(id, label) { return '<label class="nvev-ck"><input type="checkbox" name="' + id + '" id="nvev-' + id + '"' + (S.f[id] ? ' checked' : '') + '> <span>' + esc(label) + '</span></label>'; }
  function zoneSelect() {
    var groups = []; S.zones.forEach(function (z) { if (groups.indexOf(z.grup) < 0) groups.push(z.grup); });
    return '<select id="nvev-zona" name="zona" aria-label="Zona"><option value="">Alege zona</option>' + groups.map(function (g) { return '<optgroup label="' + esc(g.replace('București – ', '')) + '">' + S.zones.filter(function (z) { return z.grup === g; }).map(function (z) { return '<option value="' + esc(z.id) + '"' + (S.f.zona === z.id ? ' selected' : '') + '>' + esc(z.nume) + '</option>'; }).join('') + '</optgroup>'; }).join('') + '</select>';
  }
  function isBuc() { var z = S.zmap[S.f.zona]; return !!(z && z.sector); }

  function formHTML() {
    var t = S.tip, h = '';
    h += '<div class="nvev-tabs" role="tablist" aria-label="Ce vrei să evaluezi">' + [['apartament', 'Apartament'], ['casa', 'Casă / vilă'], ['teren', 'Teren']].map(function (o) { return '<button type="button" role="tab" class="nvev-tab" aria-selected="' + (t === o[0]) + '" data-tip="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>';
    h += '<div class="nvev-grid">';
    h += field('zona', 'Zona', zoneSelect(), { req: 1, wide: 1, hint: 'cartierul sau localitatea' });
    var sv = S.f.strada || '';
    h += field('strada', 'Strada', '<select id="nvev-strada" name="strada" aria-label="Strada"><option value=""></option>' + (sv ? '<option value="' + esc(sv) + '" selected>' + esc(sv.charAt(0) === '~' ? sv.slice(1) : sv.split('|')[0]) + '</option>' : '') + '</select>', { wide: 1, hint: 'opțional, unele străzi sunt mai căutate decât altele' });
    if (t === 'apartament') {
      h += field('mp', 'Suprafață utilă', txt('mp', 'ex. 55', 'mp'), { req: 1, hint: 'fără balcon' });
      h += field('mpBalcon', 'Balcon / terasă', txt('mpBalcon', 'ex. 5', 'mp'), { hint: 'separat, dacă are' });
      h += field('camere', 'Camere', chips('camere', [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5+']], 'Camere'));
      h += field('an', 'Anul construcției', sel('an', AN_APT));
      h += field('stare', 'Starea', sel('stare', STARE_APT));
      h += field('etaj', 'Etaj', sel('etaj', ETAJ));
      h += field('etajeTotal', 'Din câte etaje are blocul', sel('etajeTotal', ETAJE));
      h += field('parcare', 'Loc de parcare', sel('parcare', PARCARE));
    } else if (t === 'casa') {
      h += field('mp', 'Suprafață utilă', txt('mp', 'ex. 120', 'mp'), { req: 1 });
      h += field('teren', 'Teren', txt('teren', 'ex. 300', 'mp'));
      h += field('camere', 'Camere', chips('camere', [['2', '2'], ['3', '3'], ['4', '4'], ['5', '5+']], 'Camere'));
      h += field('an', 'Anul construcției', sel('an', AN_CASA));
      h += field('stare', 'Starea', sel('stare', STARE_CASA));
      h += field('tipCasa', 'Tipul casei', sel('tipCasa', engOpt('tipCasa', 'Alege')));
    } else {
      h += field('mp', 'Suprafața terenului', txt('mp', 'ex. 500', 'mp'), { req: 1 });
      h += field('intravilan', 'Încadrare', chips('intravilan', [['da', 'Intravilan'], ['nu', 'Extravilan']], 'Încadrare'));
      h += field('util', 'Utilități la limita terenului', '<div class="nvev-cks">' + check('utilCurent', 'Curent') + check('utilApa', 'Apă') + check('utilCanalT', 'Canalizare') + check('utilGazT', 'Gaz') + '</div>', { wide: 1 });
      h += field('front', 'Front stradal', txt('front', 'ex. 15', 'm'));
      h += field('acces', 'Drum de acces', sel('acces', engOpt('acces')));
    }
    h += '</div>';
    // detalii opționale
    var m = '';
    if (t === 'apartament') {
      m += field('compart', 'Compartimentare', sel('compart', engOpt('compart')));
      m += field('incalzire', 'Încălzire', sel('incalzire', engOpt('incalzire')));
      m += field('balcon', 'Tip balcon', sel('balcon', engOpt('balcon')));
      if (isBuc()) m += field('metrou', 'Până la metrou', sel('metrou', [['', 'Nu știu / nu contează']].concat(E.OPT.metrou.slice(1).map(function (o) { return [o[0], o[1]]; }))), S.f.metrouAuto ? { hint: 'după strada aleasă, schimbă dacă e altfel' } : null);
      var an = num(S.f.an);
      if (!an || an <= 1990) m += field('seismic', 'Risc seismic', sel('seismic', engOpt('seismic')));
      if (!an || an <= 2005) m += field('anv', ' ', check('anvelopat', 'Bloc reabilitat termic (anvelopat)'), { cls: 'nvev-fck' });
    } else if (t === 'casa') {
      m += field('structura', 'Structura', sel('structura', engOpt('structura')));
      m += field('regim', 'Regim de înălțime', sel('regim', engOpt('regim')));
      m += field('incalzire', 'Încălzire', sel('incalzire', engOpt('incalzire')));
      m += field('utilCanal', 'Canalizare', sel('utilCanal', DA_NU));
      m += field('utilGaz', 'Gaze', sel('utilGaz', DA_NU));
      m += field('asfalt', 'Stradă asfaltată', sel('asfalt', DA_NU));
      m += field('frontC', 'Front stradal', txt('frontC', 'ex. 15', 'm'));
      m += field('gar', ' ', check('garaj', 'Are garaj'), { cls: 'nvev-fck' });
    } else {
      m += field('destinatie', 'Ce se poate construi', sel('destinatie', engOpt('destinatie')));
      m += field('frm', ' ', check('neregulat', 'Formă neregulată (nu dreptunghiulară)'), { cls: 'nvev-fck' });
    }
    m += field('jur', ' ', check('probleme', 'Are probleme juridice (succesiune nefinalizată, neintabulat, sarcini)'), { cls: 'nvev-fck nvev-w' });
    h += '<details class="nvev-more"' + (S.moreOpen ? ' open' : '') + '><summary>Mai multe detalii <span>opțional, cresc precizia</span></summary><div class="nvev-grid">' + m + '</div></details>';
    h += '<button type="submit" class="nvev-btn nvev-go">' + (S.shown ? 'Recalculează' : 'Vezi cât valorează') + '</button>';
    return h;
  }

  function renderForm() {
    var form = $('.nvev-form'); if (!form) return;
    form.innerHTML = formHTML();
    var zs = $('#nvev-zona');
    if (ZC && zs) {
      ZC.attach(zs, {
        inputClass: 'nvev-inp',
        placeholder: 'Scrie zona: ex. Drumul Taberei, Bragadiru, Pipera',
        scrollOnFocus: true,
        items: function () { return S.zones.map(function (z) { return { v: z.id, t: z.nume, g: z.grup.replace('București – ', ''), keys: (z.alias || []).concat(z.loc ? [z.loc] : [], z.sector ? ['sector ' + z.sector] : []) }; }); }
      });
    }
    var ss = $('#nvev-strada');
    if (ZC && ss) {
      ZC.attach(ss, {
        inputClass: 'nvev-inp', scrollOnFocus: true, minChars: 2, freeText: true, allowEmpty: true, toggleLabel: 'Arată străzile',
        placeholder: S.f.zona ? 'Scrie strada' : 'Alege întâi zona',
        hintMsg: function () { return !S.f.zona ? 'Alege întâi zona, apoi scrie strada.' : S.sdErr ? 'Lista străzilor nu s-a încărcat. Poți scrie strada, o vede consultantul.' : !S.sd ? 'Se încarcă lista străzilor…' : 'Scrie primele litere ale străzii.'; },
        noneMsg: function (q) { return 'Nu găsim „' + q + '” în zona aleasă. Poți lăsa ce ai scris: îl vede consultantul.'; },
        items: function () { return streetItems(); }
      });
      ss._zc.input.addEventListener('focus', loadStreets);
      if (S.f.zona) { loadStreets(); refreshStreets(); }
    }
  }

  // ---------- citirea formularului → proprietatea pentru motor ----------
  function readForm() {
    var f = S.f;
    $$('.nvev-form select, .nvev-form input[type="text"]').forEach(function (el) { if (el.name) f[el.name] = el.value; });
    $$('.nvev-form input[type="checkbox"]').forEach(function (el) { f[el.name] = el.checked; });
  }
  function subject() {
    var f = S.f, s = { tip: S.tip, zona: f.zona || '', mp: f.mp || '', juridic: f.probleme ? 'probleme' : 'ok' };
    var st = f.strada || '';
    if (st) s.strada = st.charAt(0) === '~' ? st.slice(1) : st.split('|')[0];
    var mf = microFor(s.zona, S.tip, st); if (mf) { s.micro = { f: mf.f, nm: mf.nm, label: mf.label }; s.microPct = mf.pct; }
    if (S.tip === 'apartament') {
      ['camere', 'an', 'stare', 'etaj', 'etajeTotal', 'compart', 'incalzire', 'balcon', 'seismic'].forEach(function (k) { if (f[k]) s[k] = f[k]; });
      if (f.metrou && isBuc()) s.metrou = f.metrou;
      if (f.parcare) { var p = f.parcare.split('|'); s.parcareNr = p[0]; s.parcareTip = p[1]; } else s.parcareNr = '';
      s.anvelopat = !!f.anvelopat && (!num(f.an) || num(f.an) <= 2005);
      s.balcon = s.balcon || '';
      // balconul nu intră în suprafața utilă: se scrie separat și contează cam la jumătate (terasa, cam 30%)
      var bm = num(f.mpBalcon);
      if (f.mpBalcon !== '' && f.mpBalcon != null && bm != null && bm >= 0) { s.mpBalcon = String(bm); s.balcon = bm > 0 ? (s.balcon === 'terasa' ? 'terasa' : 'da') : 'nu'; }
    } else if (S.tip === 'casa') {
      ['camere', 'an', 'stare', 'tipCasa', 'structura', 'regim', 'incalzire', 'teren'].forEach(function (k) { if (f[k]) s[k] = f[k]; });
      ['utilCanal', 'utilGaz', 'asfalt'].forEach(function (k) { s[k] = f[k] === 'da' ? true : f[k] === 'nu' ? false : null; });
      if (f.frontC) s.front = f.frontC;
      s.garaj = !!f.garaj;
    } else {
      s.intravilan = f.intravilan !== 'nu';
      s.utilCurent = !!f.utilCurent; s.utilApa = !!f.utilApa; s.utilCanal = !!f.utilCanalT; s.utilGaz = !!f.utilGazT;
      if (f.front) s.front = f.front; if (f.acces) s.acces = f.acces; if (f.destinatie) s.destinatie = f.destinatie;
      if (f.neregulat) s.forma = 'neregulat';
    }
    return s;
  }
  var MP_LIM = { apartament: [12, 400], casa: [30, 1500], teren: [50, 500000] };
  function validate(show) {
    var ok = true, f = S.f, errs = {};
    if (!f.zona) { errs.zona = 'Alege zona (scrie primele litere și alege din listă).'; ok = false; }
    var mp = num(f.mp), lim = MP_LIM[S.tip];
    if (!mp) { errs.mp = 'Scrie suprafața în mp.'; ok = false; }
    else if (mp < lim[0] || mp > lim[1]) { errs.mp = 'Suprafața pare neobișnuită (între ' + n0(lim[0]) + ' și ' + n0(lim[1]) + ' mp).'; ok = false; }
    if (S.tip === 'casa' && f.teren && (!num(f.teren) || num(f.teren) < 30 || num(f.teren) > 100000)) { errs.teren = 'Verifică suprafața terenului.'; ok = false; }
    if (S.tip === 'apartament' && f.mpBalcon && (num(f.mpBalcon) == null || num(f.mpBalcon) < 0 || num(f.mpBalcon) > 200)) { errs.mpBalcon = 'Scrie suprafața balconului în mp (sau lasă gol).'; ok = false; }
    if (show) ['zona', 'mp', 'teren', 'mpBalcon'].forEach(function (k) { var e = $('#nvev-' + k + '-err'); if (e) e.textContent = errs[k] || ''; var w = $('[data-for="' + k + '"]'); if (w) w.classList.toggle('nvev-bad', !!errs[k]); });
    return ok ? null : errs;
  }

  // ---------- calcul ----------
  function evaluate() {
    var s = subject(), d = S.data;
    var r = E.evaluate(s, [], S.zones, {}, d.params || {}, new Date());
    if (!r || !r.ok) return null;
    var z = S.zmap[s.zona], used = (z && z.u && z.u[S.tip]) || 0, compl = r.completeness || 0;
    // marja arătată vizitatorului: cât de multe anunțuri avem în zonă și cât de complet e formularul
    var m = used >= 30 ? 0.07 : used >= 10 ? 0.085 : used >= 3 ? 0.10 : 0.115;
    m += (1 - compl) * 0.04;
    if (S.tip === 'teren' && s.intravilan === false) m += 0.05;
    var P = r.prices, step = P.realist >= 100000 ? 1000 : 500;
    return { r: r, s: s, z: z, used: used, margin: m, min: round(P.realist * (1 - m), step), max: round(P.realist * (1 + m), step), realist: P.realist, ppm: P.realist / num(s.mp) };
  }
  var TIP_LBL = { apartament: 'apartament', casa: 'casă', teren: 'teren' };
  function basisText(x) {
    var d = S.data, z = x.z, when = dateRo(d.actualizat);
    if (x.used >= 5) return 'Calculat din ' + deN(x.used, 'anunțuri') + ' analizate în ' + z.nume + ', plus evoluția prețurilor din București și Ilfov. Date actualizate pe ' + when + '.';
    return 'Calculat din prețurile de referință ale zonei ' + z.nume + ', actualizate cu evoluția pieței (' + deN(d.anunturi, 'anunțuri') + ' monitorizate în București și Ilfov). Date actualizate pe ' + when + '. Pentru zona ta, o evaluare făcută de un consultant e mai precisă.';
  }
  function renderResult() {
    var box = $('.nvev-result'), x = evaluate(), keep = {};
    $$('.nvev-lead input, .nvev-lead select').forEach(function (i) { keep[i.name] = i.type === 'checkbox' ? i.checked : i.value; });
    S.res = x;
    if (!x) { box.hidden = true; return; }
    box.hidden = false;
    var lead = '';
    if (!S.unlocked) {
      lead = '<div class="nvev-gate"><h4>Primește raportul detaliat, gratuit</h4>' +
        '<ul class="nvev-gets"><li>Prețul pentru vânzare rapidă, prețul realist și prețul de listare recomandat</li><li>Ce crește și ce scade valoarea proprietății tale, în euro</li><li>Cât durează de obicei vânzarea în zonă și ce prețuri se cer acum</li><li>Apoi te sună un consultant Novaria pentru evaluarea completă, pe proprietăți comparabile actuale</li></ul>' +
        '<form class="nvev-lead" novalidate>' +
        '<div class="nvev-grid">' +
        '<div class="nvev-f"><label for="nvev-tel">Telefon <span class="nvev-req" aria-hidden="true">*</span></label><input class="nvev-inp" id="nvev-tel" name="telefon" type="tel" inputmode="tel" autocomplete="tel" placeholder="07xx xxx xxx" required><div class="nvev-err" id="nvev-tel-err" aria-live="polite"></div></div>' +
        '<div class="nvev-f"><label for="nvev-nume">Nume <span class="nvev-hint">opțional</span></label><input class="nvev-inp" id="nvev-nume" name="nume" type="text" autocomplete="name"></div>' +
        '<div class="nvev-f"><label for="nvev-email">Email <span class="nvev-hint">opțional, primești estimarea și pe email</span></label><input class="nvev-inp" id="nvev-email" name="email" type="email" autocomplete="email" inputmode="email"><div class="nvev-err" id="nvev-email-err" aria-live="polite"></div></div>' +
        '<div class="nvev-f"><label for="nvev-timeline">Când te gândești să vinzi? <span class="nvev-hint">opțional</span></label><select class="nvev-inp" id="nvev-timeline" name="timeline">' + opts([['', 'Alege'], ['acum', 'Cât mai repede'], ['1-3', 'În 1–3 luni'], ['3-6', 'În 3–6 luni'], ['6+', 'Peste 6 luni'], ['info', 'Doar mă informez']], '') + '</select></div>' +
        '</div>' +
        '<div class="nvev-hp" aria-hidden="true"><label>Site web <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>' +
        '<label class="nvev-ck nvev-acord"><input type="checkbox" name="acord" id="nvev-acord"> <span>Sunt de acord să fiu contactat de Novaria în legătură cu evaluarea proprietății. Datele mele sunt folosite doar pentru asta, conform <a href="' + esc(CFG.privacyUrl || '#') + '" target="_blank" rel="noopener">politicii de confidențialitate</a>.</span></label>' +
        '<div class="nvev-err" id="nvev-acord-err" aria-live="polite"></div>' +
        '<button type="submit" class="nvev-btn nvev-accent">Trimite și vezi raportul</button>' +
        '<div class="nvev-err nvev-send-err" aria-live="polite"></div>' +
        '</form>' + contactLine('Preferi să vorbim direct?') + '</div>';
    }
    box.innerHTML =
      '<div class="nvev-range" tabindex="-1">' +
      '<div class="nvev-lbl">Valoarea estimată a proprietății</div>' +
      '<div class="nvev-val"><b>' + eur(x.min) + '</b> <span>–</span> <b>' + eur(x.max) + '</b></div>' +
      '<div class="nvev-sub">≈ ' + n0(x.ppm) + ' €/mp · prețul la care se vinde realist ' + (TIP_LBL[S.tip] === 'casă' ? 'o casă' : 'un ' + TIP_LBL[S.tip]) + ' ca al tău în ' + esc(x.z ? x.z.nume : 'zonă') + '</div>' +
      '</div>' +
      '<p class="nvev-basis">' + esc(basisText(x)) + '</p>' +
      warningsHTML(x, true) +
      (S.unlocked ? reportHTML(x) : lead) +
      '<p class="nvev-disc">Estimare automată, orientativă, pornind de la prețurile cerute în zonă. Nu este un raport de evaluare ANEVAR.' + (S.sd ? ' Lista străzilor: © colaboratorii OpenStreetMap.' : '') + '</p>';
    var lf = $('.nvev-lead');
    if (lf) { lf.addEventListener('submit', onLead); $$('input, select', lf).forEach(function (i) { if (keep[i.name] == null) return; if (i.type === 'checkbox') i.checked = keep[i.name]; else i.value = keep[i.name]; }); }
  }
  function contactLine(lead) {
    var tel = (CFG.phone || '').replace(/\s+/g, ''), wa = CFG.whatsapp;
    if (!tel && !wa) return '';
    return '<p class="nvev-contact">' + esc(lead) + ' ' + (tel ? '<a href="tel:' + esc(tel) + '">Sună la ' + esc(CFG.phone) + '</a>' : '') + (tel && wa ? ' · ' : '') + (wa ? '<a href="https://wa.me/' + esc(wa) + '?text=' + encodeURIComponent(waText()) + '" target="_blank" rel="noopener">Scrie pe WhatsApp</a>' : '') + '</p>';
  }
  function waText() {
    var x = S.res; if (!x) return 'Bună ziua, aș dori o evaluare a proprietății mele.';
    return 'Bună ziua, am folosit evaluatorul de pe novaria.ro: ' + (S.tip === 'casa' ? 'casă' : S.tip) + ' de ' + n0(num(x.s.mp)) + ' mp' + (num(x.s.mpBalcon) ? ' + ' + n0(num(x.s.mpBalcon)) + ' mp balcon' : '') + ' în ' + (x.z ? x.z.nume : '') + ', estimare ' + eur(x.min) + ' – ' + eur(x.max) + '. Aș dori o evaluare completă.';
  }
  var HIDE_WARN = /comparabil|Setări|media zonei/i;
  function warningsHTML(x, short) {
    var w = (x.r.warnings || []).filter(function (t) { return !HIDE_WARN.test(t); });
    if (!w.length) return '';
    return '<ul class="nvev-warn">' + w.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
  }
  function reportHTML(x) {
    var r = x.r, P = r.prices, tm = P.times || {}, z = x.z, st = z && z.st && z.st[S.tip];
    var h = '<div class="nvev-report"><h4>Raportul detaliat</h4>';
    h += '<div class="nvev-tiers">' +
      '<div class="nvev-tier"><div class="k">Vânzare rapidă</div><div class="v">' + eur(P.quick) + '</div><div class="t">' + esc(tm.quick || '') + '</div></div>' +
      '<div class="nvev-tier on"><div class="k">Preț realist</div><div class="v">' + eur(P.realist) + '</div><div class="t">' + esc(tm.realist || '') + ' · ' + n0(x.ppm) + ' €/mp</div></div>' +
      '<div class="nvev-tier"><div class="k">Preț de listare recomandat</div><div class="v">' + eur(P.list) + '</div><div class="t">lasă loc de negociere · ' + esc(tm.list || '') + '</div></div>' +
      '</div>';
    var dr = (r.drivers || []).filter(function (d) { return Math.abs(d.eur) >= 300; }).slice(0, 7);
    if (dr.length) {
      h += '<h5>Ce crește și ce scade valoarea</h5><table class="nvev-drv"><tbody>' + dr.map(function (d) { var pos = d.eur >= 0; return '<tr><td>' + esc(d.label) + (d.detail ? '<small>' + esc(d.detail) + '</small>' : '') + '</td><td class="' + (pos ? 'up' : 'down') + '">' + (pos ? '+' : '−') + eur(round(Math.abs(d.eur), 100)) + '</td></tr>'; }).join('') + '</tbody></table>';
      h += '<p class="nvev-note">Față de ' + (S.tip === 'teren' ? 'un teren obișnuit' : S.tip === 'casa' ? 'o casă obișnuită' : 'un apartament obișnuit') + ' din aceeași zonă.</p>';
    }
    h += '<h5>Piața din ' + esc(z ? z.nume : 'zonă') + '</h5><ul class="nvev-mk">';
    if (st && st.med) h += '<li>Prețul cerut median: <b>' + n0(st.med) + ' €/mp</b>, din ' + deN(st.n, 'anunțuri') + ' actuale' + (st.p25 && st.p75 ? '; cele mai multe între ' + n0(st.p25) + ' și ' + n0(st.p75) + ' €/mp' : '') + '.</li>';
    var pos = st && st.p25 && st.p75 ? (x.ppm < st.p25 ? ' — sub majoritatea anunțurilor din zonă' : x.ppm > st.p75 ? ' — peste majoritatea anunțurilor din zonă' : ' — în intervalul obișnuit al zonei') : '';
    h += '<li>Prețul realist estimat pentru proprietatea ta: <b>' + n0(x.ppm) + ' €/mp</b>' + esc(pos) + '. Ține cont de an, stare, etaj și suprafață, iar prețul final de vânzare iese de obicei cu 5–12% sub cel din anunț.</li>';
    h += '<li>Cerere în zonă: <b>' + esc(r.liq || 'medie') + '</b>. La prețul realist, vânzarea durează de obicei ' + esc(tm.realist || '2–4 luni') + '.</li>';
    if (x.s.strada) {
      var M = S.data && S.data.micro, sc = M && M.scala ? M.scala[S.tip] || 0 : 0;
      if (x.s.micro) h += '<li>' + esc(x.s.micro.nm) + ': <b>' + esc(x.s.micro.label.split(',')[0]) + '</b>, ' + (/după analiza Novaria/.test(x.s.micro.label) ? 'după analiza Novaria a străzii.' : 'calculat din anunțurile de pe stradă și din jur.') + '</li>';
      else if (S.f.strada.charAt(0) === '~') h += '<li>Strada scrisă (' + esc(x.s.strada) + ') nu e în lista noastră; am folosit media zonei.</li>';
      else if (!sc) h += '<li>La ' + (S.tip === 'apartament' ? 'apartamente' : S.tip === 'casa' ? 'case' : 'terenuri') + ' nu vedem încă în anunțuri diferențe clare între străzile aceleiași zone, așa că am folosit media zonei' + (S.tip === 'apartament' && isBuc() ? ' și distanța până la metrou' : '') + '.</li>';
      else h += '<li>Pentru ' + esc(x.s.strada) + ' nu avem încă destule anunțuri pe stradă și în jur; am folosit media zonei.</li>';
    }
    h += '</ul>';
    var miss = (r.missing || []).filter(function (t) { return /^Lipsește/.test(t); }).slice(0, 4);
    if (miss.length) h += '<p class="nvev-note">Estimarea ar fi mai precisă cu: ' + esc(miss.map(function (t) { return t.replace(/^Lipsește\s*/, '').replace(/\.$/, ''); }).join(', ')) + '. Le poți completa mai sus, la „Mai multe detalii”.</p>';
    h += '<div class="nvev-next"><b>Ce urmează:</b> un consultant Novaria te sună în cel mult o zi lucrătoare pentru evaluarea completă, gratuită, făcută pe proprietăți comparabile vândute și listate acum.</div>';
    h += '<div class="nvev-acts"><button type="button" class="nvev-btn nvev-ghost" data-act="print">Printează raportul</button>' + contactLine('') + '</div>';
    h += '</div>';
    return h;
  }

  // ---------- trimiterea cererii de raport ----------
  function onLead(e) {
    e.preventDefault();
    if (S.sending) return;
    var form = e.currentTarget, tel = form.telefon.value.trim(), digits = tel.replace(/\D/g, '');
    ['#nvev-tel-err', '#nvev-email-err', '#nvev-acord-err', '.nvev-send-err'].forEach(function (q) { form.querySelector(q).textContent = ''; });
    var firstBad = null;
    if (digits.length < 9 || digits.length > 13) { form.querySelector('#nvev-tel-err').textContent = 'Scrie un număr de telefon valid, ex. 0722 123 456.'; firstBad = firstBad || form.telefon; }
    if (form.email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.value.trim())) { form.querySelector('#nvev-email-err').textContent = 'Adresa de email nu pare corectă (sau las-o goală).'; firstBad = firstBad || form.email; }
    if (!form.acord.checked) { form.querySelector('#nvev-acord-err').textContent = 'Bifează acordul ca să te putem contacta.'; firstBad = firstBad || form.acord; }
    if (firstBad) { firstBad.focus(); return; }
    var x = S.res, z = x && x.z, P = x && x.r.prices;
    var payload = {
      telefon: tel, nume: form.nume.value.trim(), email: form.email.value.trim(), timeline: form.timeline.value, acord: true, website: form.website.value,
      t: Date.now() - shownAt, pagina: location.href.split('#')[0], dateVer: S.data && S.data.actualizat,
      zonaNume: z ? z.nume : '', proprietate: x ? x.s : { tip: S.tip },
      estimare: x ? { min: x.min, max: x.max, realist: P.realist, rapid: P.quick, listare: P.list, ppm: Math.round(x.ppm) } : {}
    };
    S.sending = true; var btn = form.querySelector('button[type="submit"]'); btn.disabled = true; btn.textContent = 'Se trimite…';
    function done(ok, msg) {
      S.sending = false; btn.disabled = false; btn.textContent = 'Trimite și vezi raportul';
      if (!ok) { form.querySelector('.nvev-send-err').textContent = msg || 'Nu am putut trimite cererea. Încearcă din nou sau sună-ne.'; return; }
      S.unlocked = true; track('generate_lead', { form: 'novaria_evaluator', tip: S.tip, zona: z ? z.id : '' });
      try { if (typeof window.nvTrack === 'function') window.nvTrack('Lead', 'SubmitForm', { content_name: 'Evaluator', content_category: S.tip }); } catch (e) { }
      renderResult();
      var rep = $('.nvev-report'); if (rep) { rep.insertAdjacentHTML('afterbegin', '<p class="nvev-thanks" role="status">Mulțumim! Am primit cererea ta. Mai jos e raportul detaliat.</p>'); rep.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }
    function viaAjax() {
      var fd = new FormData(); fd.append('action', 'novaria_ev_lead'); fd.append('payload', JSON.stringify(payload));
      return fetch(CFG.ajaxUrl, { method: 'POST', body: fd, credentials: 'same-origin' }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); });
    }
    fetch(CFG.leadUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), credentials: 'omit' })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j, st: r.status }; }, function () { return { ok: false, j: null, st: r.status }; }); })
      .then(function (a) { if (a.ok && a.j && a.j.ok) return a; if (a.j && a.j.msg) return a; return viaAjax(); })
      .then(function (a) { done(!!(a.ok && a.j && a.j.ok), a.j && a.j.msg); }, function () { viaAjax().then(function (a) { done(!!(a.ok && a.j && a.j.ok), a.j && a.j.msg); }, function () { done(false); }); });
  }

  // ---------- evenimente ----------
  function calc(scroll) {
    readForm();
    var errs = validate(true);
    if (errs) { var first = $('.nvev-bad .nvev-inp, .nvev-bad .zc-inp'); if (first && scroll) first.focus(); return; }
    var first = !S.shown; S.shown = true;
    renderResult();
    var go = $('.nvev-go'); if (go) go.textContent = 'Recalculează';
    if (first) track('evaluator_estimate', { tip: S.tip, zona: S.f.zona });
    if (scroll) { var rg = $('.nvev-range'); if (rg) { rg.scrollIntoView({ behavior: 'smooth', block: 'center' }); try { rg.focus({ preventScroll: true }); } catch (e) { } } }
  }
  function live() { if (!S.shown) return; readForm(); if (validate(false)) return; validate(true); renderResult(); }

  function bind() {
    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-tip]');
      if (t) { readForm(); S.moreOpen = !!($('.nvev-more') || {}).open; var keep = { zona: S.f.zona, strada: S.f.strada }; S.tip = t.getAttribute('data-tip'); S.f = keep; var mo0 = streetMetro(keep.strada); if (S.tip === 'apartament' && isBuc() && mo0) { S.f.metrou = String(mo0); S.f.metrouAuto = true; } renderForm(); if (S.shown) { var b = $('.nvev-result'); b.hidden = true; S.shown = false; $('.nvev-go').textContent = 'Vezi cât valorează'; } var nt = $('[data-tip="' + S.tip + '"]'); if (nt) nt.focus(); return; }
      var c = e.target.closest('[data-chip]');
      if (c) { var k = c.getAttribute('data-chip'), v = c.getAttribute('data-v'); S.f[k] = S.f[k] === v ? '' : v; $$('[data-chip="' + k + '"]').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-v') === S.f[k])); }); live(); return; }
      if (e.target.closest('[data-act="print"]')) { window.print(); return; }
    });
    root.addEventListener('keydown', function (e) {
      var t = e.target; if (!t.matches || !t.matches('[role="tab"],[role="radio"]')) return;
      if (['ArrowLeft', 'ArrowRight'].indexOf(e.key) < 0) return;
      var sib = $$(t.matches('[role="tab"]') ? '[role="tab"]' : '[data-chip="' + t.getAttribute('data-chip') + '"]'), i = sib.indexOf(t) + (e.key === 'ArrowRight' ? 1 : -1);
      if (sib[i]) { e.preventDefault(); sib[i].focus(); }
    });
    root.addEventListener('change', function (e) {
      if (e.target.closest('.nvev-lead')) return;
      if (e.target.name === 'an') { readForm(); S.moreOpen = !!($('.nvev-more') || {}).open; var foc = document.activeElement && document.activeElement.id; renderForm(); if (foc) { var el = document.getElementById(foc); if (el) el.focus(); } }
      if (e.target.name === 'zona') {
        readForm(); loadStreets();
        if (S.f.metrouAuto) { S.f.metrou = ''; S.f.metrouAuto = false; }
        var wasBuc = !!$('#nvev-metrou'); if (S.tip === 'apartament' && wasBuc !== isBuc()) { S.moreOpen = !!($('.nvev-more') || {}).open; renderForm(); } else refreshStreets();
        var nx = $('#nvev-strada_q'), mp = $('#nvev-mp'); if (nx && !S.f.strada) setTimeout(function () { nx.focus(); }, 30); else if (mp && !mp.value) setTimeout(function () { mp.focus(); }, 30);
      }
      if (e.target.name === 'strada') {
        readForm();
        // distanța până la metrou, din strada aleasă (doar dacă nu a ales-o vizitatorul)
        var mo = streetMetro(S.f.strada), ms = $('#nvev-metrou');
        if (S.tip === 'apartament' && isBuc() && (!S.f.metrou || S.f.metrouAuto)) { S.f.metrou = mo ? String(mo) : ''; S.f.metrouAuto = !!mo; if (ms) { S.moreOpen = !!($('.nvev-more') || {}).open; renderForm(); } }
        var mp2 = $('#nvev-mp'); if (mp2 && !mp2.value) setTimeout(function () { mp2.focus(); }, 30);
      }
      if (e.target.name === 'metrou') { S.f.metrouAuto = false; var hh = $('[data-for="metrou"] .nvev-hint'); if (hh) hh.remove(); }
      live();
    });
    root.addEventListener('input', function (e) { if (e.target.closest('.nvev-lead')) return; if (e.target.matches('#nvev-mp,#nvev-mpBalcon,#nvev-teren,#nvev-front,#nvev-frontC')) { clearTimeout(S.tm); S.tm = setTimeout(live, 350); } });
    root.addEventListener('submit', function (e) { if (e.target.classList.contains('nvev-form')) { e.preventDefault(); calc(true); } });
  }

  function start() {
    root.innerHTML = '<div class="nvev-card"><form class="nvev-form" novalidate></form><div class="nvev-result" aria-live="polite" hidden></div></div>';
    renderForm(); bind();
  }
  loadData().then(function (d) { setData(d); start(); }, function () {
    root.innerHTML = '<div class="nvev-card"><p class="nvev-fail">Evaluatorul nu s-a putut încărca acum. ' + contactLine('Ne poți contacta direct:') + '</p></div>';
  });
})();
