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
      li.className = 'history-item';
      li.setAttribute('role', 'button');
      li.tabIndex = 0;
      li.setAttribute('aria-label', t('profile.history.open', 'Open receipt') + ': ' + (o.totalText || ''));
      var a = document.createElement('span'); a.textContent = new Date(o.at).toLocaleString() + ' · ' + (o.items || []).map(function (i) { return i.qty + '× ' + i.name; }).join(', ');
      var b = document.createElement('b'); b.textContent = o.totalText || '';
      li.appendChild(a); li.appendChild(b);
      li.addEventListener('click', function () { openReceipt(o); });
      li.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openReceipt(o); }
      });
      ul.appendChild(li);
    });
    if (empty) empty.hidden = list.length > 0;
  }
  // Open the full receipt (Cart Mandate + evidence + refund actions) for a past order.
  // This delegates to app.js, which fetches each section server-side by order id; the shell
  // only decides *which* order and switches to the panel where the receipt renders.
  function openReceipt(o) {
    if (!o || !o.orderId) return;
    var render = window.AICAFE && window.AICAFE.renderReceipt;
    if (!render) return;
    render({
      orderId: o.orderId,
      items: o.items || [],
      totalText: o.totalText || '',
      maskedId: o.maskedId || '',
      decision: o.decision,
      status: o.status || 'COMPLETED'
    });
    if (window.AiCafeShell && window.AiCafeShell.go) window.AiCafeShell.go('cart');
  }
  window.addEventListener('aicafe:receipt', function (e) {
    var d = (e && e.detail) || {}; var a = readHistory();
    if (d.orderId && a.some(function (o) { return o.orderId === d.orderId; })) return;
    a.unshift({ at: d.at || Date.now(), orderId: d.orderId || '', totalText: d.totalText || '', maskedId: d.maskedId || '', decision: d.decision, status: d.status || 'COMPLETED', items: (d.items || []).map(function (i) { return { qty: i.qty, name: i.name }; }) });
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
