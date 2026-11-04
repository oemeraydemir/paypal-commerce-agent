/* AI Café — storefront shell: Home / Barista / Cart / Profile.
 * Same four destinations and order as the Flutter app. Pure presentation: it only shows and hides the
 * existing sections and mirrors the cart state. It never calls the API and never touches payment code. */
(function () {
  'use strict';
  var TABS = ['home', 'barista', 'cart', 'profile'];
  var HKEY = 'aicafe.orderHistory.v1';
  var $ = function (id) { return document.getElementById(id); };
  function t(k, fb) { try { var v = window.i18n && window.i18n.t(k); return v && v !== k ? v : fb; } catch (e) { return fb; } }

  function go(name) {
    if (name && name.charAt(0) === '#') { var target = document.querySelector(name); if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (TABS.indexOf(name) < 0) name = 'home';
    TABS.forEach(function (n) {
      var p = $('panel-' + n), b = $('tab-' + n);
      if (p) p.hidden = n !== name;
      if (b) { b.setAttribute('aria-selected', n === name ? 'true' : 'false'); }
    });
    try { if (location.hash.replace('#', '') !== name) history.replaceState(null, '', '#' + name); } catch (e) { /* ignore */ }
    window.scrollTo(0, 0);
    syncPill();
  }

  // ---- cart mirror (read-only): count + total come from the DOM app.js already renders -------
  function cartState() {
    var items = document.querySelectorAll('#cart .item');
    var n = 0;
    items.forEach(function (it) {
      var q = it.querySelector('.q span'); var v = q ? parseInt(q.textContent, 10) : 1; n += isNaN(v) ? 1 : v;
    });
    var tot = $('total'); return { count: n, rows: items.length, total: tot ? tot.textContent : '' };
  }
  function syncPill() {
    var s = cartState();
    var badge = $('cart-badge'); if (badge) { badge.hidden = s.rows === 0; badge.textContent = String(s.count); }
    var pill = $('cart-pill');
    if (pill) {
      var onBarista = !$('panel-barista').hidden;
      pill.hidden = !(onBarista && s.rows > 0);
      pill.textContent = t('cart.pill', 'View cart') + ' · ' + s.count + ' · ' + s.total;
    }
  }

  // ---- order history (this browser only; written when app.js reports a paid receipt) ---------
  function readHistory() { try { return JSON.parse(localStorage.getItem(HKEY) || '[]'); } catch (e) { return []; } }
  function writeHistory(a) { try { localStorage.setItem(HKEY, JSON.stringify(a.slice(0, 20))); } catch (e) { /* storage unavailable */ } }
  function renderHistory() {
    var ul = $('order-history'), empty = $('order-history-empty'); if (!ul) return;
    var list = readHistory(); ul.textContent = '';
    list.forEach(function (o) {
      var li = document.createElement('li');
      var a = document.createElement('span'); a.textContent = new Date(o.at).toLocaleString() + ' · ' + (o.items || []).map(function (i) { return i.qty + '× ' + i.name; }).join(', ');
      var b = document.createElement('b'); b.textContent = o.totalText || '';
      li.appendChild(a); li.appendChild(b); ul.appendChild(li);
    });
    if (empty) empty.hidden = list.length > 0;
  }
  window.addEventListener('aicafe:receipt', function (e) {
    var d = (e && e.detail) || {}; var a = readHistory();
    if (d.orderId && a.some(function (o) { return o.orderId === d.orderId; })) return;
    a.unshift({ at: d.at || Date.now(), orderId: d.orderId || '', totalText: d.totalText || '', items: (d.items || []).map(function (i) { return { qty: i.qty, name: i.name }; }) });
    writeHistory(a); renderHistory();
  });

  function init() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-go]') : null; if (b) go(b.getAttribute('data-go'));
    });
    var mo = new MutationObserver(syncPill);
    ['cart', 'total'].forEach(function (id) { var n = $(id); if (n) mo.observe(n, { childList: true, subtree: true, characterData: true }); });
    if (window.i18n) { var prev = window.i18n.onChange; window.i18n.onChange = function (l) { if (typeof prev === 'function') prev(l); syncPill(); }; }
    window.addEventListener('hashchange', function () { var h = location.hash.replace('#', ''); if (TABS.indexOf(h) >= 0) go(h); });
    renderHistory();
    var h = location.hash.replace('#', ''); go(TABS.indexOf(h) >= 0 ? h : 'home');
  }
  window.AiCafeShell = { go: go };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
