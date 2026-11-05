/* AI Café — storefront shell: Home / Barista / Cart / Profile.
 * Same four destinations and order as the Flutter app. Pure presentation: it only shows and hides the
 * existing sections and mirrors the cart state. It never calls the API and never touches payment code. */
(function () {
  'use strict';
  var TABS = ['home', 'barista', 'cart', 'profile'];
  var HKEY = 'aicafe.orderHistory.v1';
  var $ = function (id) { return document.getElementById(id); };
  function t(k, fb) { try { var v = window.i18n && window.i18n.t(k); return v && v !== k ? v : fb; } catch (e) { return fb; } }

  function orderRoute(value) {
    if (value.indexOf('order/') !== 0) return null;
    try { return decodeURIComponent(value.slice(6)); } catch (e) { return ''; }
  }
  function go(name) {
    if (name && name.charAt(0) === '#') { var target = document.querySelector(name); if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    var orderId = orderRoute(name);
    if (!orderId && TABS.indexOf(name) < 0) name = 'home';
    var selected = orderId ? 'order' : name;
    TABS.forEach(function (n) {
      var p = $('panel-' + n), b = $('tab-' + n);
      if (p) p.hidden = n !== selected;
      if (b) b.setAttribute('aria-selected', n === (orderId ? 'profile' : selected) ? 'true' : 'false');
    });
    var orderPanel = $('panel-order'); if (orderPanel) orderPanel.hidden = !orderId;
    try {
      var route = orderId ? '#order/' + encodeURIComponent(orderId) : '#' + name;
      if (location.hash !== route) history.replaceState(null, '', route);
    } catch (e) { /* ignore */ }
    window.scrollTo(0, 0);
    syncPill();
    if (orderId && window.AICAFE && window.AICAFE.openOrder) window.AICAFE.openOrder(orderId);
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

  // ---- order history: server-owned orders plus explicitly marked local legacy copies --------
  function readHistory() { try { return JSON.parse(localStorage.getItem(HKEY) || '[]'); } catch (e) { return []; } }
  function writeHistory(a) { try { localStorage.setItem(HKEY, JSON.stringify(a.slice(0, 20))); } catch (e) { /* storage unavailable */ } }
  function historyRows(serverOrders) {
    var local = readHistory(), owned = {}, rows = [];
    (serverOrders || []).forEach(function (order) {
      owned[order.id] = true;
      rows.push({ data: order, localOnly: false });
    });
    local.forEach(function (order) {
      if (!order.orderId || !owned[order.orderId]) rows.push({ data: order, localOnly: true });
    });
    return rows;
  }
  function orderDate(value) {
    var date = new Date(value);
    if (isNaN(date.getTime())) return '—';
    return window.i18n && window.i18n.formatDate ? window.i18n.formatDate(date) : date.toLocaleString();
  }
  function statusLabel(status) {
    if (!status) return '—';
    var key = 'order.status.' + status, value = t(key, key);
    return value === key ? status : value;
  }
  function renderHistory(serverOrders) {
    var ul = $('order-history'), empty = $('order-history-empty'); if (!ul) return;
    var rows = historyRows(serverOrders), list = rows;
    ul.textContent = '';
    list.forEach(function (row) {
      var o = row.data, li = document.createElement('li'); li.className = 'history-item';
      var summary = document.createElement('span'); summary.className = 'history-summary';
      var items = (o.items || []).map(function (i) {
        return (i.quantity !== undefined ? i.quantity : i.qty) + '× ' + i.name;
      }).join(', ');
      var dateText = orderDate(row.localOnly ? (o.at || o.createdAt) : o.createdAt);
      var main = document.createElement('span');
      var refundStatus = (o.refunds || []).map(function (refund) {
        var key = {
          UNDER_REVIEW: 'refund.status.review',
          BEING_PROCESSED: 'refund.status.processing',
          REFUNDED: 'refund.status.refunded',
          DECLINED: 'refund.status.declined'
        }[refund.status];
        return key ? t(key, refund.status) : refund.status;
      }).filter(Boolean).join(', ');
      main.textContent = [items, dateText, statusLabel(o.status), refundStatus].filter(Boolean).join(' · ');
      var meta = document.createElement('small');
      meta.textContent = row.localOnly
        ? [o.totalText || '', t('profile.deviceOnly', 'Saved on this device')].filter(Boolean).join(' · ')
        : (o.totalFormatted || '');
      summary.appendChild(main); summary.appendChild(meta);
      var button = document.createElement('button'); button.type = 'button'; button.textContent = t('order.view', 'View details');
      button.setAttribute('aria-label', t('order.view', 'View details') + ': ' + (o.totalFormatted || o.totalText || ''));
      button.addEventListener('click', function () { openOrder(o, row.localOnly); });
      li.appendChild(summary); li.appendChild(button);
      ul.appendChild(li);
    });
    if (empty) empty.hidden = list.length > 0;
  }
  function openOrder(o, localOnly) {
    if (!o) return;
    var id = localOnly ? o.orderId : o.id;
    if (id) go('order/' + encodeURIComponent(id));
  }
  window.addEventListener('aicafe:receipt', function (e) {
    var d = (e && e.detail) || {}; var a = readHistory();
    if (d.orderId && a.some(function (o) { return o.orderId === d.orderId; })) return;
    a.unshift({ at: d.at || new Date().toISOString(), orderId: d.orderId || '', totalText: d.totalText || '', maskedId: d.maskedId || '', decision: d.decision, status: d.status || 'PAID', items: (d.items || []).map(function (i) { return { qty: i.qty, name: i.name, price: i.price }; }) });
    writeHistory(a); refreshHistory();
  });
  var historyRequest = 0;
  function refreshHistory() {
    var version = ++historyRequest;
    renderHistory([]);
    if (!window.AICAFE || !window.AICAFE.loadOrders) return;
    window.AICAFE.loadOrders().then(function (orders) {
      if (version === historyRequest) renderHistory(orders);
    }).catch(function () {
      if (version === historyRequest) renderHistory([]);
    });
  }

  function init() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-go]') : null; if (b) go(b.getAttribute('data-go'));
    });
    var mo = new MutationObserver(syncPill);
    ['cart', 'total'].forEach(function (id) { var n = $(id); if (n) mo.observe(n, { childList: true, subtree: true, characterData: true }); });
    if (window.i18n) { var prev = window.i18n.onChange; window.i18n.onChange = function (l) { if (typeof prev === 'function') prev(l); syncPill(); refreshHistory(); }; }
    window.addEventListener('hashchange', function () {
      var h = location.hash.replace('#', '');
      if (TABS.indexOf(h) >= 0 || orderRoute(h) !== null) go(h);
    });
    refreshHistory();
    var h = location.hash.replace('#', '');
    go(TABS.indexOf(h) >= 0 || orderRoute(h) !== null ? h : 'home');
  }
  window.AiCafeShell = {
    go: go,
    findLocalOrder: function (id) {
      return readHistory().find(function (order) { return order.orderId === id; }) || null;
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
