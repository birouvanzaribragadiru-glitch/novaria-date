// Câmp de zonă cu căutare: scrii „avia” și apare „Aviatorilor / Kiseleff”.
// Fără diacritice, pe bucăți de cuvânt, cu aliasuri (străzi și repere cunoscute) și cu o greșeală de tastare tolerată.
// Îmbunătățește un <select> existent: selectul rămâne sursa valorii (îl ascundem și îi trimitem „change” la alegere),
// deci tot codul care citește/ascultă selectul merge ca înainte. Folosit în aplicație și în evaluatorul de pe site.
(function (root) {
  function fold(c) { var x = c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); x = x.charAt(0) || ' '; return /[a-z0-9]/.test(x) ? x : ' '; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function words(s) { return s ? s.split(' ').filter(Boolean) : []; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // distanța de editare, oprită devreme (ne interesează doar ≤ 2)
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur, i, j; for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) { cur = [i]; var best = i; for (j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (cur[j] < best) best = cur[j]; } if (best > max) return max + 1; prev = cur; }
    return prev[b.length];
  }
  function prep(it) {
    var n = norm(it.t), a = (it.keys || []).map(norm).filter(Boolean), g = norm(it.g || '');
    it._n = n; it._nw = words(n); it._a = a; it._aw = [].concat.apply([], a.map(words)); it._g = g; it._gw = words(g);
    return it;
  }
  function score(it, q, qt) {
    var n = it._n, s = 0;
    if (!q) return 1;
    if (n === q) return 1000;
    if (n.indexOf(q) === 0) return 900 - n.length / 100;
    if (it._nw.some(function (w) { return w.indexOf(q) === 0; })) s = Math.max(s, 800);
    if (it._a.some(function (a) { return a === q; })) s = Math.max(s, 760);
    if (it._a.some(function (a) { return a.indexOf(q) === 0; })) s = Math.max(s, 700);
    if (it._aw.some(function (w) { return w.indexOf(q) === 0; })) s = Math.max(s, 640);
    if (s) return s;
    var pool = it._nw.concat(it._aw, it._gw);
    if (qt.length > 1 && qt.every(function (t) { return pool.some(function (w) { return w.indexOf(t) === 0; }); })) return 560 + (qt.filter(function (t) { return it._nw.some(function (w) { return w.indexOf(t) === 0; }); }).length * 10);
    if (q.length >= 6 && n.indexOf(q) > 0) return 450;
    if (q.length >= 6 && it._a.some(function (a) { return a.indexOf(q) > 0; })) return 380;
    // o literă greșită / lipsă / în plus (două la cuvinte lungi)
    var typo = qt.length && qt.every(function (t) {
      if (t.length < 4) return pool.some(function (w) { return w.indexOf(t) === 0; });
      var mx = t.length >= 7 ? 2 : 1;
      return pool.some(function (w) { return lev(t, w.slice(0, t.length), mx) <= mx || lev(t, w, mx) <= mx; });
    });
    if (typo) return 250;
    if (q.length >= 3 && it._g.indexOf(q) >= 0) return 120;
    return 0;
  }
  function search(items, q, max) {
    q = norm(q); var qt = words(q), out = [];
    items.forEach(function (it) { var sc = score(it, q, qt); if (sc > 0) out.push({ it: it, sc: sc }); });
    if (q) out.sort(function (a, b) { return b.sc - a.sc || a.it._n.localeCompare(b.it._n); });
    return out.slice(0, max || 1e9).map(function (x) { return x.it; });
  }
  // evidențiază în textul original partea potrivită (pe text „împăturit”, caracter cu caracter)
  function hl(text, q) {
    q = norm(q); if (!q) return esc(text);
    var f = ''; for (var i = 0; i < text.length; i++) f += fold(text[i]);
    var re = new RegExp('(^|[^a-z0-9])(' + words(q).map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('[^a-z0-9]+') + ')'), m = re.exec(f);
    if (!m) { var t0 = words(q)[0], k = f.indexOf(t0); if (k < 0 || !t0) return esc(text); m = { index: k, 1: '', 2: t0 }; }
    var st = m.index + m[1].length, en = st + m[2].length;
    return esc(text.slice(0, st)) + '<mark>' + esc(text.slice(st, en)) + '</mark>' + esc(text.slice(en));
  }

  var uid = 0;
  // sel: <select>; opt: { items(sel) → [{v,t,g,keys}], placeholder, blankItem (text sau null), onPick }
  function attach(sel, opt) {
    if (!sel || sel._zc) return sel && sel._zc;
    opt = opt || {};
    var id = 'zc' + (++uid), items = (opt.items ? opt.items(sel) : fromSelect(sel)).map(prep);
    var blank = opt.blankItem != null ? opt.blankItem : null;
    var wrap = document.createElement('div'); wrap.className = 'zc' + (opt.cls ? ' ' + opt.cls : '');
    var inp = document.createElement('input');
    inp.type = 'text'; inp.className = (opt.inputClass || 'inp') + ' zc-inp'; inp.autocomplete = 'off'; inp.spellcheck = false;
    inp.setAttribute('autocapitalize', 'off'); inp.setAttribute('enterkeyhint', 'done');
    inp.setAttribute('role', 'combobox'); inp.setAttribute('aria-autocomplete', 'list'); inp.setAttribute('aria-expanded', 'false'); inp.setAttribute('aria-controls', id + 'l');
    inp.placeholder = opt.placeholder || 'Scrie zona: ex. Aviatorilor, Berceni, Bragadiru';
    var lab = sel.id && document.querySelector('label[for="' + sel.id + '"]');
    inp.id = sel.id ? sel.id + '_q' : id + 'q'; if (lab) lab.setAttribute('for', inp.id); else if (sel.getAttribute('aria-label')) inp.setAttribute('aria-label', sel.getAttribute('aria-label'));
    if (!lab && !inp.getAttribute('aria-label')) { var pl = sel.closest('label'); if (pl) { var sp = pl.querySelector('span'); if (sp) inp.setAttribute('aria-label', sp.textContent); } }
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'zc-tog'; btn.tabIndex = -1; btn.setAttribute('aria-label', 'Arată toate zonele'); btn.innerHTML = '<span aria-hidden="true"></span>';
    var list = document.createElement('div'); list.className = 'zc-list'; list.id = id + 'l'; list.setAttribute('role', 'listbox'); list.hidden = true;
    sel.parentNode.insertBefore(wrap, sel); wrap.appendChild(inp); wrap.appendChild(btn); wrap.appendChild(list); wrap.appendChild(sel);
    sel.hidden = true; sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    var shown = [], act = -1, open = false, typed = false;
    function cur() { for (var i = 0; i < items.length; i++) if (items[i].v === sel.value) return items[i]; return null; }
    function showText() { var c = cur(); inp.value = c ? c.t : (sel.value === '' && blank && opt.showBlankText ? blank : ''); }
    function render(q) {
      shown = q ? search(items, q, 40) : items.slice();
      if (!q && blank) shown.unshift({ v: '', t: blank, g: '', _blank: true });
      var h = '', lastG = null;
      if (!shown.length) h = '<div class="zc-empty">Nicio zonă găsită pentru „' + esc(q) + '”. Încearcă numele cartierului sau al localității.</div>';
      shown.forEach(function (it, i) {
        if (!q && it.g && it.g !== lastG) { h += '<div class="zc-g" role="presentation">' + esc(it.g) + '</div>'; lastG = it.g; }
        h += '<div class="zc-o' + (it.v === sel.value && !it._blank ? ' sel' : '') + (it._blank ? ' blank' : '') + '" role="option" id="' + id + 'o' + i + '" data-i="' + i + '" aria-selected="' + (i === act) + '"><span class="t">' + (q ? hl(it.t, q) : esc(it.t)) + '</span>' + (q && it.g ? '<small>' + esc(it.g) + '</small>' : '') + '</div>';
      });
      list.innerHTML = h;
      setAct(q ? (shown.length ? 0 : -1) : Math.max(-1, shown.indexOf(cur())), !q);
    }
    function setAct(i, center) {
      act = i; var els = list.querySelectorAll('.zc-o');
      for (var k = 0; k < els.length; k++) { var on = +els[k].getAttribute('data-i') === i; els[k].classList.toggle('act', on); els[k].setAttribute('aria-selected', on ? 'true' : 'false'); }
      var el = i >= 0 && list.querySelector('[data-i="' + i + '"]');
      if (el) { inp.setAttribute('aria-activedescendant', el.id); var top = el.offsetTop, bot = top + el.offsetHeight; if (center) list.scrollTop = Math.max(0, top - list.clientHeight / 2); else if (top < list.scrollTop) list.scrollTop = top; else if (bot > list.scrollTop + list.clientHeight) list.scrollTop = bot - list.clientHeight; }
      else inp.removeAttribute('aria-activedescendant');
    }
    function doOpen(q) { open = true; list.hidden = false; wrap.classList.add('open'); inp.setAttribute('aria-expanded', 'true'); render(q); }
    function doClose() { open = false; list.hidden = true; wrap.classList.remove('open'); inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); }
    function pick(it) {
      doClose(); typed = false;
      var v = it ? it.v : '';
      if (sel.value !== v || opt.alwaysFire) {
        // valoare nouă: o punem în select și anunțăm codul existent (care poate redesena tot formularul)
        if (!Array.prototype.some.call(sel.options, function (o) { return o.value === v; })) { var o = document.createElement('option'); o.value = v; o.textContent = it ? it.t : ''; sel.appendChild(o); }
        sel.value = v; showText();
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        if (opt.onPick) opt.onPick(v, it);
      } else showText();
    }
    inp.addEventListener('focus', function () { setTimeout(function () { try { inp.select(); } catch (e) { } }, 0); if (!open) doOpen(''); if (opt.scrollOnFocus !== false && window.innerWidth < 700) { try { var rt = wrap.getBoundingClientRect().top; if (rt > 140 || rt < 60) window.scrollBy({ top: rt - 96, behavior: 'smooth' }); } catch (e) { } } });
    inp.addEventListener('click', function () { if (!open) doOpen(typed ? inp.value : ''); });
    inp.addEventListener('input', function () { typed = true; if (!open) doOpen(inp.value); else render(inp.value); });
    inp.addEventListener('keydown', function (e) {
      var k = e.key;
      if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); if (!open) { doOpen(typed ? inp.value : ''); return; } if (!shown.length) return; var n = act + (k === 'ArrowDown' ? 1 : -1); if (n < 0) n = shown.length - 1; if (n >= shown.length) n = 0; setAct(n); }
      else if (k === 'Enter') { if (open && act >= 0 && shown[act]) { e.preventDefault(); pick(shown[act]._blank ? null : shown[act]); } else if (open) e.preventDefault(); }
      else if (k === 'Escape') { if (open) { e.preventDefault(); e.stopPropagation(); doClose(); showText(); typed = false; } }
      else if (k === 'Tab') { if (open && typed && act >= 0 && shown[act]) pick(shown[act]._blank ? null : shown[act]); else doClose(); }
    });
    inp.addEventListener('blur', function () {
      setTimeout(function () {
        if (wrap.contains(document.activeElement)) return;
        if (typed) {
          var q = inp.value.trim();
          if (!q && (blank || opt.allowEmpty)) { pick(null); return; }
          var r = q ? search(items, q, 2) : [];
          if (r.length === 1 || (r.length && norm(r[0].t) === norm(q))) { pick(r[0]); return; }
        }
        doClose(); typed = false; showText();
      }, 120);
    });
    list.addEventListener('mousedown', function (e) { e.preventDefault(); });
    list.addEventListener('click', function (e) { var o = e.target.closest('.zc-o'); if (!o) return; var it = shown[+o.getAttribute('data-i')]; pick(it && !it._blank ? it : null); });
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    btn.addEventListener('click', function () { if (open) { doClose(); return; } inp.focus(); if (!open) doOpen(''); });
    showText();
    sel._zc = { input: inp, wrap: wrap, refresh: showText, open: doOpen, close: doClose, setItems: function (xs) { items = xs.map(prep); showText(); } };
    return sel._zc;
  }
  function fromSelect(sel) {
    var out = [];
    Array.prototype.forEach.call(sel.querySelectorAll('option'), function (o) { if (!o.value) return; var g = o.parentNode && o.parentNode.tagName === 'OPTGROUP' ? o.parentNode.getAttribute('label') : ''; out.push({ v: o.value, t: o.textContent, g: g, keys: [] }); });
    return out;
  }
  root.NV_ZCOMBO = { attach: attach, search: search, norm: norm, hl: hl, fromSelect: fromSelect, prep: prep };
})(typeof window !== 'undefined' ? window : globalThis);
