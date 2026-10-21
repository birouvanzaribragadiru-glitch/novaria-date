/* Novaria — semnale din textul anunțurilor (titlu, rezumat, adresă): lift, reabilitare, material, ultimul etaj și acoperișul,
   băi, boxă, încălzire, certificat energetic, poziție, TVA, stadiu, parcare, comision, proprietar, etaj/an din text, stradă + număr + bloc.
   Funcții pure; folosit de aplicație (comparabile), de export și de calibrare. Nu reține nume de persoane sau telefoane. */
(function (root) {
  'use strict';
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/ă|â/g, 'a').replace(/î/g, 'i').replace(/ș|ş/g, 's').replace(/ț|ţ/g, 't')
      .replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  }
  function has(t, re) { return re.test(t); }
  function num(m) { if (!m) return null; var v = parseFloat(String(m).replace(',', '.')); return isFinite(v) ? v : null; }

  var RX = {
    lift: /\blift\b|\bascensor/,
    faraLift: /fara lift|nu are lift|lipsa lift/,
    reabilitat: /reabilitat|anvelopat|izolat termic|termoizolat|bloc izolat/,
    nereabilitat: /nereabilitat|neanvelopat|neizolat/,
    caramida: /caramida|bloc de caramida/,
    panou: /\bpanou|panouri prefabricate|prefabricat/,
    beton: /\bbeton\b|monolit|cadre de beton/,
    bca: /\bbca\b/,
    ultim: /ultimul etaj|ultim etaj|etajul ultim|ultim nivel|ultimul nivel|top floor|la ultimul\b/,
    terasa: /\bterasa\b|acoperis plat|acoperis terasa|bloc cu terasa/,
    sarpanta: /sarpanta|acoperis (tip )?sarpanta|\bpod\b|acoperis din tabla|acoperis tigla/,
    mansarda: /mansarda|mansardat/,
    etajTehnic: /etaj tehnic|nivel tehnic|deasupra (este|e) (un )?(etaj|nivel) tehnic/,
    penthouse: /penthouse|pent-house/,
    demisol: /demisol|semi-?subsol|\bsubsol\b/,
    parter: /\bparter\b/,
    bai2: /2 bai|doua bai|două bai|2 grupuri sanitare|doua grupuri sanitare|2 toalete/,
    bai3: /3 bai|trei bai|3 grupuri sanitare/,
    boxa: /\bboxa\b|\bbox\b|debara la subsol|spatiu de depozitare la subsol/,
    centrala: /centrala (proprie|termica|de apartament|pe gaz)|\bcentrala\b|ct proprie/,
    termoficare: /termoficare|radet|termoenergetica|\bcet\b/,
    pompa: /pompa de caldura|incalzire in pardoseala|pardoseala/,
    certA: /clasa energetica a\b|certificat (energetic )?clasa a\b|clasa a\+?\b|energetic[a]? a\b/,
    certB: /clasa energetica b\b|clasa b\b|energetic[a]? b\b/,
    certC: /clasa energetica c\b|clasa c\b/,
    certDEFG: /clasa energetica [defg]\b|clasa [defg]\b/,
    stradal: /\bstradal|la strada|la bulevard|vedere (la|spre) (strada|bulevard)|front stradal/,
    curte: /curte interioara|spre curte|vedere (la|spre|in) curte|interior linistit|linistit/,
    parc: /vedere (la|spre) parc|vedere (la|spre) lac|langa parc|parcul /,
    panoramic: /panoramic/,
    tvaPlus: /\+\s*tva|plus tva|fara tva|pret fara tva|tva neinclus|la care se adauga tva/,
    tvaInclus: /tva inclus|pret cu tva|include tva|cu tva/,
    constructie: /in constructie|stadiu (de )?constructie|finalizare (in )?20\d\d|predare (in )?20\d\d|se finalizeaza|proiect nou|la rosu/,
    finalizat: /finalizat|receptionat|receptie|gata de mutare|disponibil imediat|mutare imediata/,
    parcare: /loc de parcare|locuri de parcare|parcare inclus|parcare subteran|parcare suprateran|cu parcare/,
    garaj: /\bgaraj\b/,
    faraParcare: /fara (loc de )?parcare/,
    comision0: /comision 0|0 comision|0% comision|comision zero|fara comision|zero comision|direct (de la )?dezvoltator/,
    proprietar: /\bproprietar\b|direct proprietar|fara intermediar|fara agentii|persoana fizica/,
    decomandat: /\bdecomandat/,
    semidecomandat: /semi-?decomandat|semidec/,
    nedecomandat: /nedecomandat|\bvagon\b/,
    renovat: /renovat|finisaje noi|modernizat|recent renovat|complet renovat|totul nou/,
    lux: /\blux\b|premium|high[- ]?end|de lux|exclusivist|finisaje premium/,
    deRenovat: /de renovat|necesita renovare|necesita (mici )?imbunatatiri|pentru renovare/,
    mobilat: /\bmobilat\b|mobilat si utilat|mobilat complet/,
    nemobilat: /nemobilat|fara mobila/,
    utilat: /\butilat\b/,
    garsoniera: /garsonier/,
    studio: /\bstudio\b/,
    bulina: /bulina rosie|\brs ?i\b|risc seismic/,
    consolidat: /consolidat/,
    intabulat: /intabulat|cadastru|cu acte|acte la zi/,
    ipoteca: /ipoteca|credit ipotecar|sarcini/,
    metrou: /metrou|statia de metrou|m\.? [a-z]+ \(\d+ min\)/,
    vedereDubla: /vedere dubla|dubla expunere|doua expuneri/,
    orientSud: /orientare sud|expunere sud|\bsudic|spre sud/,
    orientNord: /orientare nord|expunere nord|\bnordic|spre nord/,
    liber: /liber(a)? de sarcini|liber la vanzare|neinchiriat/,
    inchiriat: /\b(este|e|deja|momentan|actualmente) inchiriat|inchiriat (cu|pana|in prezent)|cu chirias|chiriasi\b|contract de inchiriere in derulare/
  };
  var RX_ETAJ = /\b(?:et(?:aj)?\.?\s*)(p|parter|d|demisol|m|mansarda|\d{1,2})\s*(?:\/|din)\s*(\d{1,2})\b/;
  var RX_ETAJ2 = /\b(?:et(?:aj)?\.?\s*)(p|parter|d|demisol|m|mansarda|\d{1,2})\b/;
  var RX_ETAJ3 = /\b(\d{1,2})\s*\/\s*(\d{1,2})\b/;   // „3/8” lângă cuvântul etaj sau singur în titlu
  var RX_AN = /\b(?:an(?:ul)?(?: de)? constructi\w*|constru\w+ in|bloc(?: din| construit)?|finalizat(?: in)?|din|construit|receptionat)\s*(?:in )?(19[3-9]\d|20[0-3]\d)\b|\b(19[3-9]\d|20[0-3]\d)\s*(?:constructie|an)\b/;
  var RX_AN_SOLO = /\b(19[5-9]\d|20[0-3]\d)\b/;
  var RX_CAMERE = /\b(\d)\s*(?:cam(?:ere|\.)?|camere)\b/;
  var RX_STRADA = /\b(str(?:ada|\.)?|strada|bd(?:ul|\.)?|bulevardul|b-dul|sos(?:eaua|\.)?|soseaua|calea|aleea|al\.|drumul|intrarea|intr\.|splaiul|piata|p-ta|prelungirea)\s+([a-z][a-z0-9\-]*(?:\s+(?!nr\b|bl\b|bloc\b|sc\b|et\b|ap\b|sector)[a-z0-9\-]+){0,3})/;
  var RX_NR = /\b(?:nr\.?|numarul|no\.?)\s*(\d{1,4}\s*[a-z]?)\b/;
  var RX_BLOC = /\b(?:bl(?:oc)?\.?)\s*(?!19\d\d\b|20\d\d\b|nou\b|noi\b|vechi\b|de\b|cu\b|din\b|tip\b)([a-z]?\d{1,3}[a-z]?|[a-z]\d{0,3}|[a-z]{1,2}\d{1,3})\b/;
  var RX_INTRETINERE = /intretinere[a]?\s*(?:de|la|:)?\s*(\d{2,4})\s*(?:lei|ron)/;
  var RX_MP_TEREN = /(\d{2,5})\s*mp\s*(?:de )?teren|teren\s*(?:de |:)?\s*(\d{2,5})\s*mp/;
  var TIP_STRADA = { 'str': 'Str.', 'str.': 'Str.', 'strada': 'Str.', 'bd': 'Bd.', 'bdul': 'Bd.', 'bd.': 'Bd.', 'bulevardul': 'Bd.', 'b-dul': 'Bd.', 'sos': 'Șos.', 'sos.': 'Șos.', 'soseaua': 'Șos.', 'calea': 'Calea', 'aleea': 'Aleea', 'al.': 'Aleea', 'drumul': 'Drumul', 'intrarea': 'Intr.', 'intr.': 'Intr.', 'splaiul': 'Splaiul', 'piata': 'Piața', 'p-ta': 'Piața', 'prelungirea': 'Prelungirea' };
  var STOP_STRADA = /^(de|din|cu|la|in|si|sau|pe|nou|noua|bloc|bl|ap|apartament|apartamente|garsoniera|langa|aproape|zona|sector|sectorul|metrou|vanzare|vand|vinde|vindem|etaj|et|nr|mp|camere|cam|decomandat|renovat|mobilat|judetul|comuna|oras|orasul|intersectie|colt|vila|vile|casa|case|teren|curte|duplex|individuala|individual|util|utili|constructie|parter|penthouse|studio|pret|comision|proprietar|direct|dezvoltator|complex|ansamblu|residence|lux|premium|parcare|garaj|boxa|centrala|lift|anvelopat|reabilitat|liber|imediat|urgent|ocazie|oferta|super|ideal|spatios|luminos|frumos|deosebit|modern|finisat)$/;
  // localități și cartiere care urmează după numele străzii („Str Diamantului Bragadiru”): opresc numele, dar pot fi ele însele nume de stradă („Drumul Taberei”)
  var LOC_STOP = /^(bucuresti|ilfov|bragadiru|domnesti|clinceni|cornetu|magurele|chiajna|popesti|leordeni|jilava|voluntari|pipera|otopeni|buftea|berceni|pantelimon|dobroesti|fundeni|chitila|mogosoaia|tunari|stefanesti|afumati|cernica|glina|vidra|balotesti|corbeanca|snagov|ciorogarla|dragomiresti|darasti|copaceni|militari|rahova|ghencea|titan|pallady|colentina|tei|floreasca|dorobanti|aviatiei|baneasa|cotroceni|crangasi|giulesti|drumul|taberei|vitan|dristor|unirii|tineretului|obor|iancului|moșilor|mosilor|lujerului|gorjului|pacii|apusului|uverturii|timisoara|iuliu|maniu|brancoveanu|oltenitei|giurgiului|ferentari|sebastian|panduri|grozavesti|politehnica|regie)$/;

  function etajFrom(t) {
    var m = RX_ETAJ.exec(t) || RX_ETAJ2.exec(t), e = null, tot = null;
    if (m) { var v = m[1]; e = /^p/.test(v) ? 'P' : /^d/.test(v) ? 'D' : /^m/.test(v) ? 'M' : String(parseInt(v, 10)); if (m[2]) tot = parseInt(m[2], 10); }
    else { var m3 = RX_ETAJ3.exec(t); if (m3 && +m3[1] <= 30 && +m3[2] <= 30 && +m3[1] <= +m3[2]) { e = String(+m3[1]); tot = +m3[2]; } }
    return { etaj: e, etajeTotal: tot };
  }
  function anFrom(t) {
    var m = RX_AN.exec(t); if (m) return +(m[1] || m[2]);
    var all = []; t.replace(RX_AN_SOLO, function (x) { all.push(+x); return x; });
    // un singur an plauzibil în text și fără alte numere de 4 cifre → probabil anul blocului
    return all.length === 1 ? all[0] : null;
  }
  function stradaFrom(raw) {
    var t = norm(raw);
    var m = RX_STRADA.exec(t); if (!m) return null;
    var words = [], ws = m[2].split(' '), nrInline = null;
    for (var i = 0; i < ws.length; i++) {
      var w = ws[i]; if (!w) continue;
      if (STOP_STRADA.test(w) || /^[-–—|,.·\/]/.test(w)) break;
      if (words.length && LOC_STOP.test(w)) break;
      if (/^\d{1,3}[a-z]?$/.test(w)) { var nx = ws[i + 1] || ''; if (!/^(cam|camere|mp|m2|m|ml|metri|etaj|et|locuri|loc|bai|ani|min|minute|km|euro|eur|e|lei|dormitoare|nivel|niveluri|balcoane|terase)\b/.test(nx)) nrInline = w; break; }
      if (/^\d/.test(w)) break;
      words.push(w);
    }
    var tip = TIP_STRADA[m[1]] || 'Str.';
    while (words.length > 1 && TIP_STRADA[words[0]]) { tip = TIP_STRADA[words[0]]; words.shift(); }
    if (!words.length || words[0].length < 3) return null;
    var name = words.slice(0, 4).map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
    var rest = t.slice(m.index + m[0].length, m.index + m[0].length + 40);
    var nr = RX_NR.exec(rest) || RX_NR.exec(t); var bl = RX_BLOC.exec(rest) || RX_BLOC.exec(t);
    var nrv = nr ? nr[1].replace(/\s+/g, '').toUpperCase() : nrInline ? nrInline.toUpperCase() : null;
    return { strada: tip + ' ' + name, cheie: norm(name), nr: nrv, bloc: bl ? bl[1].toUpperCase() : null };
  }

  function extract(text, extra) {
    var t = norm(text), o = {};
    o.lift = RX.faraLift.test(t) ? false : RX.lift.test(t) ? true : null;
    o.reabilitat = RX.nereabilitat.test(t) ? false : RX.reabilitat.test(t) ? true : null;
    o.material = RX.caramida.test(t) ? 'caramida' : RX.panou.test(t) ? 'panou' : RX.bca.test(t) ? 'bca' : RX.beton.test(t) ? 'beton' : null;
    o.ultim = RX.ultim.test(t) || null;
    // ce e deasupra ultimului etaj (proprietate a blocului): etaj tehnic / șarpantă (pod, mansardă) / terasă (acoperiș plat)
    o.acoperis = RX.etajTehnic.test(t) ? 'etajTehnic' : (RX.sarpanta.test(t) || /mansarda deasupra|cu mansarda|pod deasupra|bloc cu mansarda/.test(t)) ? 'sarpanta' : (RX.terasa.test(t) && (o.ultim || /bloc cu terasa|acoperis (plat|terasa|tip terasa)/.test(t))) ? 'terasa' : null;
    o.penthouse = RX.penthouse.test(t) || null;
    o.bai = RX.bai3.test(t) ? 3 : RX.bai2.test(t) ? 2 : null;
    o.boxa = RX.boxa.test(t) || null;
    o.incalzire = RX.pompa.test(t) ? 'pompa' : RX.centrala.test(t) ? 'centrala' : RX.termoficare.test(t) ? 'termoficare' : null;
    o.cert = RX.certA.test(t) ? 'A' : RX.certB.test(t) ? 'B' : RX.certC.test(t) ? 'C' : RX.certDEFG.test(t) ? 'D' : null;
    o.vedere = RX.panoramic.test(t) ? 'panoramic' : RX.parc.test(t) ? 'parc' : RX.stradal.test(t) ? 'zgomot' : RX.curte.test(t) ? 'liniste' : null;
    o.tva = RX.tvaPlus.test(t) ? 'plus' : RX.tvaInclus.test(t) ? 'inclus' : null;
    o.balcon = /fara balcon|nu are balcon/.test(t) ? 'nu' : /\bteras[ae]\b|2 balcoane|doua balcoane|balcoane/.test(t) ? 'terasa' : /\bbalcon|\blogi[ea]\b/.test(t) ? 'da' : null;
    o.stadiu = RX.constructie.test(t) ? 'constructie' : RX.finalizat.test(t) ? 'finalizat' : null;
    o.parcare = RX.faraParcare.test(t) ? false : RX.garaj.test(t) ? 'garaj' : RX.parcare.test(t) ? true : null;
    o.comision0 = RX.comision0.test(t) || null;
    o.proprietar = RX.proprietar.test(t) || null;
    o.compart = RX.semidecomandat.test(t) ? 'semidecomandat' : RX.nedecomandat.test(t) ? 'nedecomandat' : RX.decomandat.test(t) ? 'decomandat' : null;
    o.stare = RX.lux.test(t) ? 'premium' : RX.deRenovat.test(t) ? 'renovare' : RX.renovat.test(t) ? 'renovat' : null;
    o.mobilat = RX.nemobilat.test(t) ? false : RX.mobilat.test(t) ? true : null;
    o.seismic = RX.bulina.test(t) ? 'rs1' : RX.consolidat.test(t) ? 'consolidat' : null;
    o.juridic = RX.ipoteca.test(t) ? 'ipoteca' : RX.intabulat.test(t) ? 'ok' : null;
    o.inchiriat = RX.inchiriat.test(t) ? true : RX.liber.test(t) ? false : null;
    o.orientare = RX.orientSud.test(t) ? 'S' : RX.orientNord.test(t) ? 'N' : null;
    o.vedereDubla = RX.vedereDubla.test(t) || null;
    o.metrouText = RX.metrou.test(t) || null;
    var et = etajFrom(t); o.etaj = et.etaj; o.etajeTotal = et.etajeTotal;
    if (o.etaj == null && RX.parter.test(t)) o.etaj = 'P';
    if (o.etaj == null && RX.demisol.test(t)) o.etaj = 'D';
    if (o.etaj == null && /\bla mansarda\b|apartament (la |in )?mansarda|mansarda (de vanzare|cu)|garsoniera (la |in )?mansarda/.test(t)) o.etaj = 'M';
    o.an = anFrom(t);
    var cm = RX_CAMERE.exec(t); o.camere = cm ? +cm[1] : (RX.garsoniera.test(t) || RX.studio.test(t) ? 1 : null);
    var it = RX_INTRETINERE.exec(t); o.intretinere = it ? +it[1] : null;
    var tr = RX_MP_TEREN.exec(t); o.teren = tr ? +(tr[1] || tr[2]) : null;
    // case: tip, regim de înălțime, structură, stadiu, utilități, drum
    o.tipCasa = /\bduplex\b/.test(t) ? 'duplex' : /\btriplex\b|insiruit|in sir\b|casa in sir/.test(t) ? 'insiruita' : /curte comuna|in curte comuna/.test(t) ? 'curte-comuna' : /individual|singur(a)? in curte|vila singulara|casa singulara|neinsiruit|independenta/.test(t) ? 'individuala' : null;
    o.regim = /\bp\s*\+\s*1\s*\+\s*m\b|parter,? etaj si mansarda|p\+1\+m/.test(t) ? 'P+1+M' : /\bp\s*\+\s*[2-9]\b|\bd\s*\+\s*p\s*\+\s*[2-9]|s\+p\+[2-9]|p\+2e/.test(t) ? 'P+2' : /\bp\s*\+\s*1\s*\+\s*(e|pod|terasa)|\bp\s*\+\s*1\b|parter (si|plus|\+) etaj|\bd\s*\+\s*p\s*\+\s*1\b|s\+p\+1|p\+1e/.test(t) ? 'P+1' : /\bp\s*\+\s*m\b|parter (si|plus|\+) mansarda/.test(t) ? 'P+M' : /pe un singur nivel|un singur nivel|doar parter|casa parter\b|casa pe parter|\bparter(,| -| –)|tip parter/.test(t) ? 'P' : null;
    o.structura = /\bbca\b/.test(t) ? 'bca' : /caramida|zidarie/.test(t) ? 'caramida' : /\blemn\b|structura (de|din) lemn|casa din lemn|prefabricat/.test(t) ? 'lemn' : /chirpici|paianta|pamant batut/.test(t) ? 'chirpici' : null;
    if (/la rosu\b/.test(t)) o.stareCasa = 'rosu'; else if (/la gri\b|semifinisat/.test(t)) o.stareCasa = 'gri'; else if (/la cheie\b/.test(t)) { if (!o.stadiu) o.stadiu = 'finalizat'; }
    o.utilCanal = /\bcanalizare\b/.test(t) && !/fara canalizare/.test(t) ? true : /\bfosa\b|fara canalizare|bazin vidanjabil/.test(t) ? false : null;
    o.utilGaz = /fara gaz/.test(t) ? false : /\bgaze?\b|racordat la gaz|gaz la poarta|centrala pe gaz/.test(t) ? true : null;
    o.asfalt = /neasfaltat|drum pietruit|drum de pamant|strada pietruita/.test(t) ? false : /asfaltat|drum asfalt|strada asfalt|acces asfalt/.test(t) ? true : null;
    o.garaj = /\bgaraj\b/.test(t) || null; o.piscina = /piscina/.test(t) || null;
    var fr = /front(?: stradal| la strada)?(?: de)?\s*(?::|de)?\s*([\d.,]+)\s*(?:m\b|ml\b|metri)/.exec(t) || /deschidere(?: la strada| de)?\s*(?::)?\s*([\d.,]+)\s*(?:m\b|ml\b|metri)/.exec(t); o.front = fr ? num(fr[1]) : null;
    var st = stradaFrom(text); if (st) { o.strada = st.strada; o.stradaCheie = st.cheie; o.nr = st.nr; o.bloc = st.bloc; }
    else { var bl = RX_BLOC.exec(t); if (bl) o.bloc = bl[1].toUpperCase(); }
    if (extra && extra.strada && !o.strada) { var s2 = stradaFrom('Strada ' + extra.strada); if (s2) { o.strada = s2.strada; o.stradaCheie = s2.cheie; } if (extra.nr && !o.nr) o.nr = String(extra.nr).toUpperCase(); }
    Object.keys(o).forEach(function (k) { if (o[k] == null) delete o[k]; });
    return o;
  }
  // cheia unei clădiri: strada + numărul (fără bloc, ca să prindă și anunțurile care dau doar numărul)
  function cladire(o) { if (!o || !o.stradaCheie || !o.nr) return null; return o.stradaCheie + '|' + String(o.nr).toUpperCase(); }
  // lista de semnale scurte, pentru afișare
  var LABELS = { lift: ['lift', 'fără lift'], reabilitat: ['reabilitat termic', 'nereabilitat'], boxa: ['boxă'], penthouse: ['penthouse'], comision0: ['comision 0'], proprietar: ['proprietar'], mobilat: ['mobilat', 'nemobilat'], vedereDubla: ['vedere dublă'], ultim: ['ultimul etaj'], garaj: ['garaj'], piscina: ['piscină'], utilCanal: ['canalizare', 'fosă'], utilGaz: ['gaze', 'fără gaze'], asfalt: ['asfalt', 'neasfaltat'] };
  var LABEL_V = { material: { caramida: 'cărămidă', panou: 'panouri', beton: 'beton', bca: 'BCA' }, acoperis: { terasa: 'bloc cu terasă', sarpanta: 'acoperiș șarpantă / pod', etajTehnic: 'etaj tehnic deasupra' }, incalzire: { centrala: 'centrală', termoficare: 'termoficare', pompa: 'pardoseală/pompă' }, cert: { A: 'clasa A', B: 'clasa B', C: 'clasa C', D: 'clasa D+' }, tva: { plus: '+TVA', inclus: 'TVA inclus' }, stadiu: { constructie: 'în construcție', finalizat: 'finalizat' }, vedere: { zgomot: 'stradal', liniste: 'curte', parc: 'vedere parc', panoramic: 'panoramic' }, compart: { decomandat: 'decomandat', semidecomandat: 'semidecomandat', nedecomandat: 'nedecomandat' }, stare: { premium: 'lux', renovat: 'renovat', renovare: 'de renovat' }, orientare: { S: 'sud', N: 'nord' }, parcare: { garaj: 'garaj' }, tipCasa: { individuala: 'individuală', duplex: 'duplex', insiruita: 'înșiruită', 'curte-comuna': 'curte comună' }, regim: { P: 'parter', 'P+M': 'P+M', 'P+1': 'P+1', 'P+1+M': 'P+1+M', 'P+2': 'P+2' }, structura: { caramida: 'cărămidă', bca: 'BCA', lemn: 'lemn', chirpici: 'chirpici' }, stareCasa: { rosu: 'la roșu', gri: 'la gri' } };
  function labels(o) {
    var out = [];
    if (!o) return out;
    Object.keys(LABELS).forEach(function (k) { if (o[k] === true) out.push(LABELS[k][0]); else if (o[k] === false && LABELS[k][1]) out.push(LABELS[k][1]); });
    Object.keys(LABEL_V).forEach(function (k) { var v = o[k]; if (v != null && LABEL_V[k][v]) out.push(LABEL_V[k][v]); });
    if (o.parcare === true) out.push('parcare'); else if (o.parcare === false) out.push('fără parcare');
    if (o.bai) out.push(o.bai + ' băi');
    if (o.strada) out.push(o.strada + (o.nr ? ' ' + o.nr : '') + (o.bloc ? ', bl. ' + o.bloc : ''));
    return out;
  }
  root.NV_SEMNE = { norm: norm, extract: extract, cladire: cladire, labels: labels, stradaFrom: stradaFrom, RX: RX };
})(typeof window !== 'undefined' ? window : globalThis);
